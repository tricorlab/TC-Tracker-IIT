import app from './app.js';
import { config } from './config/env.config.js';
import { googleSheetsService } from './services/googleSheets.service.js';
import { googleDriveBackupService } from './services/googleDriveBackup.service.js';

const PORT = config.port;

const server = app.listen(PORT, () => {
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

// Graceful shutdown handling for container stops and process restarts
const shutdown = (signal: string) => {
  console.log(`[TC Tracker Backend] Received ${signal}. Starting graceful shutdown...`);
  googleDriveBackupService.stopScheduler();
  server.close(() => {
    console.log('[TC Tracker Backend] HTTP server closed gracefully.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[TC Tracker Backend] Graceful shutdown timed out. Forcing process exit.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
