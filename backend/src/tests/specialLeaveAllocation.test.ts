import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { leaveService } from '../services/leave.service.js';
import { leavePolicyService } from '../services/leavePolicy.service.js';
import { userService } from '../services/userService.js';
import { holidayService } from '../services/holiday.service.js';
import { activityLogService } from '../services/activityLog.service.js';
import { emailService } from '../services/email.service.js';
import { attendanceService } from '../services/attendance.service.js';
import { UserRow } from '../types/database.types.js';
import { leaveController } from '../controllers/leave.controller.js';
import { dashboardService } from '../services/dashboard.service.js';

describe('--- [SPECIAL LEAVE ALLOCATION TEST SUITE] Critical Section Leave Grants ---', () => {
  const staff1: UserRow = {
    UserID: 'USR-STAFF-01',
    FullName: 'Alice Staff',
    Email: 'alice@institution.edu',
    Role: 'Staff',
    JoiningDate: '2025-01-15',
    IsActive: 'TRUE',
    CreatedAt: '2025-01-15T00:00:00Z',
    UpdatedAt: '2025-01-15T00:00:00Z',
  };

  const staff2: UserRow = {
    UserID: 'USR-STAFF-02',
    FullName: 'Bob Staff',
    Email: 'bob@institution.edu',
    Role: 'Staff',
    JoiningDate: '2026-01-01',
    IsActive: 'TRUE',
    CreatedAt: '2026-01-01T00:00:00Z',
    UpdatedAt: '2026-01-01T00:00:00Z',
  };

  const admin: UserRow = {
    UserID: 'USR-ADM-01',
    FullName: 'Adam Admin',
    Email: 'admin@institution.edu',
    Role: 'Admin',
    JoiningDate: '2024-01-01',
    IsActive: 'TRUE',
    CreatedAt: '2024-01-01T00:00:00Z',
    UpdatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    userService.setMockUsersList([staff1, staff2, admin]);
    leaveService.clearMockData();
    emailService.clearMockEmailLogs();
    holidayService.clearMockHolidays();
    attendanceService.clearMockAttendance();
  });

  it('1. should successfully allocate special leave for an employee with critical section criteria', async () => {
    const result = await leaveService.allocateSpecialLeave(admin.UserID, {
      userIds: [staff1.UserID],
      criticalSection: 'Exam Cell Critical Duty',
      startDate: '2026-11-16', // Mon
      endDate: '2026-11-18',   // Wed (3 working days)
      reason: 'Mandatory on-duty special leave granted for managing continuous semester examinations.',
      exemptFromBalance: true,
      remarks: 'Approval Ref: EXAM-2026-88',
    });

    assert.equal(result.allocatedCount, 1);
    assert.equal(result.requests.length, 1);

    const req = result.requests[0];
    assert.equal(req.UserID, staff1.UserID);
    assert.equal(req.LeaveType, 'Special Leave (Exam Cell Critical Duty)');
    assert.equal(req.CalculatedDays, 3);
    assert.equal(req.Status, 'Recorded');
    assert.ok(req.Remarks.includes('(Exempt from Regular Balance)'));
    assert.ok(req.Remarks.includes('EXAM-2026-88'));

    // Check email log
    const emailLogs = emailService.getMockEmailLogs();
    assert.equal(emailLogs.length, 1);
    assert.equal(emailLogs[0].RecipientEmail, staff1.Email.toLowerCase());
    assert.equal(emailLogs[0].RelatedLeaveRequestID, req.LeaveRequestID);
  });

  it('2. should allocate special leave for multiple employees simultaneously', async () => {
    const result = await leaveService.allocateSpecialLeave(admin.UserID, {
      userIds: [staff1.UserID, staff2.UserID],
      criticalSection: 'Emergency Lab Maintenance',
      startDate: '2026-11-20',
      endDate: '2026-11-20',
      reason: 'Special leave allocation following overnight server outage restoration.',
      exemptFromBalance: true,
    });

    assert.equal(result.allocatedCount, 2);
    assert.equal(result.requests[0].UserID, staff1.UserID);
    assert.equal(result.requests[1].UserID, staff2.UserID);
    assert.equal(result.requests[0].CalculatedDays, 1);
    assert.equal(result.requests[1].CalculatedDays, 1);

    // Verify all requests are in leave records
    const allRequests = await leaveService.getAllRequests();
    assert.equal(allRequests.length, 2);
  });

  it('3. should reject allocation when criticalSection, userIds, or reason is missing', async () => {
    await assert.rejects(
      async () => {
        await leaveService.allocateSpecialLeave(admin.UserID, {
          userIds: [],
          criticalSection: 'Exam Cell',
          startDate: '2026-11-16',
          endDate: '2026-11-18',
          reason: 'Valid reason',
        });
      },
      /At least one employee must be selected/
    );

    await assert.rejects(
      async () => {
        await leaveService.allocateSpecialLeave(admin.UserID, {
          userIds: [staff1.UserID],
          criticalSection: '',
          startDate: '2026-11-16',
          endDate: '2026-11-18',
          reason: 'Valid reason',
        });
      },
      /Critical section\/reason is required/
    );

    await assert.rejects(
      async () => {
        await leaveService.allocateSpecialLeave(admin.UserID, {
          userIds: [staff1.UserID],
          criticalSection: 'Emergency',
          startDate: '2026-11-16',
          endDate: '2026-11-18',
          reason: '   ',
        });
      },
      /justification reason is required/
    );
  });

  it('4. should exempt special leave from regular casual balance deductions and excess calculation', async () => {
    // Staff 1 balance: 5.0 days accrued
    leaveService.setMockBalances([
      {
        LeaveBalanceID: 'BAL-01',
        UserID: staff1.UserID,
        CalendarYear: 2026,
        EarnedLeave: 5,
        CarriedForward: 0,
        UsedLeave: 0,
        AvailableLeave: 5,
        UpdatedAt: '2026-01-01T00:00:00Z',
      },
    ]);

    // Admin allocates 4 days of exempt Special Leave
    await leaveService.allocateSpecialLeave(admin.UserID, {
      userIds: [staff1.UserID],
      criticalSection: 'Hospitalization / Medical Quarantine',
      startDate: '2026-05-04',
      endDate: '2026-05-07', // 4 days
      reason: 'Administrative special quarantine grant',
      exemptFromBalance: true,
    });

    // Staff now submits 4 days of casual leave. Since special leave was exempt,
    // staff has not used their regular 5 days allowance, so no excess warning!
    const subRes = await leaveService.submitLeaveRequest(staff1.UserID, {
      leaveType: 'Casual',
      startDate: '2026-06-01',
      endDate: '2026-06-04', // 4 working days
      reason: 'Personal vacation',
    });

    assert.equal(subRes.calculatedDays, 4);
    assert.equal(subRes.warning, undefined, 'Exempt special leave must not consume regular allowance');
  });

  it('5. should expose endpoint via leaveController and return 201 Created', async () => {
    let statusCode = 200;
    let responseBody: any = null;

    const mockReq: any = {
      user: { userId: admin.UserID, role: 'Admin' },
      body: {
        userIds: [staff1.UserID],
        criticalSection: 'Admissions Peak Duty',
        startDate: '2026-08-10',
        endDate: '2026-08-12',
        reason: 'Compensatory special leave for admission counseling rush.',
        exemptFromBalance: true,
      },
    };

    const mockRes: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: any) {
        responseBody = body;
        return this;
      },
    };

    await leaveController.allocateSpecialLeave(mockReq, mockRes);

    assert.equal(statusCode, 201);
    assert.equal(responseBody.success, true);
    assert.equal(responseBody.data.allocatedCount, 1);
  });

  it('6. should automatically mark working days as Present in Attendance when autoMarkPresent is true', async () => {
    // Range: Friday 2026-11-06 to Tuesday 2026-11-10 (5 calendar days)
    // Sunday is 2026-11-08 (must be skipped)
    // Set 2026-11-09 as an Institute Holiday (must be skipped)
    await holidayService.createHoliday({
      holidayName: 'Diwali Institute Holiday',
      holidayDate: '2026-11-09',
      description: 'Official institute holiday',
      createdBy: admin.UserID,
    });

    const result = await leaveService.allocateSpecialLeave(admin.UserID, {
      userIds: [staff1.UserID],
      criticalSection: 'National Conference Presentation',
      startDate: '2026-11-06', // Fri
      endDate: '2026-11-10',   // Tue
      reason: 'Representing institute at international research symposium.',
      exemptFromBalance: true,
      autoMarkPresent: true,
    });

    assert.equal(result.allocatedCount, 1);
    // Working days: Fri Nov 6, Sat Nov 7, Tue Nov 10 (3 days). Sunday Nov 8 and Diwali Nov 9 are excluded!
    assert.equal(result.autoMarkedAttendanceDays, 3);

    const allAttendance = await attendanceService.getAllAttendance();
    const staffRecords = allAttendance.filter((a) => a.UserID === staff1.UserID);
    assert.equal(staffRecords.length, 3);

    // Verify dates marked Present
    const dates = staffRecords.map((a) => a.AttendanceDate).sort();
    assert.deepEqual(dates, ['2026-11-06', '2026-11-07', '2026-11-10']);
    for (const r of staffRecords) {
      assert.equal(r.Status, 'Present');
      assert.equal(r.MarkedBy, admin.UserID);
    }

    // Verify Sunday and Holiday were NEVER marked
    assert.equal(staffRecords.some((a) => a.AttendanceDate === '2026-11-08'), false);
    assert.equal(staffRecords.some((a) => a.AttendanceDate === '2026-11-09'), false);
  });

  it('7. should NOT auto-mark attendance when autoMarkPresent is explicitly false', async () => {
    const result = await leaveService.allocateSpecialLeave(admin.UserID, {
      userIds: [staff1.UserID],
      criticalSection: 'Medical Quarantine',
      startDate: '2026-12-01',
      endDate: '2026-12-03',
      reason: 'Home quarantine without auto attendance marking.',
      exemptFromBalance: true,
      autoMarkPresent: false,
    });

    assert.equal(result.allocatedCount, 1);
    assert.equal(result.autoMarkedAttendanceDays, 0);

    const allAttendance = await attendanceService.getAllAttendance();
    const staffRecords = allAttendance.filter((a) => a.UserID === staff1.UserID);
    assert.equal(staffRecords.length, 0);
  });

  it('8. should update existing attendance record in-place to Present without duplicates', async () => {
    // Suppose staff1 was initially marked Absent on 2026-11-25
    await attendanceService.markDailyAttendance(
      '2026-11-25',
      [{ userId: staff1.UserID, status: 'Absent' }],
      admin.UserID
    );

    let records = await attendanceService.getAllAttendance();
    assert.equal(records.length, 1);
    assert.equal(records[0].Status, 'Absent');

    // Admin allocates Special Leave for that day with autoMarkPresent
    await leaveService.allocateSpecialLeave(admin.UserID, {
      userIds: [staff1.UserID],
      criticalSection: 'Court Deposition / Official Duty',
      startDate: '2026-11-25',
      endDate: '2026-11-25',
      reason: 'Official court witness duty on behalf of institute.',
      exemptFromBalance: true,
      autoMarkPresent: true,
    });

    records = await attendanceService.getAllAttendance();
    // Must remain 1 record (no duplicate!), but status corrected in-place to Present!
    assert.equal(records.length, 1);
    assert.equal(records[0].Status, 'Present');
  });
});
