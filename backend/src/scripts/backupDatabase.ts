import { backupService } from '../services/backup.service.js';
import { googleSheetsService } from '../services/googleSheets.service.js';

async function runCliBackup() {
  console.log('====================================================');
  console.log('   TC TRACKER – SECURE DATABASE SNAPSHOT BACKUP     ');
  console.log('====================================================\n');

  const isLive = googleSheetsService.isLiveApiEnabled();
  console.log(`[MODE] ${isLive ? 'Live Google Sheets Database' : 'Local / Test Mode'}`);
  console.log('[STEP 1/3] Extracting point-in-time snapshot from 8 canonical worksheets...');

  const startTime = Date.now();
  const backup = await backupService.createDatabaseBackup('CLI_ADMIN');
  const elapsedMs = Date.now() - startTime;

  console.log(`[SUCCESS] Extracted ${backup.totalRecords} total records across 8 sheets in ${elapsedMs}ms.\n`);

  console.log('Worksheet Breakdown:');
  console.log('----------------------------------------------------');
  for (const [sheet, count] of Object.entries(backup.sheetCounts)) {
    console.log(`  • ${sheet.padEnd(20)} : ${count} record(s)`);
  }
  console.log('----------------------------------------------------');
  console.log(`  Total Records        : ${backup.totalRecords}`);
  console.log(`  SHA-256 Checksum     : ${backup.checksum}`);
  console.log('----------------------------------------------------\n');

  console.log('[STEP 2/3] Writing snapshot archive to local disk...');
  const savedPath = await backupService.saveLocalBackupFile(backup);
  console.log(`[SAVED] File created at: ${savedPath}\n`);

  console.log('[STEP 3/3] Performing cryptographic integrity verification...');
  const verification = backupService.verifyBackupIntegrity(backup.payload);

  if (verification.isValid) {
    console.log('[VERIFIED] Cryptographic signature matches. Backup is complete, valid, and tamper-free.');
  } else {
    console.error(`[ERROR] Verification failed: ${verification.error}`);
    process.exit(1);
  }

  console.log('\n====================================================');
  console.log('   BACKUP COMPLETED SUCCESSFULLY                    ');
  console.log('====================================================');
}

runCliBackup().catch((err) => {
  console.error('\n[FATAL] Database backup failed:', err.message);
  process.exit(1);
});
