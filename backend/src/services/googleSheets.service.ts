import { google, sheets_v4 } from 'googleapis';
import { config } from '../config/env.config.js';
import { SHEET_SCHEMAS, SheetName } from '../config/sheets.config.js';
import { validateWorksheetHeaders } from '../validation/sheetValidators.js';

/**
 * Converts a 0-indexed column number to standard spreadsheet column letters (e.g. 0 -> A, 25 -> Z, 26 -> AA).
 */
export function getColumnLetter(colIndex: number): string {
  let letter = '';
  let temp = colIndex;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export interface WorksheetMetadata {
  sheetId?: number;
  title?: string;
  rowCount?: number;
  columnCount?: number;
}

export interface WorksheetDiagnostic {
  sheetName: string;
  exists: boolean;
  headersValid: boolean;
  actualHeaders: string[];
  expectedHeaders: readonly string[];
  missingHeaders: string[];
  unexpectedHeaders: string[];
  rowCount?: number;
  status: 'Healthy' | 'MissingSheet' | 'HeaderMismatch' | 'Empty';
}

export interface DatabaseDiagnosticsReport {
  status: 'HEALTHY' | 'ACTION_REQUIRED' | 'UNCONFIGURED';
  isConfigured: boolean;
  configuration: {
    spreadsheetIdMasked: string;
    serviceAccountEmailMasked: string;
    isPrivateKeySet: boolean;
    isEmailConfigured: boolean;
  };
  spreadsheetTitle?: string;
  totalCanonicalSheets: number;
  validSheetsCount: number;
  missingSheetsCount: number;
  headerMismatchCount: number;
  sheets: WorksheetDiagnostic[];
  diagnosedAt: string;
}

export interface DatabaseRepairResult {
  success: boolean;
  performedBy: string;
  repairedAt: string;
  createdSheets: string[];
  initializedHeaders: string[];
  alreadyValidSheets: string[];
  unresolvedIssues: string[];
  message: string;
}

function maskSecret(val?: string, visibleChars = 4): string {
  if (!val || typeof val !== 'string') return 'Not Configured';
  const trimmed = val.trim();
  if (trimmed.length <= visibleChars * 2) return '******';
  return `${trimmed.slice(0, visibleChars)}...${trimmed.slice(-visibleChars)}`;
}

function maskEmail(email?: string): string {
  if (!email || typeof email !== 'string') return 'Not Configured';
  const parts = email.trim().split('@');
  if (parts.length !== 2) return '******';
  const prefix = parts[0].length > 3 ? `${parts[0].slice(0, 3)}***` : '***';
  return `${prefix}@${parts[1]}`;
}

export class GoogleSheetsService {
  private sheetsClient: sheets_v4.Sheets | null = null;
  private mockMode: boolean = config.isTest || process.env.NODE_ENV === 'test';

  /**
   * Check if mock mode is active (always active during tests or when manually set).
   */
  public isMockMode(): boolean {
    return this.mockMode || config.isTest || process.env.NODE_ENV === 'test';
  }

  /**
   * Explicitly enable or disable mock mode.
   */
  public setMockMode(enabled: boolean): void {
    this.mockMode = enabled;
  }

  /**
   * Check if necessary Google Service Account credentials and Spreadsheet ID are configured.
   */
  public isConfigured(): boolean {
    return Boolean(
      config.google.serviceAccountEmail &&
      config.google.privateKey &&
      config.google.spreadsheetId
    );
  }

  /**
   * True only if credentials are configured AND we are NOT in mock/test mode.
   */
  public isLiveApiEnabled(): boolean {
    return !this.isMockMode() && this.isConfigured();
  }

  /**
   * Execute an operation against Google Sheets API with exponential backoff retry.
   * Retries on HTTP 429 (Too Many Requests) and 503 (Service Unavailable),
   * respecting Retry-After headers when provided.
   * Permanent errors (400, 401, 403, 404) are never retried.
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    isWrite = false,
    maxRetries = 3,
    initialDelayMs = 500
  ): Promise<T> {
    let attempt = 0;
    let delay = initialDelayMs;

    while (true) {
      try {
        return await operation();
      } catch (error: any) {
        attempt++;
        const statusCode = error?.status || error?.code || error?.response?.status;

        // Never retry permanent client errors or auth errors
        if (statusCode && [400, 401, 403, 404].includes(Number(statusCode))) {
          throw error;
        }

        // Check if transient error (429 rate limit, 503 service unavailable, 500/502, network reset)
        const isTransient =
          statusCode === 429 ||
          statusCode === 503 ||
          statusCode === 500 ||
          statusCode === 502 ||
          error?.code === 'ECONNRESET' ||
          error?.code === 'ETIMEDOUT';

        if (!isTransient || attempt > maxRetries) {
          throw error;
        }

        // Determine wait duration (respect Retry-After if provided)
        let waitMs = delay;
        const retryAfterHeader =
          error?.response?.headers?.['retry-after'] || error?.headers?.['retry-after'];
        if (retryAfterHeader) {
          const parsedSec = parseInt(String(retryAfterHeader), 10);
          if (!isNaN(parsedSec) && parsedSec > 0) {
            waitMs = parsedSec * 1000;
          }
        }

        console.warn(
          `[GoogleSheets API] Transient error (status ${statusCode || error?.code}). Retrying attempt ${attempt}/${maxRetries} after ${waitMs}ms...`
        );

        await new Promise((resolve) => setTimeout(resolve, waitMs));
        delay *= 2; // exponential backoff
      }
    }
  }

  /**
   * Authenticate and initialize the Google Sheets API client using Service Account.
   */
  public async getClient(): Promise<sheets_v4.Sheets> {
    if (this.isMockMode() || !this.isConfigured()) {
      throw new Error(
        'Google Sheets service is not configured. Missing GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, or GOOGLE_SPREADSHEET_ID.'
      );
    }

    try {
      const auth = new google.auth.JWT({
        email: config.google.serviceAccountEmail,
        key: config.google.privateKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheetsClient = google.sheets({ version: 'v4', auth });
      return this.sheetsClient;
    } catch (error: any) {
      throw new Error(`Failed to initialize Google Sheets client: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Get metadata for all worksheets in the configured Google Spreadsheet.
   */
  public async getSpreadsheetMetadata(): Promise<{
    title: string;
    sheets: WorksheetMetadata[];
  }> {
    const sheets = await this.getClient();
    const response = await this.executeWithRetry(() =>
      sheets.spreadsheets.get({
        spreadsheetId: config.google.spreadsheetId,
      })
    );

    const title = response.data.properties?.title || 'Untitled Spreadsheet';
    const sheetsList: WorksheetMetadata[] = (response.data.sheets || []).map((s) => ({
      sheetId: s.properties?.sheetId || undefined,
      title: s.properties?.title || undefined,
      rowCount: s.properties?.gridProperties?.rowCount || undefined,
      columnCount: s.properties?.gridProperties?.columnCount || undefined,
    }));

    return { title, sheets: sheetsList };
  }

  /**
   * Fetch all raw row values from a worksheet or range.
   */
  public async getSheetValues(range: string): Promise<any[][]> {
    const sheets = await this.getClient();
    try {
      const response = await this.executeWithRetry(() =>
        sheets.spreadsheets.values.get({
          spreadsheetId: config.google.spreadsheetId,
          range,
        })
      );
      return response.data.values || [];
    } catch (error: any) {
      if (error?.message?.includes('Unable to parse range') || error?.code === 400) {
        throw new Error(`Worksheet or range '${range}' not found in spreadsheet.`);
      }
      throw error;
    }
  }

  /**
   * Get column headers for a worksheet (Row 1).
   */
  public async getWorksheetHeaders(sheetName: string): Promise<string[]> {
    const values = await this.getSheetValues(`${sheetName}!1:1`);
    if (!values || values.length === 0 || !values[0]) {
      return [];
    }
    return values[0].map((h: any) => String(h || '').trim());
  }

  /**
   * Fetch all data rows as key-value objects mapped by header names.
   * Uses range A1:ZZ to safely support sheets exceeding 26 columns without truncation.
   */
  public async getSheetRecords<T = Record<string, any>>(sheetName: string): Promise<T[]> {
    const values = await this.getSheetValues(`${sheetName}!A1:ZZ`);
    if (!values || values.length <= 1) {
      return [];
    }

    const headers = values[0].map((h: any) => String(h || '').trim());
    const dataRows = values.slice(1);

    return dataRows.map((row) => {
      const record: Record<string, any> = {};
      headers.forEach((header, index) => {
        record[header] = row[index] !== undefined ? row[index] : '';
      });
      return record as T;
    });
  }

  /**
   * Sanitizes a cell value before writing to Google Sheets to defend against
   * Spreadsheet Formula Injection (CSV / Formula Injection, CWE-1236).
   * If a string value starts with =, +, -, or @, Google Sheets evaluates it as an active formula.
   * Prepending a single quote (') forces Google Sheets to store and display it strictly as literal text.
   */
  public sanitizeCellValue(value: any): any {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.startsWith('=') || trimmed.startsWith('@')) {
        return `'${value}`;
      }
      if ((trimmed.startsWith('+') || trimmed.startsWith('-')) && isNaN(Number(trimmed))) {
        return `'${value}`;
      }
    }
    return value;
  }

  public sanitizeRow(row: any[]): any[] {
    if (!Array.isArray(row)) return row;
    return row.map((cell) => this.sanitizeCellValue(cell));
  }

  public sanitizeRows(rows: any[][]): any[][] {
    if (!Array.isArray(rows)) return rows;
    return rows.map((r) => this.sanitizeRow(r));
  }

  /**
   * Append a new row of values to a worksheet.
   */
  public async appendSheetRow(
    sheetName: string,
    values: any[]
  ): Promise<sheets_v4.Schema$AppendValuesResponse> {
    const sheets = await this.getClient();
    const sanitizedValues = this.sanitizeRow(values);
    const response = await this.executeWithRetry(
      () =>
        sheets.spreadsheets.values.append({
          spreadsheetId: config.google.spreadsheetId,
          range: `${sheetName}!A:Z`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: {
            values: [sanitizedValues],
          },
        }),
      true
    );

    return response.data;
  }

  /**
   * Append multiple rows of values to a worksheet in a single batch API call.
   */
  public async appendSheetRows(
    sheetName: string,
    rows: any[][]
  ): Promise<sheets_v4.Schema$AppendValuesResponse> {
    if (!rows || rows.length === 0) {
      return {};
    }
    const sheets = await this.getClient();
    const sanitizedRows = this.sanitizeRows(rows);
    const response = await this.executeWithRetry(
      () =>
        sheets.spreadsheets.values.append({
          spreadsheetId: config.google.spreadsheetId,
          range: `${sheetName}!A:Z`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: {
            values: sanitizedRows,
          },
        }),
      true
    );

    return response.data;
  }

  /**
   * Update a specific cell range.
   */
  public async updateSheetRange(
    range: string,
    values: any[][]
  ): Promise<sheets_v4.Schema$UpdateValuesResponse> {
    const sheets = await this.getClient();
    const sanitizedValues = this.sanitizeRows(values);
    const response = await this.executeWithRetry(
      () =>
        sheets.spreadsheets.values.update({
          spreadsheetId: config.google.spreadsheetId,
          range,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: sanitizedValues,
          },
        }),
      true
    );

    return response.data;
  }

  /**
   * Delete a 1-indexed row from a worksheet.
   */
  public async deleteSheetRow(sheetName: string, rowIndex: number): Promise<void> {
    if (!this.isLiveApiEnabled()) {
      return;
    }
    const metadata = await this.getSpreadsheetMetadata();
    const sheet = metadata.sheets.find((s) => s.title === sheetName);
    if (!sheet || sheet.sheetId === undefined) {
      throw new Error(`Worksheet '${sheetName}' not found or missing sheetId`);
    }

    const sheets = await this.getClient();
    await this.executeWithRetry(
      () =>
        sheets.spreadsheets.batchUpdate({
          spreadsheetId: config.google.spreadsheetId,
          requestBody: {
            requests: [
              {
                deleteDimension: {
                  range: {
                    sheetId: sheet.sheetId,
                    dimension: 'ROWS',
                    startIndex: rowIndex - 1,
                    endIndex: rowIndex,
                  },
                },
              },
            ],
          },
        }),
      true
    );
  }

  /**
   * Delete multiple 1-indexed rows from a worksheet in descending order
   * to guarantee that deleting an earlier row does not alter the indices of subsequent rows.
   */
  public async deleteSheetRows(sheetName: string, rowIndices: number[]): Promise<void> {
    if (!this.isLiveApiEnabled() || !rowIndices || rowIndices.length === 0) {
      return;
    }
    const metadata = await this.getSpreadsheetMetadata();
    const sheet = metadata.sheets.find((s) => s.title === sheetName);
    if (!sheet || sheet.sheetId === undefined) {
      throw new Error(`Worksheet '${sheetName}' not found or missing sheetId`);
    }

    // Sort descending so deletions do not shift indices of remaining targets
    const sorted = [...new Set(rowIndices)].sort((a, b) => b - a);

    const sheets = await this.getClient();
    const requests = sorted.map((rowIdx) => ({
      deleteDimension: {
        range: {
          sheetId: sheet.sheetId,
          dimension: 'ROWS',
          startIndex: rowIdx - 1,
          endIndex: rowIdx,
        },
      },
    }));

    await this.executeWithRetry(
      () =>
        sheets.spreadsheets.batchUpdate({
          spreadsheetId: config.google.spreadsheetId,
          requestBody: { requests },
        }),
      true
    );
  }

  /**
   * Batch update multiple sheet ranges in a single Google Sheets API call.
   */
  public async batchUpdateSheetRanges(
    data: Array<{ range: string; values: any[][] }>
  ): Promise<sheets_v4.Schema$BatchUpdateValuesResponse> {
    if (!data || data.length === 0) return {};
    const sheets = await this.getClient();
    const sanitizedData = data.map((d) => ({
      range: d.range,
      values: this.sanitizeRows(d.values),
    }));
    const response = await this.executeWithRetry(
      () =>
        sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: config.google.spreadsheetId,
          requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: sanitizedData,
          },
        }),
      true
    );
    return response.data;
  }

  /**
   * Look up the 1-based row index in a worksheet by matching a value in a specific column (e.g. column 'A').
   * Returns -1 if not found.
   */
  public async findRowIndexByColumnValue(
    sheetName: string,
    colLetter: string,
    targetValue: string
  ): Promise<number> {
    if (!this.isLiveApiEnabled()) {
      return -1;
    }
    const cleanTarget = String(targetValue || '').trim().toLowerCase();
    if (!cleanTarget) return -1;

    const values = await this.getSheetValues(`${sheetName}!${colLetter}:${colLetter}`);
    for (let i = 0; i < values.length; i++) {
      const cellVal = String(values[i]?.[0] || '').trim().toLowerCase();
      if (cellVal === cleanTarget) {
        return i + 1; // 1-based sheet row index
      }
    }
    return -1;
  }

  /**
   * Safely create a worksheet if it does not already exist.
   * Does NOT overwrite or clear existing worksheets.
   */
  public async createWorksheetIfNotExists(sheetName: string): Promise<boolean> {
    if (!this.isLiveApiEnabled()) {
      return true;
    }
    const metadata = await this.getSpreadsheetMetadata();
    const exists = metadata.sheets.some((s) => s.title === sheetName);

    if (exists) {
      return false; // Already exists
    }

    const sheets = await this.getClient();
    await this.executeWithRetry(
      () =>
        sheets.spreadsheets.batchUpdate({
          spreadsheetId: config.google.spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: sheetName,
                  },
                },
              },
            ],
          },
        }),
      true
    );

    return true; // Successfully created
  }

  /**
   * Safely initialize headers on an empty worksheet.
   * If row 1 already contains data, it will NOT overwrite it.
   */
  public async initializeHeadersIfEmpty(
    sheetName: string,
    fallbackHeaders?: readonly string[]
  ): Promise<{ written: boolean; headers: readonly string[] }> {
    const baseSheet = sheetName.split('_')[0] as SheetName;
    const expectedHeaders =
      fallbackHeaders || SHEET_SCHEMAS[baseSheet] || (SHEET_SCHEMAS as any)[sheetName] || [];

    if (!this.isLiveApiEnabled()) {
      return { written: true, headers: expectedHeaders };
    }

    const existingHeaders = await this.getWorksheetHeaders(sheetName);

    if (existingHeaders.length > 0) {
      return { written: false, headers: existingHeaders };
    }

    if (expectedHeaders.length > 0) {
      // Worksheet is empty; write header row
      await this.updateSheetRange(`${sheetName}!A1`, [[...expectedHeaders]]);
      return { written: true, headers: expectedHeaders };
    }

    return { written: false, headers: [] };
  }

  /**
   * Validate worksheet headers against the canonical schema.
   */
  public async inspectAndValidateSheet(sheetName: SheetName) {
    const actualHeaders = await this.getWorksheetHeaders(sheetName);
    return validateWorksheetHeaders(sheetName, actualHeaders);
  }

  // --- Mock testing hooks for Phase 6 Database Doctor ---
  private mockSimulatedSheets: Map<string, { exists: boolean; headers: string[] }> = new Map();

  public simulateMissingSheetForTest(sheetName: string): void {
    this.mockSimulatedSheets.set(sheetName, { exists: false, headers: [] });
  }

  public simulateHeaderMismatchForTest(sheetName: string, headers: string[]): void {
    this.mockSimulatedSheets.set(sheetName, { exists: true, headers });
  }

  public resetMockDoctorForTest(): void {
    this.mockSimulatedSheets.clear();
  }

  /**
   * Run Read-Only Database Diagnostics (Phase 6 Database Doctor)
   * Inspects spreadsheet configuration and all 8 canonical worksheets.
   * Never exposes raw credentials, secrets, or keys.
   */
  public async runDatabaseDiagnostics(): Promise<DatabaseDiagnosticsReport> {
    const canonicalSheetNames = Object.keys(SHEET_SCHEMAS) as SheetName[];
    const isConfigured = this.isConfigured();

    const isEmailConfigured = Boolean(
      process.env.GMAIL_USER && (process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_REFRESH_TOKEN)
    );

    const configuration = {
      spreadsheetIdMasked: maskSecret(config.google.spreadsheetId),
      serviceAccountEmailMasked: maskEmail(config.google.serviceAccountEmail),
      isPrivateKeySet: Boolean(config.google.privateKey),
      isEmailConfigured,
    };

    let spreadsheetTitle = 'In-Memory / Test Database';
    const sheetDiagnostics: WorksheetDiagnostic[] = [];

    if (this.isLiveApiEnabled()) {
      try {
        const metadata = await this.getSpreadsheetMetadata();
        spreadsheetTitle = metadata.title || 'Connected Spreadsheet';

        for (const sheetName of canonicalSheetNames) {
          const sheetMeta = metadata.sheets.find((s) => s.title === sheetName);
          const exists = Boolean(sheetMeta);
          const expectedHeaders = SHEET_SCHEMAS[sheetName];

          if (!exists) {
            sheetDiagnostics.push({
              sheetName,
              exists: false,
              headersValid: false,
              actualHeaders: [],
              expectedHeaders,
              missingHeaders: [...expectedHeaders],
              unexpectedHeaders: [],
              rowCount: 0,
              status: 'MissingSheet',
            });
            continue;
          }

          let actualHeaders: string[] = [];
          try {
            actualHeaders = await this.getWorksheetHeaders(sheetName);
          } catch {
            actualHeaders = [];
          }

          const validation = validateWorksheetHeaders(sheetName, actualHeaders);
          let status: 'Healthy' | 'MissingSheet' | 'HeaderMismatch' | 'Empty' = 'Healthy';

          if (actualHeaders.length === 0) {
            status = 'Empty';
          } else if (!validation.isValid) {
            status = 'HeaderMismatch';
          }

          sheetDiagnostics.push({
            sheetName,
            exists: true,
            headersValid: validation.isValid,
            actualHeaders,
            expectedHeaders,
            missingHeaders: validation.missingColumns,
            unexpectedHeaders: validation.unexpectedColumns,
            rowCount: sheetMeta?.rowCount,
            status,
          });
        }
      } catch (err: any) {
        spreadsheetTitle = `Connection Error: ${err.message}`;
      }
    } else {
      // Test / development mode
      for (const sheetName of canonicalSheetNames) {
        const expectedHeaders = SHEET_SCHEMAS[sheetName];
        const simulated = this.mockSimulatedSheets.get(sheetName);

        if (simulated && !simulated.exists) {
          sheetDiagnostics.push({
            sheetName,
            exists: false,
            headersValid: false,
            actualHeaders: [],
            expectedHeaders,
            missingHeaders: [...expectedHeaders],
            unexpectedHeaders: [],
            status: 'MissingSheet',
          });
          continue;
        }

        const actualHeaders = simulated?.headers || [...expectedHeaders];
        const validation = validateWorksheetHeaders(sheetName, actualHeaders);
        const status = validation.isValid ? 'Healthy' : 'HeaderMismatch';

        sheetDiagnostics.push({
          sheetName,
          exists: true,
          headersValid: validation.isValid,
          actualHeaders,
          expectedHeaders,
          missingHeaders: validation.missingColumns,
          unexpectedHeaders: validation.unexpectedColumns,
          status,
        });
      }
    }

    const missingSheetsCount = sheetDiagnostics.filter((s) => !s.exists).length;
    const headerMismatchCount = sheetDiagnostics.filter((s) => s.exists && !s.headersValid).length;
    const validSheetsCount = sheetDiagnostics.filter((s) => s.exists && s.headersValid).length;

    let overallStatus: 'HEALTHY' | 'ACTION_REQUIRED' | 'UNCONFIGURED' = 'HEALTHY';
    if (!isConfigured && this.mockSimulatedSheets.size === 0) {
      overallStatus = 'UNCONFIGURED';
    } else if (missingSheetsCount > 0 || headerMismatchCount > 0) {
      overallStatus = 'ACTION_REQUIRED';
    }

    return {
      status: overallStatus,
      isConfigured,
      configuration,
      spreadsheetTitle,
      totalCanonicalSheets: canonicalSheetNames.length,
      validSheetsCount,
      missingSheetsCount,
      headerMismatchCount,
      sheets: sheetDiagnostics,
      diagnosedAt: new Date().toISOString(),
    };
  }

  /**
   * Safe, Non-Destructive Database Schema Repair (Phase 6 Database Doctor)
   * Creates missing worksheets and initializes empty headers.
   * NEVER overwrites existing data rows or existing populated headers.
   */
  public async repairDatabaseSchema(options: {
    confirm: boolean;
    performedBy: string;
  }): Promise<DatabaseRepairResult> {
    if (!options.confirm) {
      throw new Error(
        'Database schema repair requires explicit confirmation. Please review the diagnostic preview first.'
      );
    }

    const canonicalSheetNames = Object.keys(SHEET_SCHEMAS) as SheetName[];
    const createdSheets: string[] = [];
    const initializedHeaders: string[] = [];
    const alreadyValidSheets: string[] = [];
    const unresolvedIssues: string[] = [];

    if (this.isLiveApiEnabled()) {
      const metadata = await this.getSpreadsheetMetadata();
      for (const sheetName of canonicalSheetNames) {
        const sheetMeta = metadata.sheets.find((s) => s.title === sheetName);

        if (!sheetMeta) {
          try {
            await this.createWorksheetIfNotExists(sheetName);
            createdSheets.push(sheetName);
            await this.initializeHeadersIfEmpty(sheetName);
            initializedHeaders.push(sheetName);
          } catch (err: any) {
            unresolvedIssues.push(`Failed to create worksheet '${sheetName}': ${err.message}`);
          }
          continue;
        }

        // Sheet exists; check headers
        let headers: string[] = [];
        try {
          headers = await this.getWorksheetHeaders(sheetName);
        } catch {
          headers = [];
        }

        if (headers.length === 0) {
          try {
            await this.initializeHeadersIfEmpty(sheetName);
            initializedHeaders.push(sheetName);
          } catch (err: any) {
            unresolvedIssues.push(`Failed to write headers to '${sheetName}': ${err.message}`);
          }
        } else {
          const val = validateWorksheetHeaders(sheetName, headers);
          if (val.isValid) {
            alreadyValidSheets.push(sheetName);
          } else if (val.missingColumns.length > 0 && val.unexpectedColumns.length === 0) {
            // Missing canonical columns detected with no conflicting custom headers:
            // Safely update row 1 to the complete canonical schema without affecting existing data rows
            try {
              const expected = SHEET_SCHEMAS[sheetName];
              const endColLetter = getColumnLetter(expected.length - 1);
              await this.updateSheetRange(`${sheetName}!A1:${endColLetter}1`, [[...expected]]);
              initializedHeaders.push(sheetName);
            } catch (err: any) {
              unresolvedIssues.push(`Failed to update headers on '${sheetName}': ${err.message}`);
            }
          } else {
            // Safety guarantee: Do NOT overwrite mismatched non-empty headers with unexpected custom columns!
            unresolvedIssues.push(
              `Worksheet '${sheetName}' has existing custom/mismatched headers (${val.missingColumns.join(
                ', '
              )}). Existing data was preserved and not overwritten.`
            );
          }
        }
      }
    } else {
      // Mock / test mode repair
      for (const sheetName of canonicalSheetNames) {
        const simulated = this.mockSimulatedSheets.get(sheetName);

        if (simulated && !simulated.exists) {
          createdSheets.push(sheetName);
          initializedHeaders.push(sheetName);
          this.mockSimulatedSheets.delete(sheetName);
        } else if (simulated && simulated.headers.length === 0) {
          initializedHeaders.push(sheetName);
          this.mockSimulatedSheets.delete(sheetName);
        } else if (simulated && simulated.headers.length > 0) {
          const val = validateWorksheetHeaders(sheetName, simulated.headers);
          if (val.isValid) {
            alreadyValidSheets.push(sheetName);
          } else {
            unresolvedIssues.push(
              `Worksheet '${sheetName}' has existing mismatched headers. Preserved existing values.`
            );
          }
        } else {
          alreadyValidSheets.push(sheetName);
        }
      }
    }

    const message =
      unresolvedIssues.length === 0
        ? `Database schema successfully verified. Created ${createdSheets.length} missing sheet(s) and initialized ${initializedHeaders.length} header row(s).`
        : `Database schema repair partially completed with ${unresolvedIssues.length} unresolved issue(s). Existing data was safely preserved.`;

    return {
      success: unresolvedIssues.length === 0,
      performedBy: options.performedBy,
      repairedAt: new Date().toISOString(),
      createdSheets,
      initializedHeaders,
      alreadyValidSheets,
      unresolvedIssues,
      message,
    };
  }
}

export const googleSheetsService = new GoogleSheetsService();
