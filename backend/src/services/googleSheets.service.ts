import { google, sheets_v4 } from 'googleapis';
import { config } from '../config/env.config.js';
import { SHEET_SCHEMAS, SheetName } from '../config/sheets.config.js';
import { validateWorksheetHeaders } from '../validation/sheetValidators.js';

export interface WorksheetMetadata {
  sheetId?: number;
  title?: string;
  rowCount?: number;
  columnCount?: number;
}

export class GoogleSheetsService {
  private sheetsClient: sheets_v4.Sheets | null = null;

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
   * Authenticate and initialize the Google Sheets API client using Service Account.
   */
  public async getClient(): Promise<sheets_v4.Sheets> {
    if (this.sheetsClient) {
      return this.sheetsClient;
    }

    if (!this.isConfigured()) {
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
    const response = await sheets.spreadsheets.get({
      spreadsheetId: config.google.spreadsheetId,
    });

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
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: config.google.spreadsheetId,
        range,
      });
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
   */
  public async getSheetRecords<T = Record<string, any>>(sheetName: string): Promise<T[]> {
    const values = await this.getSheetValues(`${sheetName}!A1:Z`);
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
   * Append a new row of values to a worksheet.
   */
  public async appendSheetRow(
    sheetName: string,
    values: any[]
  ): Promise<sheets_v4.Schema$AppendValuesResponse> {
    const sheets = await this.getClient();
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: config.google.spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [values],
      },
    });

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
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });

    return response.data;
  }

  /**
   * Safely create a worksheet if it does not already exist.
   * Does NOT overwrite or clear existing worksheets.
   */
  public async createWorksheetIfNotExists(sheetName: string): Promise<boolean> {
    const metadata = await this.getSpreadsheetMetadata();
    const exists = metadata.sheets.some((s) => s.title === sheetName);

    if (exists) {
      return false; // Already exists
    }

    const sheets = await this.getClient();
    await sheets.spreadsheets.batchUpdate({
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
    });

    return true; // Successfully created
  }

  /**
   * Safely initialize headers on an empty worksheet.
   * If row 1 already contains data, it will NOT overwrite it.
   */
  public async initializeHeadersIfEmpty(
    sheetName: SheetName
  ): Promise<{ written: boolean; headers: readonly string[] }> {
    const expectedHeaders = SHEET_SCHEMAS[sheetName];
    const existingHeaders = await this.getWorksheetHeaders(sheetName);

    if (existingHeaders.length > 0) {
      return { written: false, headers: existingHeaders };
    }

    // Worksheet is empty; write header row
    await this.updateSheetRange(`${sheetName}!A1`, [[...expectedHeaders]]);
    return { written: true, headers: expectedHeaders };
  }

  /**
   * Validate worksheet headers against the canonical schema.
   */
  public async inspectAndValidateSheet(sheetName: SheetName) {
    const actualHeaders = await this.getWorksheetHeaders(sheetName);
    return validateWorksheetHeaders(sheetName, actualHeaders);
  }
}

export const googleSheetsService = new GoogleSheetsService();
