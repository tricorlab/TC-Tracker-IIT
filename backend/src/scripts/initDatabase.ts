import { googleSheetsService } from '../services/googleSheets.service.js';
import { SHEET_NAMES, SHEET_SCHEMAS, SheetName } from '../config/sheets.config.js';
import { validateWorksheetHeaders } from '../validation/sheetValidators.js';

interface SheetAuditResult {
  sheetName: string;
  status: 'EXISTS' | 'CREATED' | 'FAILED';
  headersStatus: 'UP_TO_DATE' | 'INITIALIZED' | 'SCHEMA_MISMATCH' | 'EMPTY';
  missingColumns: string[];
  unexpectedColumns: string[];
  notes: string;
}

export async function initializeDatabase(): Promise<{
  success: boolean;
  message: string;
  report: SheetAuditResult[];
}> {
  console.log('====================================================');
  console.log('   TC TRACKER – GOOGLE SHEETS DATABASE INITIALIZER  ');
  console.log('====================================================\n');

  if (!googleSheetsService.isConfigured()) {
    console.warn('[WARNING] Google Sheets credentials or Spreadsheet ID not configured.');
    console.warn('Prerequisites required in backend/.env:');
    console.warn('  - GOOGLE_SPREADSHEET_ID');
    console.warn('  - GOOGLE_SERVICE_ACCOUNT_EMAIL');
    console.warn('  - GOOGLE_PRIVATE_KEY\n');
    console.warn('Skipping live connection. Database design and validation rules are compiled.');
    return {
      success: false,
      message: 'Google Sheets credentials or Spreadsheet ID not configured in environment.',
      report: [],
    };
  }

  const report: SheetAuditResult[] = [];
  const requiredSheets = Object.values(SHEET_NAMES);

  try {
    console.log('[1/3] Connecting to Google Sheets API...');
    const metadata = await googleSheetsService.getSpreadsheetMetadata();
    console.log(`[CONNECTED] Spreadsheet: "${metadata.title}"`);
    console.log(`[INFO] Found ${metadata.sheets.length} existing worksheets.\n`);

    console.log('[2/3] Auditing and ensuring required worksheets...');
    const existingSheetTitles = new Set(
      metadata.sheets.map((s) => s.title).filter(Boolean) as string[]
    );

    for (const sheetName of requiredSheets) {
      let sheetStatus: SheetAuditResult['status'] = 'EXISTS';
      let headersStatus: SheetAuditResult['headersStatus'] = 'UP_TO_DATE';
      let missingCols: string[] = [];
      let unexpectedCols: string[] = [];
      let note = 'Existing sheet preserved.';

      // Check existence
      if (!existingSheetTitles.has(sheetName)) {
        console.log(`[CREATE] Creating missing worksheet: "${sheetName}"...`);
        try {
          await googleSheetsService.createWorksheetIfNotExists(sheetName);
          sheetStatus = 'CREATED';
          note = 'Worksheet created without altering existing sheets.';
        } catch (err: any) {
          console.error(`[ERROR] Failed to create worksheet "${sheetName}": ${err.message}`);
          report.push({
            sheetName,
            status: 'FAILED',
            headersStatus: 'EMPTY',
            missingColumns: [...SHEET_SCHEMAS[sheetName as SheetName]],
            unexpectedColumns: [],
            notes: `Creation failed: ${err.message}`,
          });
          continue;
        }
      }

      // Check existing headers
      const existingHeaders = await googleSheetsService.getWorksheetHeaders(sheetName);

      if (existingHeaders.length === 0) {
        console.log(`[HEADERS] Initializing canonical headers for empty sheet: "${sheetName}"...`);
        await googleSheetsService.initializeHeadersIfEmpty(sheetName as SheetName);
        headersStatus = 'INITIALIZED';
        note = 'Header row initialized. No existing data was modified.';
      } else {
        // Validate existing headers against schema
        const validation = validateWorksheetHeaders(sheetName as SheetName, existingHeaders);
        missingCols = validation.missingColumns;
        unexpectedCols = validation.unexpectedColumns;

        if (!validation.isValid) {
          headersStatus = 'SCHEMA_MISMATCH';
          note = `Missing columns detected: [${missingCols.join(', ')}]. Existing data preserved.`;
        } else if (unexpectedCols.length > 0) {
          headersStatus = 'UP_TO_DATE';
          note = `Canonical columns present. Contains extra columns: [${unexpectedCols.join(', ')}].`;
        } else {
          headersStatus = 'UP_TO_DATE';
          note = 'Headers strictly match canonical schema.';
        }
      }

      report.push({
        sheetName,
        status: sheetStatus,
        headersStatus,
        missingColumns: missingCols,
        unexpectedColumns: unexpectedCols,
        notes: note,
      });
    }

    console.log('\n[3/3] Initialization Audit Report:');
    console.table(
      report.map((r) => ({
        Worksheet: r.sheetName,
        WorksheetStatus: r.status,
        HeadersStatus: r.headersStatus,
        MissingColumns: r.missingColumns.length ? r.missingColumns.join(', ') : 'None',
        Notes: r.notes,
      }))
    );

    console.log('\n[COMPLETE] Safe database initialization completed successfully.');
    console.log('No existing rows were overwritten or removed.');

    return {
      success: true,
      message: 'Database initialization audit complete.',
      report,
    };
  } catch (error: any) {
    console.error('[FATAL] Failed to inspect or initialize Google Sheets database:', error.message);
    return {
      success: false,
      message: `Database initialization failed: ${error.message}`,
      report,
    };
  }
}

import { fileURLToPath } from 'url';
import path from 'path';

// Cross-platform direct execution check
const isDirectExecution = () => {
  if (!process.argv[1]) return false;
  try {
    const currentFilePath = fileURLToPath(import.meta.url);
    return path.resolve(process.argv[1]) === path.resolve(currentFilePath);
  } catch {
    return false;
  }
};

if (isDirectExecution()) {
  initializeDatabase().catch((err) => {
    console.error('Unhandled initialization error:', err);
    process.exit(1);
  });
}
