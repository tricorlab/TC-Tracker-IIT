import { googleSheetsService } from '../services/googleSheets.service.js';
import { SHEET_NAMES, SHEET_SCHEMAS } from '../config/sheets.config.js';
import { validateWorksheetHeaders } from '../validation/sheetValidators.js';

export async function fixLeaveRequestsHeader(): Promise<{
  success: boolean;
  message: string;
  previousHeaders: string[];
  updatedHeaders: string[];
}> {
  console.log('====================================================');
  console.log('  TC TRACKER – FIX LEAVEREQUESTS HEADER MISMATCH    ');
  console.log('====================================================\n');

  if (!googleSheetsService.isConfigured()) {
    console.error('[ERROR] Google Sheets credentials or Spreadsheet ID not configured in backend/.env.');
    return {
      success: false,
      message: 'Google Sheets credentials not configured.',
      previousHeaders: [],
      updatedHeaders: [],
    };
  }

  try {
    const sheetName = SHEET_NAMES.LEAVE_REQUESTS;
    const expectedHeaders = [...SHEET_SCHEMAS[sheetName]];

    console.log(`[1/3] Inspecting current headers for worksheet: "${sheetName}"...`);
    const currentHeaders = await googleSheetsService.getWorksheetHeaders(sheetName);
    console.log('Current Headers:', currentHeaders);

    const validationBefore = validateWorksheetHeaders(sheetName, currentHeaders);
    console.log('Validation Status Before:', validationBefore.isValid ? 'VALID' : 'INVALID');
    console.log('Missing Columns:', validationBefore.missingColumns);
    console.log('Unexpected Columns:', validationBefore.unexpectedColumns);

    if (validationBefore.isValid) {
      console.log(`\n[INFO] Worksheet "${sheetName}" headers already match canonical schema. No update needed.`);
      return {
        success: true,
        message: 'Headers are already valid.',
        previousHeaders: currentHeaders,
        updatedHeaders: currentHeaders,
      };
    }

    console.log(`\n[2/3] Updating row 1 of "${sheetName}" to canonical headers...`);
    console.log('Canonical Headers (11 columns):', expectedHeaders);

    // Range for 11 columns is A1:K1
    const endColLetter = String.fromCharCode(65 + expectedHeaders.length - 1); // 65 = 'A', 65+10 = 75 ('K')
    const targetRange = `${sheetName}!A1:${endColLetter}1`;

    await googleSheetsService.updateSheetRange(targetRange, [expectedHeaders]);
    console.log(`[SUCCESS] Updated range "${targetRange}" successfully.`);

    console.log(`\n[3/3] Verifying updated headers...`);
    const verifiedHeaders = await googleSheetsService.getWorksheetHeaders(sheetName);
    console.log('Verified Headers:', verifiedHeaders);

    const validationAfter = validateWorksheetHeaders(sheetName, verifiedHeaders);
    console.log('Validation Status After:', validationAfter.isValid ? 'VALID / HEALTHY' : 'INVALID');

    if (!validationAfter.isValid) {
      throw new Error(`Verification failed. Missing columns: ${validationAfter.missingColumns.join(', ')}`);
    }

    console.log('\n====================================================');
    console.log('  LEAVEREQUESTS HEADER MISMATCH SUCCESSFULLY FIXED! ');
    console.log('====================================================\n');

    return {
      success: true,
      message: 'LeaveRequests header mismatch successfully fixed.',
      previousHeaders: currentHeaders,
      updatedHeaders: verifiedHeaders,
    };
  } catch (error: any) {
    console.error('\n[FATAL ERROR] Failed to fix LeaveRequests header:', error.message);
    return {
      success: false,
      message: error.message,
      previousHeaders: [],
      updatedHeaders: [],
    };
  }
}

// Auto-run when executed directly
if (process.argv[1]?.endsWith('fixLeaveRequestsHeader.ts') || process.argv[1]?.endsWith('fixLeaveRequestsHeader.js')) {
  fixLeaveRequestsHeader().then((res) => {
    if (!res.success) {
      process.exit(1);
    }
  });
}
