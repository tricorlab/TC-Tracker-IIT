import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { backupService } from '../services/backup.service.js';
import { activityLogService } from '../services/activityLog.service.js';
import { SHEET_NAMES } from '../config/sheets.config.js';

describe('--- [DATABASE BACKUP TEST SUITE] High-Security Snapshot & Integrity Engine ---', () => {
  beforeEach(() => {
    activityLogService.clearMockLogs();
  });

  describe('1. Snapshot Creation & Canonical Worksheets Extraction', () => {
    it('should extract all 8 canonical worksheets into a structured snapshot', async () => {
      // Mock data for canonical sheets
      backupService.setMockBackupData({
        [SHEET_NAMES.USERS]: [
          { UserID: 'USR-01', FullName: 'Alice Staff', Role: 'Staff', IsActive: 'TRUE' },
          { UserID: 'USR-02', FullName: 'Bob Admin', Role: 'Admin', IsActive: 'TRUE' },
        ],
        [SHEET_NAMES.ATTENDANCE]: [
          { AttendanceID: 'ATT-01', UserID: 'USR-01', AttendanceDate: '2026-11-02', Status: 'Present' },
        ],
        [SHEET_NAMES.LEAVE_REQUESTS]: [
          { LeaveRequestID: 'LR-01', UserID: 'USR-01', LeaveType: 'Casual', CalculatedDays: 2 },
        ],
        [SHEET_NAMES.HOLIDAYS]: [
          { HolidayID: 'HOL-01', HolidayName: 'Diwali', HolidayDate: '2026-11-08' },
        ],
        [SHEET_NAMES.LEAVE_BALANCES]: [
          { LeaveBalanceID: 'BAL-01', UserID: 'USR-01', CalendarYear: 2026, AvailableLeave: 10 },
        ],
        [SHEET_NAMES.LEAVE_POLICY]: [
          { PolicyID: 'POL-01', MonthlyAccrual: 2.5, CarryForwardPercentage: 50 },
        ],
        [SHEET_NAMES.ACTIVITY_LOGS]: [
          { LogID: 'LOG-01', Action: 'TEST_INIT', PerformedBy: 'SYSTEM' },
        ],
        [SHEET_NAMES.EMAIL_LOGS]: [
          { EmailLogID: 'EML-01', RecipientEmail: 'test@example.com', DeliveryStatus: 'SENT' },
        ],
      });

      const backup = await backupService.createDatabaseBackup('ADMIN-TEST-USER');

      assert.ok(backup.filename.startsWith('tc-tracker-backup-'));
      assert.ok(backup.filename.endsWith('.json'));
      assert.equal(backup.totalRecords, 9);
      assert.equal(backup.payload.version, '1.0');
      assert.equal(backup.payload.metadata.performedBy, 'ADMIN-TEST-USER');
      assert.equal(backup.payload.metadata.totalCanonicalSheets, 8);
      assert.equal(backup.payload.metadata.totalRecords, 9);

      // Verify all 8 sheet data sets are present
      assert.equal(backup.payload.data[SHEET_NAMES.USERS].length, 2);
      assert.equal(backup.payload.data[SHEET_NAMES.ATTENDANCE].length, 1);
      assert.equal(backup.payload.data[SHEET_NAMES.LEAVE_REQUESTS].length, 1);
      assert.equal(backup.payload.data[SHEET_NAMES.HOLIDAYS].length, 1);
      assert.equal(backup.payload.data[SHEET_NAMES.LEAVE_BALANCES].length, 1);
      assert.equal(backup.payload.data[SHEET_NAMES.LEAVE_POLICY].length, 1);
      assert.equal(backup.payload.data[SHEET_NAMES.ACTIVITY_LOGS].length, 1);
      assert.equal(backup.payload.data[SHEET_NAMES.EMAIL_LOGS].length, 1);
    });

    it('should compute a deterministic SHA-256 hexadecimal checksum', async () => {
      const dataA = {
        Users: [{ UserID: 'USR-01', FullName: 'Alice' }],
        Attendance: [],
      };
      const dataB = {
        Users: [{ UserID: 'USR-01', FullName: 'Alice' }],
        Attendance: [],
      };

      const checksumA = backupService.calculateChecksum(dataA as any);
      const checksumB = backupService.calculateChecksum(dataB as any);

      assert.equal(checksumA.length, 64, 'SHA-256 hex digest must be 64 characters');
      assert.equal(checksumA, checksumB, 'Identical datasets must yield identical checksums');
    });
  });

  describe('2. Cryptographic Integrity & Tamper Detection', () => {
    it('should verify valid untouched backup as valid', async () => {
      const backup = await backupService.createDatabaseBackup('ADMIN-TEST-USER');
      const verification = backupService.verifyBackupIntegrity(backup.payload);

      assert.equal(verification.isValid, true);
      assert.equal(verification.computedChecksum, backup.checksum);
      assert.equal(verification.recordedChecksum, backup.checksum);
    });

    it('should detect altered data and reject with checksum mismatch', async () => {
      const backup = await backupService.createDatabaseBackup('ADMIN-TEST-USER');
      const tamperedPayload = JSON.parse(JSON.stringify(backup.payload));

      // Inject a tampered row
      tamperedPayload.data[SHEET_NAMES.USERS].push({
        UserID: 'USR-HACKED',
        FullName: 'Malicious Injected User',
        Role: 'Admin',
      });

      const verification = backupService.verifyBackupIntegrity(tamperedPayload);

      assert.equal(verification.isValid, false);
      assert.match(verification.error!, /Checksum mismatch/i);
    });

    it('should reject invalid JSON structure or missing checksum', () => {
      const invalidA = backupService.verifyBackupIntegrity('{ invalid json');
      assert.equal(invalidA.isValid, false);
      assert.match(invalidA.error!, /Invalid JSON syntax/i);

      const invalidB = backupService.verifyBackupIntegrity({ version: '1.0' } as any);
      assert.equal(invalidB.isValid, false);
      assert.match(invalidB.error!, /Missing version, data, or checksum header/i);
    });
  });

  describe('3. Audit Trail Logging', () => {
    it('should record an activity audit log entry on database backup creation', async () => {
      activityLogService.clearMockLogs();

      await backupService.createDatabaseBackup('ADMIN-AUDIT-TEST');

      const logs = await activityLogService.getRecentLogs(10);
      const backupLog = logs.find((l) => l.Action === 'DATABASE_BACKUP_CREATED');

      assert.ok(backupLog, 'DATABASE_BACKUP_CREATED log must be recorded in ActivityLogs');
      assert.equal(backupLog.PerformedBy, 'ADMIN-AUDIT-TEST');
      assert.equal(backupLog.EntityType, 'Database');
      assert.equal(backupLog.EntityID, 'ALL_CANONICAL_SHEETS');
    });
  });
});
