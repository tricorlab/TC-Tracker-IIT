import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { attendanceService } from '../services/attendance.service.js';
import { holidayService } from '../services/holiday.service.js';
import { leaveService } from '../services/leave.service.js';
import { leavePolicyService } from '../services/leavePolicy.service.js';
import { emailService } from '../services/email.service.js';
import { userService } from '../services/userService.js';
import { activityLogService } from '../services/activityLog.service.js';
import { dashboardService } from '../services/dashboard.service.js';
import { requireAdmin, requireManager, requireStaff } from '../middlewares/role.middleware.js';
import { UserRow } from '../types/database.types.js';

describe('--- [PHASE 4 TEST SUITE] Attendance & Leave Management Engine ---', () => {
  const staffUser: UserRow = {
    UserID: 'USR-STAFF-01',
    FullName: 'John Staff',
    Email: 'john@example.com',
    Role: 'Staff',
    JoiningDate: '2025-01-01',
    IsActive: 'TRUE',
    CreatedAt: '2025-01-01T00:00:00Z',
    UpdatedAt: '2025-01-01T00:00:00Z',
  };

  const adminUser: UserRow = {
    UserID: 'USR-ADM-01',
    FullName: 'Mary Admin',
    Email: 'admin@example.com',
    Role: 'Admin',
    JoiningDate: '2024-01-01',
    IsActive: 'TRUE',
    CreatedAt: '2024-01-01T00:00:00Z',
    UpdatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    attendanceService.clearMockAttendance();
    holidayService.clearMockHolidays();
    leaveService.clearMockData();
    emailService.clearMockEmailLogs();

    userService.setMockUser(staffUser);
    userService.setMockUser(adminUser);
  });

  describe('1. Attendance Management & Daily Marking', () => {
    it('should report "Not Marked" for employees with no existing attendance record', async () => {
      attendanceService.clearMockAttendance();
      // Date: 2026-11-02 (Monday)
      const daily = await attendanceService.getDailyAttendance('2026-11-02');
      assert.equal(daily.date, '2026-11-02');
      assert.equal(daily.totalStaff >= 1, true);

      const staffItem = daily.staffAttendance.find((s) => s.userId === 'USR-STAFF-01');
      assert.ok(staffItem);
      assert.equal(staffItem.status, 'Not Marked');
      assert.equal(daily.notMarkedCount >= 1, true);
    });

    it('should mark employee Present on a date', async () => {
      const res = await attendanceService.markDailyAttendance(
        '2026-11-02',
        [{ userId: 'USR-STAFF-01', status: 'Present' }],
        'USR-MGR-01'
      );

      assert.equal(res.savedCount, 1);
      assert.equal(res.records[0].Status, 'Present');
      assert.equal(res.records[0].MarkedBy, 'USR-MGR-01');

      const daily = await attendanceService.getDailyAttendance('2026-11-02');
      const staffItem = daily.staffAttendance.find((s) => s.userId === 'USR-STAFF-01');
      assert.ok(staffItem);
      assert.equal(staffItem.status, 'Present');
    });

    it('should mark employee Absent on a date', async () => {
      await attendanceService.markDailyAttendance(
        '2026-11-03',
        [{ userId: 'USR-STAFF-01', status: 'Absent' }],
        'USR-MGR-01'
      );

      const daily = await attendanceService.getDailyAttendance('2026-11-03');
      const staffItem = daily.staffAttendance.find((s) => s.userId === 'USR-STAFF-01');
      assert.ok(staffItem);
      assert.equal(staffItem.status, 'Absent');
    });

    it('should correct an existing attendance record without creating a duplicate', async () => {
      // 1. Initial mark: Absent
      await attendanceService.markDailyAttendance(
        '2026-11-04',
        [{ userId: 'USR-STAFF-01', status: 'Absent' }],
        'USR-MGR-01'
      );

      // 2. Correction: Update to Present
      await attendanceService.markDailyAttendance(
        '2026-11-04',
        [{ userId: 'USR-STAFF-01', status: 'Present' }],
        'USR-MGR-01'
      );

      const all = await attendanceService.getAllAttendance();
      const recordsForDate = all.filter(
        (a) => a.UserID === 'USR-STAFF-01' && a.AttendanceDate === '2026-11-04'
      );

      assert.equal(recordsForDate.length, 1, 'Must strictly maintain at most 1 record per user per date');
      assert.equal(recordsForDate[0].Status, 'Present');
    });

    it('should distinguish Sundays and holidays in monthly attendance summary', async () => {
      holidayService.setMockHolidays([
        {
          HolidayID: 'HOL-001',
          HolidayName: 'Diwali',
          HolidayDate: '2026-11-10',
          Description: 'Festival of Lights',
          CreatedBy: 'USR-MGR-01',
          CreatedAt: new Date().toISOString(),
          UpdatedAt: new Date().toISOString(),
        },
      ]);

      // 2026-11-08 is Sunday (UTC Day 0)
      assert.equal(holidayService.isSunday('2026-11-08'), true);
      assert.equal(holidayService.isSunday('2026-11-09'), false);

      const summary = await attendanceService.getMonthlyAttendanceSummary('USR-STAFF-01', 2026, 11);
      assert.ok(summary.totalSundays >= 4);
      assert.ok(summary.totalHolidays >= 1);

      // Verify that Sundays and holidays have isSunday and isHoliday flags set correctly
      const sunRecord = summary.records.find((r) => r.date === '2026-11-08');
      assert.equal(sunRecord?.isSunday, true);

      const holRecord = summary.records.find((r) => r.date === '2026-11-10');
      assert.equal(holRecord?.isHoliday, true);
      assert.equal(holRecord?.holidayName, 'Diwali');
    });
  });

  describe('2. Holiday Management & Calendar Integrity', () => {
    it('should create a valid holiday and reject duplicate dates', async () => {
      await holidayService.createHoliday({
        holidayName: 'Independence Day',
        holidayDate: '2026-08-15',
        description: 'National Holiday',
        createdBy: 'USR-MGR-01',
      });

      const all = await holidayService.getAllHolidays();
      assert.ok(all.some((h) => h.HolidayDate === '2026-08-15'));

      // Attempt duplicate creation on same date
      await assert.rejects(
        async () => {
          await holidayService.createHoliday({
            holidayName: 'Duplicate Holiday',
            holidayDate: '2026-08-15',
            createdBy: 'USR-MGR-01',
          });
        },
        /Duplicate holiday dates are not permitted/
      );
    });

    it('should update and delete holidays', async () => {
      const created = await holidayService.createHoliday({
        holidayName: 'Republic Day',
        holidayDate: '2026-01-26',
        createdBy: 'USR-MGR-01',
      });

      // Update
      const updated = await holidayService.updateHoliday(
        created.HolidayID,
        { description: 'National Parade' },
        'USR-MGR-01'
      );
      assert.equal(updated.Description, 'National Parade');

      // Delete
      await holidayService.deleteHoliday(created.HolidayID, 'USR-MGR-01');
      const allAfter = await holidayService.getAllHolidays();
      assert.equal(allAfter.some((h) => h.HolidayID === created.HolidayID), false);
    });
  });

  describe('3. Leave Calculation & Policy Engine', () => {
    it('Example A: Should count working days only for leave < 7 continuous calendar days', async () => {
      // Setup: 2026-11-05 (Thu) to 2026-11-09 (Mon) = 5 calendar days:
      // Thu Nov 5: Working Day
      // Fri Nov 6: Working Day
      // Sat Nov 7: Working Day
      // Sun Nov 8: Sunday (Excluded)
      // Mon Nov 9: Holiday (Diwali, Excluded)
      holidayService.setMockHolidays([
        {
          HolidayID: 'HOL-002',
          HolidayName: 'Diwali',
          HolidayDate: '2026-11-09',
          Description: '',
          CreatedBy: 'USR-MGR-01',
          CreatedAt: new Date().toISOString(),
          UpdatedAt: new Date().toISOString(),
        },
      ]);

      const calc = await leavePolicyService.calculateLeaveDays('2026-11-05', '2026-11-09');
      assert.equal(calc.totalCalendarDays, 5);
      assert.equal(calc.isContinuousSevenDaysOrMore, false);
      assert.equal(calc.sundaysCount, 1);
      assert.equal(calc.holidaysCount, 1);
      assert.equal(calc.calculatedDays, 3, '5 calendar days minus 1 Sunday and 1 holiday = 3 working days');
    });

    it('Example B: Should count all 7 calendar days for continuous 7-calendar-day leave', async () => {
      // 2026-11-02 (Mon) to 2026-11-08 (Sun) = 7 continuous calendar days
      const calc = await leavePolicyService.calculateLeaveDays('2026-11-02', '2026-11-08');
      assert.equal(calc.totalCalendarDays, 7);
      assert.equal(calc.isContinuousSevenDaysOrMore, true);
      assert.equal(calc.calculatedDays, 7, '>= 7 calendar days must count all 7 calendar days including Sunday');
    });

    it('Example C: Should count all 10 calendar days for continuous 10-calendar-day leave', async () => {
      // 2026-11-01 (Sun) to 2026-11-10 (Tue) = 10 continuous calendar days
      const calc = await leavePolicyService.calculateLeaveDays('2026-11-01', '2026-11-10');
      assert.equal(calc.totalCalendarDays, 10);
      assert.equal(calc.isContinuousSevenDaysOrMore, true);
      assert.equal(calc.calculatedDays, 10);
    });

    it('should reject invalid leave date range (start after end)', async () => {
      await assert.rejects(
        async () => {
          await leavePolicyService.calculateLeaveDays('2026-11-10', '2026-11-05');
        },
        /cannot be after/
      );
    });

    it('should calculate leave strictly after completed months (5.0d for Sept joiner in Nov)', () => {
      // 1st of month: 2026-01-01 -> on 2026-01-31: 1 completed month = 2.5 days
      assert.deepEqual(leavePolicyService.calculateCompletedMonthAccrual('2026-01-01', '2026-01-31'), {
        completedMonths: 1,
        accruedDays: 2.5,
      });
      // On 2026-02-01: January completed, February ongoing -> 1 completed month = 2.5 days
      assert.deepEqual(leavePolicyService.calculateCompletedMonthAccrual('2026-01-01', '2026-02-01'), {
        completedMonths: 1,
        accruedDays: 2.5,
      });

      // 15th of month: 2026-01-15 -> on 2026-01-31: 1 completed month = 2.5 days
      assert.deepEqual(leavePolicyService.calculateCompletedMonthAccrual('2026-01-15', '2026-01-31'), {
        completedMonths: 1,
        accruedDays: 2.5,
      });
      // On 2026-02-01: January completed, February ongoing -> 1 completed month = 2.5 days
      assert.deepEqual(leavePolicyService.calculateCompletedMonthAccrual('2026-01-15', '2026-02-01'), {
        completedMonths: 1,
        accruedDays: 2.5,
      });

      // September joiner (7-9-2026): as of November 2026 -> 2 completed months up to November (Sept + Oct) = 5.0 days
      assert.deepEqual(leavePolicyService.calculateCompletedMonthAccrual('7-9-2026', '2026-11-03'), {
        completedMonths: 2,
        accruedDays: 5.0,
      });
    });

    it('should test mid-year joiners and Leap-year February', () => {
      // Joined Feb 15 in regular year: on Feb 28, Feb up to Feb = 1 month = 2.5 days
      assert.deepEqual(leavePolicyService.calculateCompletedMonthAccrual('2026-02-15', '2026-02-28'), {
        completedMonths: 1,
        accruedDays: 2.5,
      });
      // On March 1: February completed, March ongoing -> 1 completed month = 2.5 days
      assert.deepEqual(leavePolicyService.calculateCompletedMonthAccrual('2026-02-15', '2026-03-01'), {
        completedMonths: 1,
        accruedDays: 2.5,
      });

      // Leap-year February: joined 2024-02-29 in 2024: on Feb 29, 1 completed month = 2.5 days
      assert.deepEqual(leavePolicyService.calculateCompletedMonthAccrual('2024-02-29', '2024-02-29'), {
        completedMonths: 1,
        accruedDays: 2.5,
      });
      // On March 1: Leap Feb completed, March ongoing -> 1 completed month = 2.5 days
      assert.deepEqual(leavePolicyService.calculateCompletedMonthAccrual('2024-02-29', '2024-03-01'), {
        completedMonths: 1,
        accruedDays: 2.5,
      });
    });

    it('should calculate annual months and reject future joining dates', () => {
      // Prior year joiner: for historical 2025 evaluated in 2026 -> 12 months = 30.0 days
      const res12Months = leavePolicyService.calculateCompletedMonthAccrual('2024-05-10', '2026-04-15', 2025);
      assert.equal(res12Months.completedMonths, 12);
      assert.equal(res12Months.accruedDays, 30.0);

      // Mid-year joined 2026-04-01: on 2026-05-01 -> April completed, May ongoing = 1 completed month = 2.5 days
      const res1Month = leavePolicyService.calculateCompletedMonthAccrual('2026-04-01', '2026-05-01');
      assert.equal(res1Month.completedMonths, 1);
      assert.equal(res1Month.accruedDays, 2.5);

      // September joiner: on 2026-11-03 -> Sept & Oct completed, Nov ongoing = 2 completed months = 5.0 days
      const resSept = leavePolicyService.calculateCompletedMonthAccrual('2026-09-07', '2026-11-03');
      assert.equal(resSept.completedMonths, 2);
      assert.equal(resSept.accruedDays, 5.0);

      // Future joining date: evaluated before joining date returns 0
      const resFuture = leavePolicyService.calculateCompletedMonthAccrual('2027-01-01', '2026-10-31');
      assert.equal(resFuture.completedMonths, 0);
      assert.equal(resFuture.accruedDays, 0);
    });

    it('should calculate 50% carry forward and 50% permanent lapse maintaining decimal precision', () => {
      // 15.0 days unused at year end: exactly 50% (7.50) carried, 50% (7.50) lapsed
      const check15 = leavePolicyService.calculateCarryForwardAmount(15.0, '2027-01-15', 2027);
      assert.equal(check15.carriedForward, 7.5);
      assert.equal(check15.lapsedAmount, 7.5);
      assert.equal(check15.isExpired, false);

      // 7.5 days unused at year end: exactly 50% (3.75) carried, 50% (3.75) lapsed
      const check75 = leavePolicyService.calculateCarryForwardAmount(7.5, '2027-01-15', 2027);
      assert.equal(check75.carriedForward, 3.75);
      assert.equal(check75.lapsedAmount, 3.75);
      assert.equal(check75.isExpired, false);
      assert.equal(check75.carriedForward + check75.lapsedAmount, 7.5);
    });

    it('should dynamically exclude carried-forward leave starting April 1 (March 30 vs 31 vs April 1)', () => {
      // As of March 30 (within Q1): carried forward is active
      const resMar30 = leavePolicyService.calculateCarryForwardAmount(10.0, '2027-03-30', 2027);
      assert.equal(resMar30.carriedForward, 5.0);
      assert.equal(resMar30.lapsedAmount, 5.0);
      assert.equal(resMar30.isExpired, false);

      // As of March 31 (last day of Q1): carried forward is still active
      const resMar31 = leavePolicyService.calculateCarryForwardAmount(10.0, '2027-03-31', 2027);
      assert.equal(resMar31.carriedForward, 5.0);
      assert.equal(resMar31.isExpired, false);

      // As of April 1 (start of Q2): carried forward expires and contributes 0 to available balance
      const resApr01 = leavePolicyService.calculateCarryForwardAmount(10.0, '2027-04-01', 2027);
      assert.equal(resApr01.carriedForward, 0);
      assert.equal(resApr01.lapsedAmount, 5.0);
      assert.equal(resApr01.isExpired, true);

      // Leap year check: 2024-03-31 vs 2024-04-01
      const leapMar31 = leavePolicyService.calculateCarryForwardAmount(10.0, '2024-03-31', 2024);
      assert.equal(leapMar31.carriedForward, 5.0);
      assert.equal(leapMar31.isExpired, false);

      const leapApr01 = leavePolicyService.calculateCarryForwardAmount(10.0, '2024-04-01', 2024);
      assert.equal(leapApr01.carriedForward, 0);
      assert.equal(leapApr01.isExpired, true);
    });

    it('should ensure EarnedLeave and UsedLeave remain usable after carried-forward leave expires', async () => {
      leaveService.setMockBalances([
        {
          LeaveBalanceID: 'BAL-2027-USR-STAFF-01',
          UserID: 'USR-STAFF-01',
          CalendarYear: 2027,
          EarnedLeave: 7.5,
          CarriedForward: 5.0,
          UsedLeave: 2.0,
          AvailableLeave: 10.5,
          UpdatedAt: new Date().toISOString(),
        },
      ]);

      // Before expiry (March 31): Available = Earned (7.5) + Carried (5.0) - Used (2.0) = 10.5
      const balBefore = await leaveService.getUserBalance('USR-STAFF-01', 2027, '2027-03-31');
      assert.equal(balBefore.AvailableLeave, 10.5);
      assert.equal(balBefore.isCarryForwardExpired, false);

      // After expiry (April 1): Available = Earned (7.5) + Carried (0) - Used (2.0) = 5.5
      // Stored CarriedForward is preserved at 5.0 for audit/history!
      const balAfter = await leaveService.getUserBalance('USR-STAFF-01', 2027, '2027-04-01');
      assert.equal(balAfter.CarriedForward, 5.0, 'Stored CarriedForward must not be overwritten');
      assert.equal(balAfter.AvailableLeave, 5.5, 'AvailableLeave dynamically excludes expired CarriedForward');
      assert.equal(balAfter.isCarryForwardExpired, true);
      assert.equal(balAfter.EarnedLeave, 7.5, 'EarnedLeave remains completely usable');
      assert.equal(balAfter.UsedLeave, 2.0);
    });

    it('should retrieve balance repeatedly without duplicating accrual', async () => {
      leaveService.clearMockData();
      userService.setMockUser({
        ...staffUser,
        JoiningDate: '2026-01-15',
      });

      // First balance retrieval on 2026-03-15 (Jan & Feb completed, March ongoing -> 2 months = 5.0 days)
      const b1 = await leaveService.getUserBalance('USR-STAFF-01', 2026, '2026-03-15');
      assert.equal(b1.EarnedLeave, 5.0);
      assert.equal(b1.AvailableLeave, 5.0);

      // Second balance retrieval on same date must return exact same balance without duplicate accrual
      const b2 = await leaveService.getUserBalance('USR-STAFF-01', 2026, '2026-03-15');
      assert.equal(b2.EarnedLeave, 5.0);
      assert.equal(b2.AvailableLeave, 5.0);

      // Third retrieval
      const b3 = await leaveService.getUserBalance('USR-STAFF-01', 2026, '2026-03-15');
      assert.equal(b3.EarnedLeave, 5.0);
      assert.equal(b3.AvailableLeave, 5.0);
    });
  });

  describe('4. Leave Submission & Informational Rules', () => {
    it('should submit an informational leave request without approval workflow or balance reduction', async () => {
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

      const result = await leaveService.submitLeaveRequest('USR-STAFF-01', {
        leaveType: 'Casual',
        startDate: '2026-11-02',
        endDate: '2026-11-04',
        reason: 'Family event',
      });

      assert.ok(result.request.LeaveRequestID);
      assert.equal(result.calculatedDays, 3);
      assert.equal(result.warning, undefined);

      // Verify leave balance was NOT automatically reduced!
      const balanceAfter = await leaveService.getUserBalance('USR-STAFF-01', 2026);
      assert.equal(balanceAfter.AvailableLeave, 10.0, 'Submitting leave request must never automatically deduct balance');
      assert.equal(balanceAfter.UsedLeave, 0);
    });

    it('should show excess-balance warning without blocking submission when requested days exceed balance', async () => {
      leaveService.setMockBalances([
        {
          LeaveBalanceID: 'BAL-2026-USR-STAFF-01',
          UserID: 'USR-STAFF-01',
          CalendarYear: 2026,
          EarnedLeave: 2.0,
          CarriedForward: 0,
          UsedLeave: 0,
          AvailableLeave: 2.0,
          UpdatedAt: new Date().toISOString(),
        },
      ]);

      // Request 5 continuous days (Nov 2 to Nov 6 = 5 working days)
      const result = await leaveService.submitLeaveRequest('USR-STAFF-01', {
        leaveType: 'Medical',
        startDate: '2026-11-02',
        endDate: '2026-11-06',
        reason: 'Medical recovery',
      });

      assert.ok(result.request.LeaveRequestID);
      assert.equal(result.calculatedDays, 5);
      assert.ok(result.warning, 'Warning must be provided');
      assert.match(result.warning!, /Leave taken exceeds accrued allowance by 3 days/);
    });

    it('should record informational email log for Admin notifications', async () => {
      emailService.clearMockEmailLogs();

      await emailService.sendLeaveSubmissionNotifications({
        leaveRequestId: 'LRQ-TEST-01',
        staffName: 'John Staff',
        leaveType: 'Casual',
        startDate: '2026-11-02',
        endDate: '2026-11-04',
        calculatedDays: 3,
        reason: 'Conference',
        submittedAt: new Date().toISOString(),
      });

      const logs = emailService.getMockEmailLogs();
      assert.ok(logs.length >= 1, 'Email notification attempt must be logged in EmailLogs');
      assert.equal(logs[0].RelatedLeaveRequestID, 'LRQ-TEST-01');
      assert.equal(logs[0].RecipientEmail, 'admin@example.com');
    });

    it('should allow Admin to adjust balance with mandatory audit logging', async () => {
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

      const adjusted = await leaveService.adjustBalance('USR-MGR-01', {
        userId: 'USR-STAFF-01',
        calendarYear: 2026,
        usedLeave: 2.0,
        reason: 'Official deduction for 2 utilized days in October',
      });

      assert.equal(adjusted.UsedLeave, 2.0);
      assert.equal(adjusted.AvailableLeave, 3.0, 'Available = Earned (5.0) - Used (2.0) = 3.0');
    });

    it('should test before and after joining date across multiple months', () => {
      // Joining date 2026-01-15
      // 1. Before joining date: 2026-01-10 -> 0 completed months, 0 days
      const beforeJoining = leavePolicyService.calculateCompletedMonthAccrual('2026-01-15', '2026-01-10');
      assert.equal(beforeJoining.completedMonths, 0);
      assert.equal(beforeJoining.accruedDays, 0);

      // 2. On joining date: 2026-01-15 -> January ongoing -> 0 completed months = 0.0 days
      const onJoining = leavePolicyService.calculateCompletedMonthAccrual('2026-01-15', '2026-01-15');
      assert.equal(onJoining.completedMonths, 0);
      assert.equal(onJoining.accruedDays, 0);

      // 3. On Jan 31: January completed in full -> 1 completed month = 2.5 days
      const endJan = leavePolicyService.calculateCompletedMonthAccrual('2026-01-15', '2026-01-31');
      assert.equal(endJan.completedMonths, 1);
      assert.equal(endJan.accruedDays, 2.5);

      // 4. In February: 2026-02-28 -> February completed in full -> 2 completed months = 5.0 days
      const inFeb = leavePolicyService.calculateCompletedMonthAccrual('2026-01-15', '2026-02-28');
      assert.equal(inFeb.completedMonths, 2);
      assert.equal(inFeb.accruedDays, 5.0);

      // 5. In March: 2026-03-01 -> Jan and Feb completed, March ongoing -> 2 completed months = 5.0 days
      const inMar = leavePolicyService.calculateCompletedMonthAccrual('2026-01-15', '2026-03-01');
      assert.equal(inMar.completedMonths, 2);
      assert.equal(inMar.accruedDays, 5.0);

      // 6. In April: 2026-04-01 -> Jan, Feb, and March completed, April ongoing -> 3 completed months = 7.5 days
      const inApr = leavePolicyService.calculateCompletedMonthAccrual('2026-01-15', '2026-04-01');
      assert.equal(inApr.completedMonths, 3);
      assert.equal(inApr.accruedDays, 7.5);
    });
  });

  describe('5. Admin-Controlled Year-End Transition & Dynamic Expiry Engine', () => {
    const adminUser: UserRow = {
      UserID: 'USR-ADM-01',
      FullName: 'Adam Admin',
      Email: 'admin@example.com',
      Role: 'Admin',
      JoiningDate: '2023-01-01',
      IsActive: 'TRUE',
      CreatedAt: '2023-01-01T00:00:00Z',
      UpdatedAt: '2023-01-01T00:00:00Z',
    };

    const staffUser2: UserRow = {
      UserID: 'USR-STAFF-02',
      FullName: 'Sarah Staff',
      Email: 'sarah@example.com',
      Role: 'Staff',
      JoiningDate: '2026-06-15',
      IsActive: 'TRUE',
      CreatedAt: '2026-06-15T00:00:00Z',
      UpdatedAt: '2026-06-15T00:00:00Z',
    };

    const inactiveStaff: UserRow = {
      UserID: 'USR-STAFF-INACTIVE',
      FullName: 'Inactive User',
      Email: 'inactive@example.com',
      Role: 'Staff',
      JoiningDate: '2025-01-01',
      IsActive: 'FALSE',
      CreatedAt: '2025-01-01T00:00:00Z',
      UpdatedAt: '2025-01-01T00:00:00Z',
    };

    const futureStaff: UserRow = {
      UserID: 'USR-STAFF-FUTURE',
      FullName: 'Future User',
      Email: 'future@example.com',
      Role: 'Staff',
      JoiningDate: '2027-02-01',
      IsActive: 'TRUE',
      CreatedAt: '2026-10-01T00:00:00Z',
      UpdatedAt: '2026-10-01T00:00:00Z',
    };

    beforeEach(() => {
      leaveService.clearMockData();
      activityLogService.clearMockLogs();
      userService.clearCache();

      userService.setMockUser(adminUser);
      userService.setMockUser(staffUser);
      userService.setMockUser(staffUser2);
      userService.setMockUser(inactiveStaff);
      userService.setMockUser(futureStaff);
      userService.setMockUser(adminUser);
    });

    it('should preview year transition strictly without modifying balances or activity logs', async () => {
      // Setup source year (2026) balances:
      // staffUser: 30 earned, 10 used -> 20 unused -> 10 carried, 10 lapsed
      // staffUser2: joined 2026-06-15 -> 7 completed calendar months (Jun-Dec) = 17.5 earned, 0 used -> 8.75 carried, 8.75 lapsed
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

      const preview = await leaveService.previewYearTransition(2026, 2027);

      assert.equal(preview.sourceYear, 2026);
      assert.equal(preview.destinationYear, 2027);
      assert.equal(preview.isAlreadyExecuted, false);
      assert.equal(preview.eligibleCount, 2);
      assert.equal(preview.totalCarried, 18.75);
      assert.equal(preview.totalLapsed, 18.75);

      // Verify eligible records
      const r1 = preview.records.find((r) => r.userId === 'USR-STAFF-01');
      assert.ok(r1);
      assert.equal(r1.eligibleUnused, 20.0);
      assert.equal(r1.carryForwardAmount, 10.0);
      assert.equal(r1.lapsedAmount, 10.0);
      assert.equal(r1.status, 'Eligible');

      const r2 = preview.records.find((r) => r.userId === 'USR-STAFF-02');
      assert.ok(r2);
      assert.equal(r2.sourceEarned, 17.5);
      assert.equal(r2.carryForwardAmount, 8.75);
      assert.equal(r2.lapsedAmount, 8.75);
      assert.equal(r2.status, 'Eligible');

      // Verify excluded records
      assert.ok(preview.excludedRecords.length >= 3);
      const exInactive = preview.excludedRecords.find((x) => x.userId === 'USR-STAFF-INACTIVE');
      assert.ok(exInactive);
      assert.equal(exInactive.remarks, 'Account is inactive.');

      const exFuture = preview.excludedRecords.find((x) => x.userId === 'USR-STAFF-FUTURE');
      assert.ok(exFuture);
      assert.match(exFuture.remarks!, /after source year 2026/);

      const exAdmin = preview.excludedRecords.find((x) => x.userId === 'USR-ADM-01');
      assert.ok(exAdmin);
      assert.match(exAdmin.remarks!, /Non-staff role: Admin/);

      // PROVE NO WRITES OCCURRED
      const balancesAfterPreview = await leaveService.getAllBalances();
      assert.equal(balancesAfterPreview.length, 1, 'Balances must remain exactly 1 record');
      assert.equal(balancesAfterPreview[0].CalendarYear, 2026);

      const logsAfterPreview = await activityLogService.getAllLogs();
      assert.equal(logsAfterPreview.length, 0, 'Preview must strictly not write to ActivityLogs');
    });

    it('should enforce Admin-only authorization and deny Staff with 403 Forbidden', () => {
      let staffPassed = false;
      let adminPassed = false;

      // Mock Express Request & Response helpers
      const mockRes = (onStatus: (code: number, body: any) => void) => ({
        status(code: number) {
          return {
            json(body: any) {
              onStatus(code, body);
            },
          };
        },
      });

      // Staff user attempt
      const staffReq = { user: { userId: 'USR-STAFF-01', role: 'Staff' } } as any;
      requireAdmin(staffReq, mockRes((code, body) => {
        assert.equal(code, 403);
        assert.match(body.message, /Forbidden.*Admin/);
        staffPassed = true;
      }) as any, () => {
        assert.fail('Staff must not pass requireAdmin');
      });
      assert.ok(staffPassed, 'Staff must receive 403 Forbidden');

      // Admin user attempt
      const adminReq = { user: { userId: 'USR-ADM-01', role: 'Admin' } } as any;
      requireAdmin(adminReq, {} as any, () => {
        adminPassed = true;
      });
      assert.ok(adminPassed, 'Admin must be authorized');
    });

    it('should execute year transition, carry forward 50%, lapse 50%, and record in ActivityLogs', async () => {
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

      // Execution requires explicit admin confirmation
      await assert.rejects(
        async () => {
          await leaveService.executeYearTransition('USR-ADM-01', 2026, 2027, false);
        },
        /Explicit admin confirmation is required/
      );

      // Successful execution
      const result = await leaveService.executeYearTransition('USR-ADM-01', 2026, 2027, true);
      assert.equal(result.success, true);
      assert.equal(result.sourceYear, 2026);
      assert.equal(result.destinationYear, 2027);
      assert.equal(result.executedBy, 'USR-ADM-01');
      assert.equal(result.processedCount, 2);
      assert.equal(result.totalCarried, 18.75);
      assert.equal(result.totalLapsed, 18.75);

      // Verify destination year (2027) balances on 2027-01-15 (January ongoing -> 0.0d earned leave up to Jan 15)
      const balStaff1 = await leaveService.getUserBalance('USR-STAFF-01', 2027, '2027-01-15');
      assert.equal(balStaff1.CarriedForward, 10.0, '50% of 20.0 unused must be carried forward');
      assert.equal(balStaff1.EarnedLeave, 0.0, 'January 2027 ongoing on Jan 15 -> 0.0d completed month earned leave');
      assert.equal(balStaff1.AvailableLeave, 10.0, 'Available = Earned (0.0) + Carried (10.0) = 10.0');

      const balStaff2 = await leaveService.getUserBalance('USR-STAFF-02', 2027, '2027-01-15');
      assert.equal(balStaff2.CarriedForward, 8.75, '50% of 17.5 unused must be carried forward');
      assert.equal(balStaff2.EarnedLeave, 0.0, 'January 2027 ongoing on Jan 15 -> 0.0d completed month earned leave');
      assert.equal(balStaff2.AvailableLeave, 8.75, 'Available = Earned (0.0) + Carried (8.75) = 8.75');

      // Verify source year (2026) balances are intact and not modified
      const sourceBal = (await leaveService.getAllBalances(2026)).find((b) => b.UserID === 'USR-STAFF-01');
      assert.ok(sourceBal);
      assert.equal(sourceBal.EarnedLeave, 30.0);
      assert.equal(sourceBal.UsedLeave, 10.0);

      // Verify ActivityLogs entry
      const logs = await activityLogService.getAllLogs();
      const transitionLog = logs.find((l) => l.Action === 'YEAR_TRANSITION_EXECUTED');
      assert.ok(transitionLog, 'Activity log must be recorded for year transition');
      assert.equal(transitionLog.PerformedBy, 'USR-ADM-01');
      assert.equal(transitionLog.EntityID, 'TRANSITION-2026-2027');
      assert.match(transitionLog.Reason, /Carried: 18.75 days, Lapsed: 18.75 days/);

      const logPayload = JSON.parse(transitionLog.NewValue);
      assert.equal(logPayload.sourceYear, 2026);
      assert.equal(logPayload.destinationYear, 2027);
      assert.equal(logPayload.totalCarried, 18.75);
      assert.equal(logPayload.totalLapsed, 18.75);
      assert.equal(logPayload.summary.length, 2);
    });

    it('should prevent duplicate transition execution with an informative rejection message', async () => {
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

      // Execute first time
      await leaveService.executeYearTransition('USR-ADM-01', 2026, 2027, true);

      // Attempt duplicate execution
      await assert.rejects(
        async () => {
          await leaveService.executeYearTransition('USR-ADM-01', 2026, 2027, true);
        },
        /Year transition from 2026 to 2027 was already executed.*Duplicate execution is rejected/
      );

      // Verify destination year records are not duplicated
      const destBalances = await leaveService.getAllBalances(2027);
      assert.equal(destBalances.length, 2, 'Destination balances must not be duplicated');
    });

    it('should handle partial failure safely without reporting success or marking transition complete, and allow safe retry', async () => {
      leaveService.setMockBalances([
        {
          LeaveBalanceID: 'BAL-2027-USR-STAFF-01',
          UserID: 'USR-STAFF-01',
          CalendarYear: 2027,
          EarnedLeave: 30.0,
          CarriedForward: 0,
          UsedLeave: 10.0,
          AvailableLeave: 20.0,
          UpdatedAt: '2027-12-31T00:00:00Z',
        },
      ]);

      // Simulate failure on second employee
      leaveService.setSimulatedFailureUserId('USR-STAFF-02');

      await assert.rejects(
        async () => {
          await leaveService.executeYearTransition('USR-ADM-01', 2027, 2028, true);
        },
        /Partial failure during year transition from 2027 to 2028: successfully processed 1 of 3 employees.*Transition not marked as complete/
      );

      // Verify transition is NOT marked as executed
      const check = await leaveService.isTransitionExecuted(2027, 2028);
      assert.equal(check.executed, false, 'Transition must not be marked as executed after partial failure');

      // Verify NO YEAR_TRANSITION_EXECUTED log exists
      const logs = await activityLogService.getAllLogs();
      const failedTransLog = logs.find((l) => l.EntityID === 'TRANSITION-2027-2028');
      assert.equal(failedTransLog, undefined, 'No completion log should be written on partial failure');

      // Clear simulated failure and retry transition
      leaveService.setSimulatedFailureUserId(null);
      const retryResult = await leaveService.executeYearTransition('USR-ADM-01', 2027, 2028, true);
      assert.equal(retryResult.success, true);
      assert.equal(retryResult.processedCount, 3);

      // Verify no duplicate records created in 2028
      const dest2028 = await leaveService.getAllBalances(2028);
      assert.equal(dest2028.length, 3, 'Retrying transition must update existing records in-place without duplicate rows');
    });

    it('should dynamically exclude carried-forward leave starting April 1 and maintain consistency across balance endpoints', async () => {
      leaveService.setMockBalances([
        {
          LeaveBalanceID: 'BAL-2027-USR-STAFF-01',
          UserID: 'USR-STAFF-01',
          CalendarYear: 2027,
          EarnedLeave: 7.5,
          CarriedForward: 5.0,
          UsedLeave: 2.0,
          AvailableLeave: 10.5,
          UpdatedAt: '2027-01-01T00:00:00Z',
        },
      ]);

      // As of March 30, 2027: Active
      const bMar30 = await leaveService.getUserBalance('USR-STAFF-01', 2027, '2027-03-30');
      assert.equal(bMar30.AvailableLeave, 10.5);
      assert.equal(bMar30.isCarryForwardExpired, false);
      assert.equal(bMar30.effectiveCarriedForward, 5.0);

      // As of March 31, 2027: Active
      const bMar31 = await leaveService.getUserBalance('USR-STAFF-01', 2027, '2027-03-31');
      assert.equal(bMar31.AvailableLeave, 10.5);
      assert.equal(bMar31.isCarryForwardExpired, false);
      assert.equal(bMar31.effectiveCarriedForward, 5.0);

      // As of April 1, 2027: Expired dynamically (CarriedForward contributes 0 to AvailableLeave)
      const bApr01 = await leaveService.getUserBalance('USR-STAFF-01', 2027, '2027-04-01');
      assert.equal(bApr01.CarriedForward, 5.0, 'Database stored CarriedForward must remain 5.0 for audit/history');
      assert.equal(bApr01.effectiveCarriedForward, 0, 'Effective carried forward is dynamically 0');
      assert.equal(bApr01.AvailableLeave, 5.5, 'AvailableLeave = 7.5 (Earned) + 0 - 2.0 (Used) = 5.5');
      assert.equal(bApr01.isCarryForwardExpired, true);

      // Admin endpoint getAllBalances consistency check as of April 1
      const allApr01 = await leaveService.getAllBalances(2027, '2027-04-01');
      const adminBalStaff1 = allApr01.find((b) => b.UserID === 'USR-STAFF-01');
      assert.ok(adminBalStaff1);
      assert.equal(adminBalStaff1.AvailableLeave, bApr01.AvailableLeave, 'Admin and Staff views must be 100% consistent');
      assert.equal(adminBalStaff1.isCarryForwardExpired, true);
      assert.equal(adminBalStaff1.effectiveCarriedForward, 0);
    });

    it('should reflect transitionPending warning before transition and clear it after transition', async () => {
      // Setup prior year (2026) with unused balance
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

      // Query 2027 balance BEFORE 2026->2027 transition has executed
      const balBeforeTrans = await leaveService.getUserBalance('USR-STAFF-01', 2027, '2027-01-15');
      assert.equal(balBeforeTrans.transitionPending, true, 'transitionPending must be true when prior year rollover is due');
      assert.equal(balBeforeTrans.CarriedForward, 0);

      // Execute year transition
      await leaveService.executeYearTransition('USR-ADM-01', 2026, 2027, true);

      // Query 2027 balance AFTER transition has executed
      const balAfterTrans = await leaveService.getUserBalance('USR-STAFF-01', 2027, '2027-01-15');
      assert.equal(balAfterTrans.transitionPending, false, 'transitionPending must be false after rollover executes');
      assert.equal(balAfterTrans.CarriedForward, 10.0);
    });
  });

  describe('6. Leave Withdrawal & Cancellation Workflow', () => {
    it('should allow Staff to withdraw their own upcoming leave request and restore allowance', async () => {
      const futureStart = '2030-06-01';
      const futureEnd = '2030-06-05';

      const submitted = await leaveService.submitLeaveRequest('USR-STAFF-01', {
        leaveType: 'Casual',
        startDate: futureStart,
        endDate: futureEnd,
        reason: 'Future summer trip',
      });
      assert.ok(submitted.request.LeaveRequestID);
      assert.equal(submitted.request.Status, 'Recorded');

      const withdrawn = await leaveService.cancelLeaveRequest(
        { userId: 'USR-STAFF-01', role: 'Staff' },
        submitted.request.LeaveRequestID,
        'Trip postponed'
      );

      assert.equal(withdrawn.Status, 'Withdrawn');
      assert.ok(withdrawn.Remarks.includes('Trip postponed'));

      // Check ActivityLogs
      const logs = await activityLogService.getAllLogs();
      const cancelLog = logs.find((l) => l.Action === 'LEAVE_WITHDRAWN' && l.EntityID === submitted.request.LeaveRequestID);
      assert.ok(cancelLog, 'ActivityLog must record LEAVE_WITHDRAWN');
      assert.equal(cancelLog?.PerformedBy, 'USR-STAFF-01');
    });

    it("should reject Staff from withdrawing another staff member's leave request (403 Forbidden)", async () => {
      const submitted = await leaveService.submitLeaveRequest('USR-STAFF-01', {
        leaveType: 'Casual',
        startDate: '2030-07-01',
        endDate: '2030-07-02',
        reason: 'Conference',
      });

      await assert.rejects(
        async () => {
          await leaveService.cancelLeaveRequest(
            { userId: 'USR-OTHER-STAFF', role: 'Staff' },
            submitted.request.LeaveRequestID
          );
        },
        (err: any) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /not authorized/i);
          return true;
        }
      );
    });

    it('should reject Staff from withdrawing past leave notices (400 Bad Request)', async () => {
      leaveService.setMockRequests([
        {
          LeaveRequestID: 'LRQ-PAST-01',
          UserID: 'USR-STAFF-01',
          LeaveType: 'Casual',
          StartDate: '2020-01-01',
          EndDate: '2020-01-03',
          CalculatedDays: 3,
          Reason: 'Past vacation',
          Remarks: '',
          SubmittedAt: '2020-01-01T00:00:00Z',
          NotificationStatus: 'Sent',
          Status: 'Recorded',
        },
      ]);

      await assert.rejects(
        async () => {
          await leaveService.cancelLeaveRequest(
            { userId: 'USR-STAFF-01', role: 'Staff' },
            'LRQ-PAST-01'
          );
        },
        (err: any) => {
          assert.equal(err.statusCode, 400);
          assert.match(err.message, /past or ongoing/i);
          return true;
        }
      );
    });

    it('should prevent withdrawing an already withdrawn leave request (400 Bad Request)', async () => {
      const submitted = await leaveService.submitLeaveRequest('USR-STAFF-01', {
        leaveType: 'Casual',
        startDate: '2030-08-01',
        endDate: '2030-08-02',
        reason: 'Doctor appointment',
      });

      await leaveService.cancelLeaveRequest(
        { userId: 'USR-STAFF-01', role: 'Staff' },
        submitted.request.LeaveRequestID
      );

      await assert.rejects(
        async () => {
          await leaveService.cancelLeaveRequest(
            { userId: 'USR-STAFF-01', role: 'Staff' },
            submitted.request.LeaveRequestID
          );
        },
        (err: any) => {
          assert.equal(err.statusCode, 400);
          assert.match(err.message, /already been withdrawn/i);
          return true;
        }
      );
    });

    it('should allow Admin to withdraw any leave request regardless of owner', async () => {
      const submitted = await leaveService.submitLeaveRequest('USR-STAFF-01', {
        leaveType: 'Casual',
        startDate: '2030-09-01',
        endDate: '2030-09-02',
        reason: 'Event',
      });

      const adminWithdrawn = await leaveService.cancelLeaveRequest(
        { userId: 'USR-ADM-01', role: 'Admin' },
        submitted.request.LeaveRequestID,
        'Admin cancellation override'
      );

      assert.equal(adminWithdrawn.Status, 'Withdrawn');
      assert.ok(adminWithdrawn.Remarks.includes('Admin cancellation override'));
    });
  });

  describe('7. Phase A Admin Dashboard Data & Roster Engine', () => {
    it('should aggregate onLeaveToday excluding withdrawn and outside-date leaves', async () => {
      // Setup leaves
      leaveService.clearMockData();
      leaveService.setMockRequests([
        {
          LeaveRequestID: 'LRQ-ACTIVE-01',
          UserID: 'USR-STAFF-01',
          LeaveType: 'Casual',
          StartDate: '2026-11-10',
          EndDate: '2026-11-15',
          CalculatedDays: 5,
          Reason: 'Family wedding',
          Remarks: '',
          SubmittedAt: '2026-11-01T00:00:00Z',
          NotificationStatus: 'Sent',
          Status: 'Recorded',
        },
        {
          LeaveRequestID: 'LRQ-WITHDRAWN-01',
          UserID: 'USR-STAFF-01',
          LeaveType: 'Sick',
          StartDate: '2026-11-10',
          EndDate: '2026-11-15',
          CalculatedDays: 5,
          Reason: 'Doctor visit',
          Remarks: 'Withdrawn',
          SubmittedAt: '2026-11-01T00:00:00Z',
          NotificationStatus: 'Sent',
          Status: 'Withdrawn',
        },
        {
          LeaveRequestID: 'LRQ-FUTURE-01',
          UserID: 'USR-STAFF-01',
          LeaveType: 'Earned',
          StartDate: '2026-11-20',
          EndDate: '2026-11-25',
          CalculatedDays: 5,
          Reason: 'Holiday vacation',
          Remarks: '',
          SubmittedAt: '2026-11-01T00:00:00Z',
          NotificationStatus: 'Sent',
          Status: 'Recorded',
        },
      ]);

      const adminDashboard = await dashboardService.getAdminDashboard('2026-11-12');
      assert.ok(Array.isArray(adminDashboard.onLeaveToday));
      assert.equal(adminDashboard.onLeaveToday.length, 1);
      assert.equal(adminDashboard.onLeaveToday[0].userId, 'USR-STAFF-01');
      assert.equal(adminDashboard.onLeaveToday[0].leaveType, 'Casual');
      assert.equal(adminDashboard.onLeaveToday[0].startDate, '2026-11-10');
      assert.equal(adminDashboard.onLeaveToday[0].endDate, '2026-11-15');
    });

    it('should identify staff exceeding accrued leave allowance in leaveSummary.exceedingStaff', async () => {
      leaveService.clearMockData();
      leaveService.setMockBalances([
        {
          LeaveBalanceID: 'BAL-2026-STAFF-01',
          UserID: 'USR-STAFF-01',
          CalendarYear: 2026,
          EarnedLeave: 2,
          CarriedForward: 0,
          UsedLeave: 0,
          AvailableLeave: 2,
          UpdatedAt: '2026-11-01T00:00:00Z',
        },
      ]);
      leaveService.setMockRequests([
        {
          LeaveRequestID: 'LRQ-EXCEED-01',
          UserID: 'USR-STAFF-01',
          LeaveType: 'Casual',
          StartDate: '2026-05-10',
          EndDate: '2026-05-16',
          CalculatedDays: 5,
          Reason: 'Emergency trip',
          Remarks: '',
          SubmittedAt: '2026-05-01T00:00:00Z',
          NotificationStatus: 'Sent',
          Status: 'Recorded',
        },
      ]);

      const adminDashboard = await dashboardService.getAdminDashboard('2026-11-12');
      assert.ok(adminDashboard.leaveSummary);
      assert.equal(adminDashboard.leaveSummary.exceedingStaffCount, 1);
      assert.equal(adminDashboard.leaveSummary.exceedingStaff.length, 1);
      assert.equal(adminDashboard.leaveSummary.exceedingStaff[0].userId, 'USR-STAFF-01');
      assert.equal(adminDashboard.leaveSummary.exceedingStaff[0].leaveTaken, 5);
      assert.equal(adminDashboard.leaveSummary.exceedingStaff[0].accruedAllowance, 2);
      assert.equal(adminDashboard.leaveSummary.exceedingStaff[0].excessDays, 3);
    });
  });
});
