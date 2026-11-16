import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { googleSheetsService } from '../services/googleSheets.service.js';
import { SHEET_NAMES } from '../config/sheets.config.js';

async function check() {
  console.log('Fetching live EmailLogs from Google Sheet...');
  const records = await googleSheetsService.getSheetRecords(SHEET_NAMES.EMAIL_LOGS);
  console.log(`Total EmailLogs rows: ${records.length}`);
  const recent = records.slice(-5);
  console.log('Recent 5 logs:');
  console.log(JSON.stringify(recent, null, 2));

  const leaveRecords = await googleSheetsService.getSheetRecords(SHEET_NAMES.LEAVE_REQUESTS);
  console.log(`Total LeaveRequests rows: ${leaveRecords.length}`);
  const recentLeaves = leaveRecords.slice(-5);
  console.log('Recent 5 leave requests:');
  console.log(JSON.stringify(recentLeaves, null, 2));
}

check().catch(console.error);
