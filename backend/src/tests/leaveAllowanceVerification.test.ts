import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { leaveService } from '../services/leave.service.js';
import { leavePolicyService } from '../services/leavePolicy.service.js';
import { userService } from '../services/userService.js';
import { holidayService } from '../services/holiday.service.js';
import { activityLogService } from '../services/activityLog.service.js';
import { emailService } from '../services/email.service.js';
import { UserRow } from '../types/database.types.js';
import { requireAdmin, requireManager, requireStaff } from '../middlewares/role.middleware.js';
import { leaveController } from '../controllers/leave.controller.js';

describe('--- [LEAVE ALLOWANCE & VERIFICATION TEST SUITE] TC Tracker ---', () => {
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
    JoiningDate: '2026-06-15',
    IsActive: 'TRUE',
    CreatedAt: '2026-06-15T00:00:00Z',
    UpdatedAt: '2026-06-15T00:00:00Z',
  };

  const manager: UserRow = {
    UserID: 'USR-MGR-01',
    FullName: 'Mary Manager',
    Email: 'mary@institution.edu',
    Role: 'Admin',
    JoiningDate: '2024-01-01',
    IsActive: 'TRUE',
    CreatedAt: '2024-01-01T00:00:00Z',
    UpdatedAt: '2024-01-01T00:00:00Z',
  };

  const admin: UserRow = {
    UserID: 'USR-ADM-01',
    FullName: 'Adam Admin',
    Email: 'admin@institution.edu',
    Role: 'Admin',
    JoiningDate: '2023-01-01',
    IsActive: 'TRUE',
    CreatedAt: '2023-01-01T00:00:00Z',
    UpdatedAt: '2023-01-01T00:00:00Z',
  };

  beforeEach(() => {
    leaveService.clearMockData();
    holidayService.clearMockHolidays();
    activityLogService.clearMockLogs();
    emailService.clearMockEmailLogs();
    userService.clearCache();

    userService.setMockUser(staff1);
    userService.setMockUser(staff2);
    userService.setMockUser(manager);
    userService.setMockUser(admin);
  });

  // Helper to create mock Express response supporting method chaining
  function createMockResponse(callback: (statusCode: number, data: any) => void) {
    let capturedCode = 200;
    return {
      status(code: number) {
        capturedCode = code;
        return this;
      },
      json(body: any) {
        callback(capturedCode, body);
        return this;
      },
      send(body: any) {
        callback(capturedCode, body);
        return this;
      },
      setHeader() {
        return this;
      },
    } as any;
  }

  // ---------------------------------------------------------------------------
  // 1. Leave taken within accrued allowance
  // ---------------------------------------------------------------------------
  it('1. Leave taken within accrued allowance: records successfully with no excess warning and no automatic deduction', async () => {
    leaveService.setMockBalances([
      {
        LeaveBalanceID: 'BAL-2026-USR-STAFF-01',
        UserID: 'USR-STAFF-01',
        CalendarYear: 2026,
        EarnedLeave: 10.0,
        CarriedForward: 0,
        UsedLeave: 0,
        AvailableLeave: 10.0,
        UpdatedAt: new Date().toISOString(),
      },
    ]);

    // Request 3 days (Nov 2 to Nov 4 = 3 working days)
    const result = await leaveService.submitLeaveRequest('USR-STAFF-01', {
      leaveType: 'Casual',
      startDate: '2026-11-02',
      endDate: '2026-11-04',
      reason: 'Personal time off',
    });

    assert.ok(result.request.LeaveRequestID, 'Request must be generated');
    assert.equal(result.calculatedDays, 3, 'Calculated days must be 3');
    assert.equal(result.warning, undefined, 'Within allowance must not produce an excess warning');

    // Informational mode: balance is NOT automatically deducted
    const balance = await leaveService.getUserBalance('USR-STAFF-01', 2026);
    assert.equal(balance.AvailableLeave, 10.0, 'Balance must not be automatically deducted');
    assert.equal(balance.UsedLeave, 0);

    // Leave request is recorded in store
    const userRequests = await leaveService.getUserRequests('USR-STAFF-01');
    assert.equal(userRequests.length, 1);
    assert.equal(userRequests[0].LeaveRequestID, result.request.LeaveRequestID);
  });

  // ---------------------------------------------------------------------------
  // 2. Leave taken exactly equal to accrued allowance
  // ---------------------------------------------------------------------------
  it('2. Leave taken exactly equal to accrued allowance: records successfully without warning', async () => {
    leaveService.setMockBalances([
      {
        LeaveBalanceID: 'BAL-2026-USR-STAFF-01',
        UserID: 'USR-STAFF-01',
        CalendarYear: 2026,
        EarnedLeave: 5.0,
        CarriedForward: 0,
        UsedLeave: 0,
        AvailableLeave: 5.0,
        UpdatedAt: new Date().toISOString(),
      },
    ]);

    // Request exactly 5 working days (Nov 2 to Nov 6 = 5 working days)
    const result = await leaveService.submitLeaveRequest('USR-STAFF-01', {
      leaveType: 'Annual',
      startDate: '2026-11-02',
      endDate: '2026-11-06',
      reason: 'Vacation',
    });

    assert.ok(result.request.LeaveRequestID);
    assert.equal(result.calculatedDays, 5.0);
    assert.equal(result.warning, undefined, 'Exactly equal to allowance must not produce an excess warning');

    // Informational mode: submission is recorded and balance is not altered
    const balance = await leaveService.getUserBalance('USR-STAFF-01', 2026);
    assert.equal(balance.AvailableLeave, 5.0);
  });

  // ---------------------------------------------------------------------------
  // 3. Leave taken exceeding allowance
  // ---------------------------------------------------------------------------
  it('3. Leave taken exceeding allowance: continues recording, does not block/reject, shows clear excess warning, no LOP and no balance modification', async () => {
    leaveService.setMockBalances([
      {
        LeaveBalanceID: 'BAL-2026-USR-STAFF-01',
        UserID: 'USR-STAFF-01',
        CalendarYear: 2026,
        EarnedLeave: 3.0,
        CarriedForward: 0,
        UsedLeave: 0,
        AvailableLeave: 3.0,
        UpdatedAt: new Date().toISOString(),
      },
    ]);

    // Request 5 working days when allowance is 3 days (exceeds by 2 days)
    const result = await leaveService.submitLeaveRequest('USR-STAFF-01', {
      leaveType: 'Medical',
      startDate: '2026-11-02',
      endDate: '2026-11-06',
      reason: 'Medical treatment',
    });

    // 1. Continue recording the leave (not blocked, not rejected)
    assert.ok(result.request.LeaveRequestID);
    assert.equal(result.calculatedDays, 5);

    // 2. Clear warning: “Leave taken exceeds accrued allowance by 2 days.”
    assert.ok(result.warning, 'Warning must be provided');
    assert.match(
      result.warning!,
      /Leave taken exceeds accrued allowance by 2 days/i,
      'Warning must clearly state: Leave taken exceeds accrued allowance by 2 days'
    );

    // 3. Do not automatically deduct or modify leave balance
    const balance = await leaveService.getUserBalance('USR-STAFF-01', 2026);
    assert.equal(balance.AvailableLeave, 3.0, 'Balance must remain unchanged');
    assert.equal(balance.UsedLeave, 0);

    // 4. Do not introduce any Loss of Pay (LOP) field or calculation
    assert.equal((result as any).lopDays, undefined);
    assert.equal((result as any).lopAmount, undefined);
    assert.equal((balance as any).LossOfPay, undefined);

    // 5. Saved in requests
    const userRequests = await leaveService.getUserRequests('USR-STAFF-01');
    assert.equal(userRequests.length, 1);
  });

  // ---------------------------------------------------------------------------
  // 4. Leave credited strictly after completed months (5.0d for Sept joiner in Nov)
  // ---------------------------------------------------------------------------
  it('4. Leave credited strictly after completed months (5.0d for Sept joiner in Nov)', () => {
    // Staff joined on Jan 15, 2026:
    const joiningDate = '2026-01-15';

    // On Jan 31: January completed in full -> 1 completed month = 2.5 days
    const jan31 = leavePolicyService.calculateCompletedMonthAccrual(joiningDate, '2026-01-31');
    assert.equal(jan31.completedMonths, 1);
    assert.equal(jan31.accruedDays, 2.5);

    // On Feb 1: January completed, February ongoing -> 1 completed month = 2.5 days
    const feb01 = leavePolicyService.calculateCompletedMonthAccrual(joiningDate, '2026-02-01');
    assert.equal(feb01.completedMonths, 1);
    assert.equal(feb01.accruedDays, 2.5);

    // Mid-year joiner (March 15, 2026 evaluated on March 15): March ongoing -> 0 completed months = 0.0 days
    const mar15Joiner = leavePolicyService.calculateCompletedMonthAccrual('2026-03-15', '2026-03-15', 2026);
    assert.equal(mar15Joiner.completedMonths, 0);
    assert.equal(mar15Joiner.accruedDays, 0);

    // Mid-year joiner (June 15, 2026 evaluated on June 15): June ongoing -> 0 completed months = 0.0 days
    const jun15Joiner = leavePolicyService.calculateCompletedMonthAccrual('2026-06-15', '2026-06-15', 2026);
    assert.equal(jun15Joiner.completedMonths, 0);
    assert.equal(jun15Joiner.accruedDays, 0);

    // Mid-year joiner (Sept 7, 2026 / 7-9-2026): evaluated on Nov 3 (Sept & Oct completed, Nov ongoing) -> 2 completed months = 5.0 days
    const septJoiner = leavePolicyService.calculateCompletedMonthAccrual('7-9-2026', '2026-11-03', 2026);
    assert.equal(septJoiner.completedMonths, 2);
    assert.equal(septJoiner.accruedDays, 5.0);

    // Before joining date: Jan 10 for Jan 15 joiner returns 0
    const beforeJoining = leavePolicyService.calculateCompletedMonthAccrual(joiningDate, '2026-01-10');
    assert.equal(beforeJoining.completedMonths, 0);
    assert.equal(beforeJoining.accruedDays, 0);

    // Prior year joiner (joined 2024): evaluated for 2025 in hindsight -> 12 months = 30.0 days
    const priorYearJoiner = leavePolicyService.calculateCompletedMonthAccrual('2024-05-10', '2026-01-01', 2025);
    assert.equal(priorYearJoiner.completedMonths, 12);
    assert.equal(priorYearJoiner.accruedDays, 30.0);

    // Future year joiner (joining 2027): gets 0 in 2026
    const futureJoiner = leavePolicyService.calculateCompletedMonthAccrual('2027-01-01', '2026-06-01', 2026);
    assert.equal(futureJoiner.completedMonths, 0);
    assert.equal(futureJoiner.accruedDays, 0);
  });

  // ---------------------------------------------------------------------------
  // 5. Valid carry-forward inclusion
  // ---------------------------------------------------------------------------
  it('5. Valid carry-forward inclusion: carries 50% on Dec 31 and includes it in available balance prior to March 31', async () => {
    // Prior year (2026) has 20.0 days unused balance
    leaveService.setMockBalances([
      {
        LeaveBalanceID: 'BAL-2026-USR-STAFF-01',
        UserID: 'USR-STAFF-01',
        CalendarYear: 2026,
        EarnedLeave: 30.0,
        CarriedForward: 0,
        UsedLeave: 10.0,
        AvailableLeave: 20.0,
        UpdatedAt: '2026-12-31T00:00:00Z',
      },
    ]);

    // Admin executes year transition to 2027
    const result = await leaveService.executeYearTransition('USR-ADM-01', 2026, 2027, true);
    assert.equal(result.success, true);

    // In 2027 prior to March 31 (e.g. Jan 15):
    const balJan = await leaveService.getUserBalance('USR-STAFF-01', 2027, '2027-01-15');
    assert.equal(balJan.CarriedForward, 10.0, '50% of 20 days unused = 10 days carried forward');
    assert.equal(balJan.isCarryForwardExpired, false);
    assert.equal(balJan.effectiveCarriedForward, 10.0);
    assert.equal(balJan.EarnedLeave, 0.0, 'January 2027 ongoing on Jan 15 -> 0.0d completed month earned leave');
    assert.equal(balJan.AvailableLeave, 10.0, 'Available balance = valid carry forward (10.0) + earned leave (0.0)');
  });

  // ---------------------------------------------------------------------------
  // 6. Carried-forward leave expiry after March 31
  // ---------------------------------------------------------------------------
  it('6. Carried-forward leave expiry after March 31: dynamically excludes expired carry-forward starting April 1 without destroying historical record', async () => {
    leaveService.setMockBalances([
      {
        LeaveBalanceID: 'BAL-2027-USR-STAFF-01',
        UserID: 'USR-STAFF-01',
        CalendarYear: 2027,
        EarnedLeave: 7.5,
        CarriedForward: 6.0,
        UsedLeave: 2.0,
        AvailableLeave: 11.5,
        UpdatedAt: '2027-01-01T00:00:00Z',
      },
    ]);

    // 1. As of March 31: Carried forward is ACTIVE (Available = 7.5 + 6.0 - 2.0 = 11.5)
    const balMar31 = await leaveService.getUserBalance('USR-STAFF-01', 2027, '2027-03-31');
    assert.equal(balMar31.isCarryForwardExpired, false);
    assert.equal(balMar31.effectiveCarriedForward, 6.0);
    assert.equal(balMar31.AvailableLeave, 11.5);

    // 2. As of April 1: Carried forward is EXPIRED (Available = 7.5 + 0 - 2.0 = 5.5)
    const balApr01 = await leaveService.getUserBalance('USR-STAFF-01', 2027, '2027-04-01');
    assert.equal(balApr01.isCarryForwardExpired, true);
    assert.equal(balApr01.effectiveCarriedForward, 0, 'Effective carried forward must be dynamically 0');
    assert.equal(balApr01.AvailableLeave, 5.5, 'Available leave excludes expired carry forward');

    // 3. Historical stored record is preserved
    assert.equal(balApr01.CarriedForward, 6.0, 'CarriedForward column in database must preserve historical 6.0');
    assert.equal(balApr01.EarnedLeave, 7.5, 'Earned leave remains completely intact');
  });

  // ---------------------------------------------------------------------------
  // 7. Short leave counting working days, including Saturdays
  // ---------------------------------------------------------------------------
  it('7. Short leave counting working days, including Saturdays: < 7 calendar days excludes Sundays and holidays, counts Saturdays as working days', async () => {
    // Range: 2026-11-05 (Thu) to 2026-11-09 (Mon) = 5 continuous calendar days:
    // - Thu Nov 5: Working day
    // - Fri Nov 6: Working day
    // - Sat Nov 7: Saturday -> COUNTED AS WORKING DAY
    // - Sun Nov 8: Sunday -> EXCLUDED
    // - Mon Nov 9: Official Holiday (Diwali) -> EXCLUDED
    holidayService.setMockHolidays([
      {
        HolidayID: 'HOL-001',
        HolidayName: 'Diwali',
        HolidayDate: '2026-11-09',
        Description: 'Festival holiday',
        CreatedBy: 'USR-ADM-01',
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      },
    ]);

    const calc = await leavePolicyService.calculateLeaveDays('2026-11-05', '2026-11-09');
    assert.equal(calc.totalCalendarDays, 5);
    assert.equal(calc.isContinuousSevenDaysOrMore, false);
    assert.equal(calc.sundaysCount, 1);
    assert.equal(calc.holidaysCount, 1);
    assert.equal(calc.workingDaysCount, 3, 'Thu, Fri, and Sat must be counted as working days');
    assert.equal(calc.calculatedDays, 3, 'Short leave must count exactly 3 working days');

    // Verify a 1-day Saturday leave counts as 1 working day
    const satCalc = await leavePolicyService.calculateLeaveDays('2026-11-07', '2026-11-07');
    assert.equal(satCalc.totalCalendarDays, 1);
    assert.equal(satCalc.calculatedDays, 1, 'Saturday must be recognized as a working day');

    // Verify a 1-day Sunday leave counts as 0 working days
    const sunCalc = await leavePolicyService.calculateLeaveDays('2026-11-08', '2026-11-08');
    assert.equal(sunCalc.totalCalendarDays, 1);
    assert.equal(sunCalc.calculatedDays, 0, 'Sunday must be excluded as weekly off');
  });

  // ---------------------------------------------------------------------------
  // 8. Long leave counting all calendar days
  // ---------------------------------------------------------------------------
  it('8. Long leave counting all calendar days: >= 7 calendar days counts every calendar day including Sundays and holidays', async () => {
    holidayService.setMockHolidays([
      {
        HolidayID: 'HOL-001',
        HolidayName: 'Diwali',
        HolidayDate: '2026-11-09',
        Description: 'Festival holiday',
        CreatedBy: 'USR-ADM-01',
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      },
    ]);

    // 7 continuous calendar days: 2026-11-02 (Mon) to 2026-11-08 (Sun)
    const calc7 = await leavePolicyService.calculateLeaveDays('2026-11-02', '2026-11-08');
    assert.equal(calc7.totalCalendarDays, 7);
    assert.equal(calc7.isContinuousSevenDaysOrMore, true);
    assert.equal(calc7.calculatedDays, 7, '>= 7 calendar days must count all 7 calendar days');

    // 10 continuous calendar days spanning Sunday and holiday: 2026-11-01 to 2026-11-10
    const calc10 = await leavePolicyService.calculateLeaveDays('2026-11-01', '2026-11-10');
    assert.equal(calc10.totalCalendarDays, 10);
    assert.equal(calc10.isContinuousSevenDaysOrMore, true);
    assert.equal(calc10.calculatedDays, 10, '>= 7 calendar days must include Sundays and holidays');
  });

  // ---------------------------------------------------------------------------
  // 9. Staff seeing only their own leave records
  // ---------------------------------------------------------------------------
  it('9. Staff seeing only their own leave records: Staff receives only own records; access to all-staff requests or balances is denied (403)', async () => {
    // Seed requests for staff1 and staff2
    leaveService.setMockRequests([
      {
        LeaveRequestID: 'LRQ-STAFF1-01',
        UserID: 'USR-STAFF-01',
        LeaveType: 'Casual',
        StartDate: '2026-11-02',
        EndDate: '2026-11-04',
        CalculatedDays: 3,
        Reason: 'Personal',
        Remarks: '',
        SubmittedAt: '2026-10-30T10:00:00Z',
        NotificationStatus: 'Sent',
      },
      {
        LeaveRequestID: 'LRQ-STAFF2-01',
        UserID: 'USR-STAFF-02',
        LeaveType: 'Medical',
        StartDate: '2026-11-10',
        EndDate: '2026-11-12',
        CalculatedDays: 3,
        Reason: 'Dentist appointment',
        Remarks: '',
        SubmittedAt: '2026-10-31T10:00:00Z',
        NotificationStatus: 'Sent',
      },
    ]);

    // 1. Staff querying own requests: returns only USR-STAFF-01 records
    const staff1Requests = await leaveService.getUserRequests('USR-STAFF-01');
    assert.equal(staff1Requests.length, 1);
    assert.equal(staff1Requests[0].LeaveRequestID, 'LRQ-STAFF1-01');
    assert.equal(staff1Requests.some((r) => r.UserID === 'USR-STAFF-02'), false);

    // 2. Staff attempting to call requireManager endpoint (all-requests): 403 Forbidden
    let managerRouteBlocked = false;
    const staffReq = { user: { userId: 'USR-STAFF-01', role: 'Staff' } } as any;
    requireManager(
      staffReq,
      createMockResponse((code, body) => {
        assert.equal(code, 403);
        assert.match(body.message, /Forbidden.*Admin/);
        managerRouteBlocked = true;
      }),
      () => {
        assert.fail('Staff must not pass requireManager');
      }
    );
    assert.ok(managerRouteBlocked);

    // 3. Staff attempting to call requireAdmin endpoint (all-balances): 403 Forbidden
    let adminRouteBlocked = false;
    requireAdmin(
      staffReq,
      createMockResponse((code, body) => {
        assert.equal(code, 403);
        assert.match(body.message, /Forbidden.*Admin/);
        adminRouteBlocked = true;
      }),
      () => {
        assert.fail('Staff must not pass requireAdmin');
      }
    );
    assert.ok(adminRouteBlocked);

    // 4. Staff querying balance with target userId param: controller enforces target is self
    let capturedBalanceUser = '';
    const mockBalanceReq = {
      user: { userId: 'USR-STAFF-01', role: 'Staff' },
      query: { userId: 'USR-STAFF-02' },
    } as any;
    await leaveController.getBalance(
      mockBalanceReq,
      createMockResponse((code, body) => {
        assert.equal(code, 200);
        capturedBalanceUser = body.data.UserID;
      })
    );
    assert.equal(capturedBalanceUser, 'USR-STAFF-01', 'Staff querying balance cannot view other staff records');
  });

  // ---------------------------------------------------------------------------
  // 10. Admin viewing all staff leave summaries
  // ---------------------------------------------------------------------------
  it('10. Admin viewing all staff leave summaries: Admin views all enriched requests and full balance summaries', async () => {
    // Seed requests and balances for multiple staff members
    leaveService.setMockRequests([
      {
        LeaveRequestID: 'LRQ-STAFF1-01',
        UserID: 'USR-STAFF-01',
        LeaveType: 'Casual',
        StartDate: '2026-11-02',
        EndDate: '2026-11-04',
        CalculatedDays: 3,
        Reason: 'Personal',
        Remarks: '',
        SubmittedAt: '2026-10-30T10:00:00Z',
        NotificationStatus: 'Sent',
      },
      {
        LeaveRequestID: 'LRQ-STAFF2-01',
        UserID: 'USR-STAFF-02',
        LeaveType: 'Medical',
        StartDate: '2026-11-10',
        EndDate: '2026-11-12',
        CalculatedDays: 3,
        Reason: 'Dentist appointment',
        Remarks: '',
        SubmittedAt: '2026-10-31T10:00:00Z',
        NotificationStatus: 'Sent',
      },
    ]);

    leaveService.setMockBalances([
      {
        LeaveBalanceID: 'BAL-2026-USR-STAFF-01',
        UserID: 'USR-STAFF-01',
        CalendarYear: 2026,
        EarnedLeave: 10.0,
        CarriedForward: 5.0,
        UsedLeave: 3.0,
        AvailableLeave: 12.0,
        UpdatedAt: new Date().toISOString(),
      },
      {
        LeaveBalanceID: 'BAL-2026-USR-STAFF-02',
        UserID: 'USR-STAFF-02',
        CalendarYear: 2026,
        EarnedLeave: 5.0,
        CarriedForward: 0,
        UsedLeave: 3.0,
        AvailableLeave: 2.0,
        UpdatedAt: new Date().toISOString(),
      },
    ]);

    // 1. Admin views all enriched requests with employee names
    const enriched = await leaveService.getAllEnrichedRequests();
    assert.equal(enriched.length, 2);
    const e1 = enriched.find((r) => r.UserID === 'USR-STAFF-01');
    const e2 = enriched.find((r) => r.UserID === 'USR-STAFF-02');
    assert.equal(e1?.FullName, 'Alice Staff');
    assert.equal(e2?.FullName, 'Bob Staff');

    // 2. Admin retrieves all balances
    const allBalances = await leaveService.getAllBalances(2026);
    assert.equal(allBalances.length, 2);
    assert.ok(allBalances.some((b) => b.UserID === 'USR-STAFF-01'));
    assert.ok(allBalances.some((b) => b.UserID === 'USR-STAFF-02'));

    // 3. Admin authorization test
    let adminAuthorized = false;
    const adminReq = { user: { userId: 'USR-ADM-01', role: 'Admin' } } as any;
    requireAdmin(adminReq, {} as any, () => {
      adminAuthorized = true;
    });
    assert.ok(adminAuthorized);
  });
});
