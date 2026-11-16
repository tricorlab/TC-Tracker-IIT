import { userService } from './userService.js';
import { attendanceService } from './attendance.service.js';
import { leaveService } from './leave.service.js';
import { holidayService } from './holiday.service.js';
import { activityLogService } from './activityLog.service.js';
import { leavePolicyService } from './leavePolicy.service.js';

export class DashboardService {
  /**
   * Aggregate Staff Dashboard Data.
   */
  public async getStaffDashboard(userId: string) {
    const user = await userService.getUserById(userId);
    if (!user) throw new Error('User not found.');

    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;

    // Leave Balance
    const balance = await leaveService.getUserBalance(userId, currentYear);

    // Monthly attendance summary
    const monthlyAttendance = await attendanceService.getMonthlyAttendanceSummary(
      userId,
      currentYear,
      currentMonth
    );

    // Recent leave requests (up to 5)
    const allRequests = await leaveService.getUserRequests(userId);
    const recentRequests = allRequests.slice(0, 5);

    // Calculate current month's leave days from approved/recorded requests (excluding withdrawn/cancelled)
    const activeRequests = allRequests.filter(
      (r) => r.Status !== 'Withdrawn' && r.Status !== 'Cancelled'
    );
    const mStr = String(currentMonth).padStart(2, '0');
    const monthStart = `${currentYear}-${mStr}-01`;
    const lastDayOfMonth = new Date(Date.UTC(currentYear, currentMonth, 0)).getUTCDate();
    const monthEnd = `${currentYear}-${mStr}-${String(lastDayOfMonth).padStart(2, '0')}`;

    const currentMonthLeaves = activeRequests.filter(
      (r) => r.StartDate && r.EndDate && r.StartDate.trim() <= monthEnd && r.EndDate.trim() >= monthStart
    );
    let leaveCount = 0;
    for (const r of currentMonthLeaves) {
      const s = r.StartDate.trim();
      const e = r.EndDate.trim();
      const calcDays = parseFloat(String(r.CalculatedDays || (r as any).RequestedDays || 0)) || 0;
      if (s >= monthStart && e <= monthEnd) {
        leaveCount += calcDays;
      } else {
        const oStart = s < monthStart ? monthStart : s;
        const oEnd = e > monthEnd ? monthEnd : e;
        const [sY, sM, sD] = s.split('-').map(Number);
        const [eY, eM, eD] = e.split('-').map(Number);
        const totalSpan = Math.max(1, Math.round((Date.UTC(eY, eM - 1, eD) - Date.UTC(sY, sM - 1, sD)) / 86400000) + 1);
        const [osY, osM, osD] = oStart.split('-').map(Number);
        const [oeY, oeM, oeD] = oEnd.split('-').map(Number);
        const overlapSpan = Math.max(0, Math.round((Date.UTC(oeY, oeM - 1, oeD) - Date.UTC(osY, osM - 1, osD)) / 86400000) + 1);
        if (calcDays === totalSpan) {
          leaveCount += overlapSpan;
        } else {
          leaveCount += Math.round(calcDays * (overlapSpan / totalSpan) * 100) / 100;
        }
      }
    }
    leaveCount = Math.round(leaveCount * 100) / 100;

    // Recent attendance records (last 7 days)
    const allAttendance = await attendanceService.getEmployeeAttendanceHistory(userId);
    const recentAttendance = allAttendance.slice(0, 7).map((a) => ({
      ...a,
      date: a.AttendanceDate,
      Date: a.AttendanceDate,
      status: a.Status,
      Status: a.Status,
    }));

    // Upcoming holidays
    const allHolidays = await holidayService.getHolidaysByYear(currentYear);
    const todayStr = now.toISOString().slice(0, 10);
    const upcomingHolidays = allHolidays
      .filter((h) => h.HolidayDate >= todayStr)
      .slice(0, 4);

    // Calculate annual leave taken from recorded requests & balance usedLeave (excluding exempt special leaves)
    const yearPrefix = `${currentYear}-`;
    const regularYearLeaves = activeRequests.filter(
      (r) =>
        !(r.Remarks && r.Remarks.includes('(Exempt from Regular Balance)')) &&
        ((r.StartDate && r.StartDate.startsWith(yearPrefix)) || (r.EndDate && r.EndDate.startsWith(yearPrefix)))
    );
    const recordedDays = regularYearLeaves.reduce(
      (sum, r) => sum + (parseFloat(String(r.CalculatedDays || (r as any).RequestedDays || 0)) || 0),
      0
    );
    const totalLeaveTaken = Math.max(Number(balance.UsedLeave) || 0, Math.round(recordedDays * 100) / 100);
    const regularAllTimeLeaves = activeRequests.filter(
      (r) => !(r.Remarks && r.Remarks.includes('(Exempt from Regular Balance)'))
    );
    const allTimeRecordedDays = regularAllTimeLeaves.reduce(
      (sum, r) => sum + (parseFloat(String(r.CalculatedDays || (r as any).RequestedDays || 0)) || 0),
      0
    );
    const leaveTakenAllTime = Math.max(totalLeaveTaken, Math.round(allTimeRecordedDays * 100) / 100);
    const effectiveCarried = Number(balance.effectiveCarriedForward ?? (balance.isCarryForwardExpired ? 0 : balance.CarriedForward));
    const accruedAllowance = Math.round((Number(balance.EarnedLeave) + effectiveCarried) * 100) / 100;
    const isExceeded = totalLeaveTaken > accruedAllowance;
    const excessDays = isExceeded ? Math.round((totalLeaveTaken - accruedAllowance) * 100) / 100 : 0;
    const remainingAllowance = Math.max(0, Math.round((accruedAllowance - totalLeaveTaken) * 100) / 100);

    return {
      user: {
        userId: user.UserID.trim(),
        fullName: user.FullName.trim(),
        email: user.Email.trim(),
        role: user.Role,
      },
      leaveSummary: {
        accruedAllowance,
        leaveTaken: totalLeaveTaken,
        leaveTakenAllTime,
        remainingAllowance,
        isExceeded,
        excessDays,
      },
      balance: {
        calendarYear: balance.CalendarYear,
        CalendarYear: balance.CalendarYear,
        earnedLeave: Number(balance.EarnedLeave),
        EarnedLeave: Number(balance.EarnedLeave),
        carriedForward: Number(balance.CarriedForward),
        CarriedForward: Number(balance.CarriedForward),
        usedLeave: totalLeaveTaken,
        UsedLeave: totalLeaveTaken,
        availableLeave: remainingAllowance,
        AvailableLeave: remainingAllowance,
        isCarryForwardExpired: Boolean(balance.isCarryForwardExpired),
        effectiveCarriedForward: Number(balance.effectiveCarriedForward ?? balance.CarriedForward),
        transitionPending: Boolean(balance.transitionPending),
      },
      monthlyAttendance: {
        year: currentYear,
        month: currentMonth,
        presentCount: monthlyAttendance.presentCount,
        absentCount: monthlyAttendance.absentCount,
        leaveCount,
        notMarkedCount: monthlyAttendance.notMarkedCount,
        totalWorkingDays: monthlyAttendance.totalWorkingDays,
        totalSundays: monthlyAttendance.totalSundays,
        totalHolidays: monthlyAttendance.totalHolidays,
        totalCalendarDays: monthlyAttendance.totalCalendarDays,
        specialLeaveCount: monthlyAttendance.specialLeaveCount,
        attendanceRate: monthlyAttendance.attendanceRate,
        records: monthlyAttendance.records,
      },
      recentRequests,
      recentAttendance,
      upcomingHolidays,
    };
  }

