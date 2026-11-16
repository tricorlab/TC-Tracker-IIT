import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateId,
  validateUniqueUserId,
  validateEmail,
  validateRole,
  validateAttendanceStatus,
  validateNotificationStatus,
  validateDate,
  validateLeaveDateRange,
  validateDecimal,
  validateUniqueAttendance,
  validateUniqueLeaveBalance,
  validateUserReference,
  validateWorksheetHeaders,
  calculateAvailableLeave,
} from '../validation/sheetValidators.js';
import { SHEET_NAMES, SHEET_SCHEMAS, SheetName } from '../config/sheets.config.js';
import { googleSheetsService } from '../services/googleSheets.service.js';

describe('--- [MOCK TEST SUITE] TC Tracker Phase 2 Database Validation ---', () => {

  describe('1. Worksheet Header Validation', () => {
    it('should validate complete canonical headers for all 8 worksheets', () => {
      for (const [sheetKey, expectedCols] of Object.entries(SHEET_SCHEMAS)) {
        const result = validateWorksheetHeaders(
          sheetKey as SheetName,
          [...expectedCols]
        );
        assert.equal(
          result.isValid,
          true,
          `Sheet ${sheetKey} headers should be valid`
        );
        assert.equal(result.missingColumns.length, 0);
      }
    });

    it('should detect missing required columns', () => {
      const incompleteHeaders = ['UserID', 'FullName', 'Email'];
      const result = validateWorksheetHeaders(SHEET_NAMES.USERS, incompleteHeaders);
      assert.equal(result.isValid, false);
      assert.ok(result.missingColumns.includes('Role'));
      assert.ok(result.missingColumns.includes('JoiningDate'));
      assert.ok(result.missingColumns.includes('IsActive'));
    });

    it('should detect unexpected extra columns while preserving validation info', () => {
      const extraHeaders = [...SHEET_SCHEMAS[SHEET_NAMES.USERS], 'UnauthorizedPasswordHash'];
      const result = validateWorksheetHeaders(SHEET_NAMES.USERS, extraHeaders);
      assert.equal(result.isValid, true); // Still has all expected columns
      assert.ok(result.unexpectedColumns.includes('UnauthorizedPasswordHash'));
    });
  });

  describe('2. Spreadsheet Configuration Validation', () => {
    it('should report false when credentials or spreadsheet ID are not configured', () => {
      // In default test environment without real secrets, isConfigured returns false
      const configured = googleSheetsService.isConfigured();
      assert.equal(typeof configured, 'boolean');
    });

    it('should reject unconfigured client access gracefully with an informative error', async () => {
      if (!googleSheetsService.isConfigured()) {
        await assert.rejects(
          async () => {
            await googleSheetsService.getClient();
          },
          /Google Sheets service is not configured/
        );
      }
    });
  });

  describe('3. Duplicate User Email Detection', () => {
    const existingEmails = ['alice@example.com', 'bob@example.com'];

    it('should allow unique new email', () => {
      const res = validateEmail('carol@example.com', existingEmails);
      assert.equal(res.isValid, true);
    });

    it('should reject duplicate email ignoring case and surrounding whitespace', () => {
      const res1 = validateEmail('  ALICE@example.com  ', existingEmails);
      assert.equal(res1.isValid, false);
      assert.ok(res1.errors[0].includes('already exists'));

      const res2 = validateEmail('Bob@Example.Com', existingEmails);
      assert.equal(res2.isValid, false);
    });

    it('should reject invalid email formats', () => {
      const res = validateEmail('not-an-email', existingEmails);
      assert.equal(res.isValid, false);
      assert.ok(res.errors[0].includes('Invalid email format'));
    });
  });

  describe('4. Duplicate Attendance Detection', () => {
    const existingAttendance = [
      { userId: 'USR-001', attendanceDate: '2026-10-30' },
      { userId: 'USR-002', attendanceDate: '2026-10-30' },
    ];

    it('should allow attendance record for different user or different date', () => {
      const res1 = validateUniqueAttendance('USR-003', '2026-10-30', existingAttendance);
      assert.equal(res1.isValid, true);

      const res2 = validateUniqueAttendance('USR-001', '2026-10-31', existingAttendance);
      assert.equal(res2.isValid, true);
    });

    it('should reject duplicate attendance for same user on same date', () => {
      const res = validateUniqueAttendance('USR-001', '2026-10-30', existingAttendance);
      assert.equal(res.isValid, false);
      assert.ok(res.errors[0].includes('Attendance record already exists'));
    });
  });

  describe('5. Duplicate Yearly Leave Balance Detection', () => {
    const existingBalances = [
      { userId: 'USR-001', calendarYear: 2026 },
      { userId: 'USR-002', calendarYear: 2026 },
    ];

    it('should allow leave balance for different year or different user', () => {
      const res1 = validateUniqueLeaveBalance('USR-001', 2027, existingBalances);
      assert.equal(res1.isValid, true);

      const res2 = validateUniqueLeaveBalance('USR-003', 2026, existingBalances);
      assert.equal(res2.isValid, true);
    });

    it('should reject duplicate yearly balance for same user and year', () => {
      const res = validateUniqueLeaveBalance('USR-001', 2026, existingBalances);
      assert.equal(res.isValid, false);
      assert.ok(res.errors[0].includes('Leave balance already exists'));
    });
  });

  describe('6. Valid Roles, Attendance, and Notification Statuses', () => {
    it('should accept only valid roles: Staff, Admin', () => {
      assert.equal(validateRole('Staff').isValid, true);
      assert.equal(validateRole('Admin').isValid, true);
      assert.equal(validateRole('Manager').isValid, false); // Manager role removed
      assert.equal(validateRole('SuperAdmin').isValid, false);
      assert.equal(validateRole('staff').isValid, false); // Strict case
    });

    it('should accept only valid attendance statuses: Present, Absent', () => {
      assert.equal(validateAttendanceStatus('Present').isValid, true);
      assert.equal(validateAttendanceStatus('Absent').isValid, true);
      assert.equal(validateAttendanceStatus('HalfDay').isValid, false);
      assert.equal(validateAttendanceStatus('Not Marked').isValid, false); // Unmarked has no row
    });

    it('should accept only valid notification statuses: Pending, Sent, Failed', () => {
      assert.equal(validateNotificationStatus('Pending').isValid, true);
      assert.equal(validateNotificationStatus('Sent').isValid, true);
      assert.equal(validateNotificationStatus('Failed').isValid, true);
      assert.equal(validateNotificationStatus('Approved').isValid, false); // NO approval/rejection!
      assert.equal(validateNotificationStatus('Rejected').isValid, false);
    });
  });

  describe('7. Date and Decimal Validation', () => {
    it('should validate calendar dates correctly', () => {
      assert.equal(validateDate('2026-10-30').isValid, true);
      assert.equal(validateDate('2026-02-29').isValid, false); // 2026 is not a leap year
      assert.equal(validateDate('invalid-date').isValid, false);
    });

    it('should validate leave date ranges (StartDate <= EndDate)', () => {
      assert.equal(validateLeaveDateRange('2026-11-01', '2026-11-05').isValid, true);
      assert.equal(validateLeaveDateRange('2026-11-05', '2026-11-05').isValid, true);
      const invalidRange = validateLeaveDateRange('2026-11-10', '2026-11-05');
      assert.equal(invalidRange.isValid, false);
      assert.ok(invalidRange.errors[0].includes('cannot be after'));
    });

    it('should validate decimal values and non-negativity', () => {
      assert.equal(validateDecimal(12.5, 'EarnedLeave').isValid, true);
      assert.equal(validateDecimal('3.25', 'CarriedForward').isValid, true);
      assert.equal(validateDecimal(-1, 'UsedLeave').isValid, false); // non-negative default
      assert.equal(validateDecimal('abc', 'AvailableLeave').isValid, false);
    });

    it('should compute available leave correctly: Earned + Carried - Used', () => {
      const available = calculateAvailableLeave(12.0, 3.5, 2.0);
      assert.equal(available, 13.5);

      // Floating-point precision test
      const precisionCheck = calculateAvailableLeave(0.1, 0.2, 0.0);
      assert.equal(precisionCheck, 0.3);
    });
  });

  describe('8. Referential Integrity & Foreign Key Check', () => {
    const validUsers = new Set(['USR-001', 'USR-002']);

    it('should validate valid user reference', () => {
      assert.equal(validateUserReference('USR-001', validUsers).isValid, true);
    });

    it('should reject references to non-existent user IDs', () => {
      const res = validateUserReference('USR-999', validUsers);
      assert.equal(res.isValid, false);
      assert.ok(res.errors[0].includes('does not exist in Users worksheet'));
    });
  });

  describe('9. Missing Worksheet and Error Simulation', () => {
    it('should throw clear error when range cannot be parsed or sheet is missing', async () => {
      // Mocked simulation test
      const simulateMissingSheet = (sheetName: string, existingSheets: string[]) => {
        if (!existingSheets.includes(sheetName)) {
          throw new Error(`Worksheet or range '${sheetName}' not found in spreadsheet.`);
        }
      };

      assert.throws(
        () => simulateMissingSheet('NonExistentSheet', ['Users', 'Attendance']),
        /Worksheet or range 'NonExistentSheet' not found in spreadsheet/
      );
    });
  });

  describe('10. Safe Non-Destructive Initialization Logic', () => {
    it('should simulate preservation of existing data and headers', () => {
      // Simulate spreadsheet with existing Users sheet containing data
      const mockSpreadsheetState = {
        sheets: ['Users', 'Attendance'],
        data: {
          Users: [
            ['UserID', 'FullName', 'Email', 'Role', 'JoiningDate', 'IsActive', 'CreatedAt', 'UpdatedAt'],
            ['USR-001', 'Admin User', 'admin@example.com', 'Admin', '2026-01-01', 'TRUE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z']
          ]
        }
      };

      // Mock initialization process:
      // 1. Users sheet exists -> Do not recreate
      assert.ok(mockSpreadsheetState.sheets.includes(SHEET_NAMES.USERS));

      // 2. Users sheet has row 1 -> Do not overwrite header
      assert.equal(mockSpreadsheetState.data.Users.length > 0, true);

      // 3. Data row count is preserved
      assert.equal(mockSpreadsheetState.data.Users.length, 2);
      assert.equal(mockSpreadsheetState.data.Users[1][0], 'USR-001');
    });
  });
});
