import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { googleDriveBackupService } from '../services/googleDriveBackup.service.js';
import { activityLogService } from '../services/activityLog.service.js';
import { emailService } from '../services/email.service.js';

describe('--- [GOOGLE DRIVE BACKUP] Semi-Annual Automated Backup Engine (Format A) ---', () => {
  beforeEach(() => {
    googleDriveBackupService.setMockMode(true);
    googleDriveBackupService.clearMockBackups();
    activityLogService.clearMockLogs();
    emailService.clearMockEmailLogs();
  });

  it('1. should accurately calculate next semi-annual scheduled dates (Jan 1 and Jul 1)', () => {
    // Test date in H1 (March 15, 2026) -> Next schedule must be July 1, 2026
    const marchDate = new Date(2026, 2, 15);
    const h1Schedule = googleDriveBackupService.calculateNextScheduledDate(marchDate);
    assert.strictEqual(h1Schedule.nextDate.getFullYear(), 2026);
    assert.strictEqual(h1Schedule.nextDate.getMonth(), 6); // 6 = July (0-indexed)
    assert.strictEqual(h1Schedule.nextDate.getDate(), 1);
    assert.ok(h1Schedule.daysRemaining > 0, 'Days remaining must be greater than 0');

    // Test date in H2 (October 20, 2026) -> Next schedule must be January 1, 2027
    const octDate = new Date(2026, 9, 20);
    const h2Schedule = googleDriveBackupService.calculateNextScheduledDate(octDate);
    assert.strictEqual(h2Schedule.nextDate.getFullYear(), 2027);
    assert.strictEqual(h2Schedule.nextDate.getMonth(), 0); // 0 = January
    assert.strictEqual(h2Schedule.nextDate.getDate(), 1);
    assert.ok(h2Schedule.daysRemaining > 0, 'Days remaining must be greater than 0');
  });

  it('2. should format canonical Format A backup titles with semester markers (H1 / H2)', () => {
    const febDate = new Date(2026, 1, 10);
    const h1Title = googleDriveBackupService.generateBackupTitle(febDate);
    assert.ok(h1Title.startsWith('TC_Tracker_Backup_2026-02-10_H1'), `Title was: ${h1Title}`);

    const augDate = new Date(2026, 7, 25);
    const h2Title = googleDriveBackupService.generateBackupTitle(augDate);
    assert.ok(h2Title.startsWith('TC_Tracker_Backup_2026-08-25_H2'), `Title was: ${h2Title}`);
  });

  it('3. should execute Google Drive backup (Spreadsheet Clone) with audit trail and email log', async () => {
    const result = await googleDriveBackupService.createDriveBackup({
      performedBy: 'ADMIN_TEST',
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.fileId.startsWith('drive-mock-'), 'File ID should be generated');
    assert.ok(result.webViewLink.includes(result.fileId), 'Web view link must point to Drive file');
    assert.strictEqual(result.performedBy, 'ADMIN_TEST');
    assert.ok(result.title.includes('TC_Tracker_Backup_'), 'Title must match Format A convention');

    // Verify audit log in ActivityLogs
    const logs = await activityLogService.getAllLogs();
    const driveLog = logs.find((l) => l.Action === 'DRIVE_BACKUP_CREATED');
    assert.ok(driveLog, 'ActivityLogs must record DRIVE_BACKUP_CREATED event');
    assert.strictEqual(driveLog.PerformedBy, 'ADMIN_TEST');
    assert.strictEqual(driveLog.EntityType, 'GoogleDrive');

    // Verify email notification dispatched/logged
    const emailLogs = emailService.getMockEmailLogs();
    assert.strictEqual(emailLogs.length, 1);
    assert.strictEqual(emailLogs[0].RelatedLeaveRequestID, result.fileId);
  });

  it('4. should retrieve real-time backup status and countdown information', async () => {
    // Before any backup
    const initialStatus = await googleDriveBackupService.getDriveBackupStatus();
    assert.strictEqual(initialStatus.isConfigured, true);
    assert.strictEqual(initialStatus.lastBackup, null);
    assert.ok(initialStatus.nextScheduledDate.length > 0);
    assert.ok(initialStatus.daysRemaining >= 0);

    // After executing a backup
    const backupResult = await googleDriveBackupService.createDriveBackup({
      performedBy: 'ADMIN_BOB',
    });

    const updatedStatus = await googleDriveBackupService.getDriveBackupStatus();
    assert.ok(updatedStatus.lastBackup !== null);
    assert.strictEqual(updatedStatus.lastBackup.fileId, backupResult.fileId);
    assert.strictEqual(updatedStatus.lastBackup.performedBy, 'ADMIN_BOB');
    assert.strictEqual(updatedStatus.scheduleFrequency, 'Every 6 Months (Jan 1 & Jul 1)');
  });

  it('5. should handle scheduled backup evaluation and respect idempotency on same day', async () => {
    // 1st run should execute because no prior backup exists
    const executedFirst = await googleDriveBackupService.checkAndExecuteScheduledBackup();
    assert.strictEqual(executedFirst, true, 'First scheduled run should execute');

    // 2nd run on the same day should be skipped by idempotency guard
    const executedSecond = await googleDriveBackupService.checkAndExecuteScheduledBackup();
    assert.strictEqual(executedSecond, false, 'Second run on same calendar day must be skipped by idempotency guard');
  });
});