  /**
   * Aggregate Manager Dashboard Data.
   */
  public async getManagerDashboard(dateStr?: string) {
    const targetDate = dateStr || new Date().toISOString().slice(0, 10);

    const daily = await attendanceService.getDailyAttendance(targetDate);
    const allRequests = await leaveService.getAllEnrichedRequests();
    const recentRequests = allRequests.slice(0, 8);

    const currentYear = new Date(targetDate).getUTCFullYear();
    const allHolidays = await holidayService.getHolidaysByYear(currentYear);
    const upcomingHolidays = allHolidays
      .filter((h) => h.HolidayDate >= targetDate)
      .slice(0, 5);

    return {
      selectedDate: targetDate,
      attendanceSummary: {
        totalStaff: daily.totalStaff,
        presentCount: daily.presentCount,
        absentCount: daily.absentCount,
        notMarkedCount: daily.notMarkedCount,
        isSunday: daily.isSunday,
        isHoliday: daily.isHoliday,
        holidayName: daily.holidayName,
      },
      staffAttendance: daily.staffAttendance,
      recentRequests,
      upcomingHolidays,
    };
  }

  /**
   * Aggregate Admin Dashboard Data.
   */
  public async getAdminDashboard(dateStr?: string) {
    const targetDate = dateStr || new Date().toISOString().slice(0, 10);

    const managerData = await this.getManagerDashboard(targetDate);
    const allBalances = await leaveService.getAllBalances();
    const recentLogs = await activityLogService.getRecentLogs(10);
    const allUsers = await userService.getAllUsers();
    const activeStaff = allUsers.filter(
      (u) => userService.parseIsActive(u.IsActive) && u.Role === 'Staff'
    );
    const activeStaffCount = activeStaff.length;

    // Calculate annual leave summary across staff (excluding withdrawn/cancelled)
    const currentYear = new Date(targetDate).getUTCFullYear();
    const allRequests = await leaveService.getAllEnrichedRequests();
    const yearPrefix = `${currentYear}-`;
    const yearRequests = allRequests.filter(
      (r) =>
        r.Status !== 'Withdrawn' &&
        r.Status !== 'Cancelled' &&
        ((r.StartDate && r.StartDate.startsWith(yearPrefix)) || (r.EndDate && r.EndDate.startsWith(yearPrefix)))
    );
    const totalLeaveDaysTaken = yearRequests.reduce(
      (sum, r) => sum + (parseFloat(String(r.CalculatedDays || (r as any).RequestedDays || 0)) || 0),
      0
    );

    // Identify staff with leave exceeding accrued allowance (excluding exempt leaves)
    const userRequestsMap = new Map<string, number>();
    for (const r of yearRequests) {
      if (r.Remarks && r.Remarks.includes('(Exempt from Regular Balance)')) {
        continue;
      }
      const days = parseFloat(String(r.CalculatedDays || (r as any).RequestedDays || 0)) || 0;
      userRequestsMap.set(r.UserID, (userRequestsMap.get(r.UserID) || 0) + days);
    }

    const exceedingStaff: Array<{
      userId: string;
      fullName: string;
      email: string;
      accruedAllowance: number;
      leaveTaken: number;
      excessDays: number;
    }> = [];

    for (const user of activeStaff) {
      const balance = allBalances.find(
        (b) => b.UserID.trim().toLowerCase() === user.UserID.trim().toLowerCase() && Number(b.CalendarYear) === currentYear
      );

      let accrued = 0;
      if (balance) {
        const carried = Number(balance.effectiveCarriedForward ?? (balance.isCarryForwardExpired ? 0 : balance.CarriedForward ?? 0));
        accrued = Math.round((Number(balance.EarnedLeave || 0) + carried) * 100) / 100;
      } else if (user.JoiningDate) {
        const accrual = leavePolicyService.calculateCompletedMonthAccrual(
          user.JoiningDate,
          targetDate,
          currentYear
        );
        accrued = accrual.accruedDays;
      } else {
        continue;
      }

      const taken = userRequestsMap.get(user.UserID) || 0;
      if (taken > accrued) {
        exceedingStaff.push({
          userId: user.UserID,
          fullName: user.FullName,
          email: user.Email,
          accruedAllowance: accrued,
          leaveTaken: taken,
          excessDays: Math.round((taken - accrued) * 100) / 100,
        });
      }
    }

    // Staff currently on active/approved leave on targetDate
    const onLeaveToday = allRequests
      .filter((r) => {
        if (r.Status === 'Withdrawn' || r.Status === 'Cancelled') return false;
        return Boolean(r.StartDate && r.EndDate && r.StartDate <= targetDate && r.EndDate >= targetDate);
      })
      .map((r) => ({
        userId: r.UserID,
        fullName: r.FullName || r.UserID,
        email: r.Email || '',
        role: r.Role || 'Staff',
        leaveType: r.LeaveType,
        startDate: r.StartDate,
        endDate: r.EndDate,
        calculatedDays: parseFloat(String(r.CalculatedDays || 0)),
        reason: r.Reason || '',
      }));

    return {
      ...managerData,
      totalActiveStaff: activeStaffCount,
      totalBalancesRecorded: allBalances.length,
      recentActivityLogs: recentLogs,
      recentActivity: recentLogs,
      onLeaveToday,
      leaveSummary: {
        totalLeaveDaysTaken: Math.round(totalLeaveDaysTaken * 100) / 100,
        totalRequestsCount: yearRequests.length,
        exceedingStaffCount: exceedingStaff.length,
        exceedingStaff,
      },
    };
  }
}

export const dashboardService = new DashboardService();
