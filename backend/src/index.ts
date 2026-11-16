import app from './app.js';
import { config } from './config/env.config.js';
import { googleSheetsService } from './services/googleSheets.service.js';
import { googleDriveBackupService } from './services/googleDriveBackup.service.js';

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`[TC Tracker Backend] Server is running on port ${PORT}`);
  console.log(`[TC Tracker Backend] Health check: http://localhost:${PORT}/api/health`);
  console.log(
    `[TC Tracker Backend] Google Sheets integration status: ${
      googleSheetsService.isConfigured() ? 'Configured' : 'Credentials not yet configured (Phase 1 prepared)'
    }`
  );

  // Initialize automated 6-month Google Drive backup scheduler (Format A: Spreadsheet Clone)
  googleDriveBackupService.initScheduledDriveBackup();
});
