import { Request, Response } from 'express';
import { attendanceService } from '../services/attendance.service.js';
import { leaveService } from '../services/leave.service.js';
import { userService } from '../services/userService.js';
import { leavePolicyService } from '../services/leavePolicy.service.js';

/**
 * Sanitizes and formats CSV fields, neutralizing spreadsheet formula injection (CWE-1236).
 * Prepends a single quote if string begins with =, +, -, @, \t, or \r (while preserving standalone '-').
 */
function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str) && str !== '-') {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Calculates how many leave days of a request fall strictly within a target calendar year.
 * Prevents double-counting cross-year leave spans in annual reports.
 */
function calculateLeaveDaysInYear(
  request: { StartDate?: string; EndDate?: string; CalculatedDays?: number | string; RequestedDays?: number | string },
  targetYear: number
): number {
  if (!request.StartDate || !request.EndDate) return 0;
  const start = String(request.StartDate).trim().slice(0, 10);
  const end = String(request.EndDate).trim().slice(0, 10);

  const yearStart = `${targetYear}-01-01`;
  const yearEnd = `${targetYear}-12-31`;

  // No overlap with target year
  if (start > yearEnd || end < yearStart) {
    return 0;
  }

  const calcDays = parseFloat(String(request.CalculatedDays || request.RequestedDays || 0)) || 0;
  // Entirely within target year
  if (start >= yearStart && end <= yearEnd) {
    return calcDays;
  }

  // Cross-year span: calculate proportional calendar days in target year
  const overlapStart = start < yearStart ? yearStart : start;
  const overlapEnd = end > yearEnd ? yearEnd : end;

  const [sY, sM, sD] = start.split('-').map(Number);
  const [eY, eM, eD] = end.split('-').map(Number);
  const totalCalDays = Math.max(1, Math.round((Date.UTC(eY, eM - 1, eD) - Date.UTC(sY, sM - 1, sD)) / 86400000) + 1);

  const [osY, osM, osD] = overlapStart.split('-').map(Number);
  const [oeY, oeM, oeD] = overlapEnd.split('-').map(Number);
  const overlapCalDays = Math.max(0, Math.round((Date.UTC(oeY, oeM - 1, oeD) - Date.UTC(osY, osM - 1, osD)) / 86400000) + 1);

  if (totalCalDays === 0) return 0;
  return Math.round(((calcDays * overlapCalDays) / totalCalDays) * 100) / 100;
}

export class ReportController {
  /**
   * Parse period parameters supporting:
   * - Monthly: ?type=monthly&year=YYYY&month=M (or default ?year=YYYY&month=M)
   * - Annual: ?type=annual&year=YYYY
   * - Multi-month: ?type=multi&year=YYYY&startMonth=M1&endMonth=M2
   * - Custom range: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   */
  private parseAttendanceReportParams(query: any): {
    startDate: string;
    endDate: string;
    periodTitle: string;
    filename: string;
    reportType: 'monthly' | 'multi' | 'annual' | 'custom';
  } {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;

    const year = query.year ? parseInt(String(query.year), 10) : currentYear;
    const type = (query.type || (query.month ? 'monthly' : (query.startMonth && query.endMonth ? 'multi' : 'monthly'))).toLowerCase();

    if (type === 'annual') {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      return {
        startDate,
        endDate,
        periodTitle: `Full Year ${year}`,
        filename: `attendance-report-${year}-annual.csv`,
        reportType: 'annual',
      };
    }

    if (type === 'multi' || (query.startMonth && query.endMonth)) {
      const startMonth = Math.max(1, Math.min(12, parseInt(String(query.startMonth || 1), 10)));
      const endMonth = Math.max(startMonth, Math.min(12, parseInt(String(query.endMonth || 12), 10)));
      const daysInEndMonth = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
      const startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(endMonth).padStart(2, '0')}-${String(daysInEndMonth).padStart(2, '0')}`;
      const periodTitle = startMonth === endMonth
        ? `${monthNames[startMonth - 1]} ${year}`
        : `${monthNames[startMonth - 1]} – ${monthNames[endMonth - 1]} ${year}`;
      return {
        startDate,
        endDate,
        periodTitle,
        filename: `attendance-report-${year}-M${String(startMonth).padStart(2, '0')}-to-M${String(endMonth).padStart(2, '0')}.csv`,
        reportType: 'multi',
      };
    }

    if (query.startDate && query.endDate) {
      const startDate = String(query.startDate).trim().slice(0, 10);
      const endDate = String(query.endDate).trim().slice(0, 10);
      return {
        startDate,
        endDate,
        periodTitle: `${startDate} to ${endDate}`,
        filename: `attendance-report-${startDate}-to-${endDate}.csv`,
        reportType: 'custom',
      };
    }

    // Default: Single month (clamped between 1 and 12 with NaN fallback)
    const rawMonth = query.month ? parseInt(String(query.month), 10) : currentMonth;
    const month = !isNaN(rawMonth) ? Math.max(1, Math.min(12, rawMonth)) : currentMonth;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const monthName = monthNames[month - 1] || `Month ${month}`;
    return {
      startDate,
      endDate,
      periodTitle: `${monthName} ${year}`,
      filename: `attendance-report-${year}-${String(month).padStart(2, '0')}.csv`,
      reportType: 'monthly',
    };
  }

  /**
   * Get institute attendance report (JSON), supporting Monthly, Multi-Month, and Annual periods.
   */
  public async getMonthlyAttendanceReport(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, periodTitle, reportType } = this.parseAttendanceReportParams(req.query);
      const report = await attendanceService.getInstituteAttendanceRangeReport(
        startDate,
        endDate,
        periodTitle,
        reportType
      );
      res.json({ success: true, data: report });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  /**
   * Export institute attendance report as downloadable CSV, supporting Monthly, Multi-Month, and Annual periods.
   */
  public async exportAttendanceCsv(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, periodTitle, filename, reportType } = this.parseAttendanceReportParams(req.query);
      const report = await attendanceService.getInstituteAttendanceRangeReport(
        startDate,
        endDate,
        periodTitle,
        reportType
      );

      const headers = [
        'Employee ID',
        'Employee Name',
        'Email',
        'Role',
        'Working Days',
        'Present',
        'Absent',
        'Not Marked',
        'Sundays',
        'Holidays',
        'Attendance Rate (%)',
      ];

      const rows: string[] = [headers.map(escapeCsvField).join(',')];

      for (const e of report.employeeSummaries) {
        rows.push(
          [
            escapeCsvField(e.userId),
            escapeCsvField(e.fullName),
            escapeCsvField(e.email),
            escapeCsvField(e.role),
            e.workingDays,
            e.presentCount,
            e.absentCount,
            e.notMarkedCount,
            e.sundaysCount,
            e.holidaysCount,
            `${e.attendanceRate}%`,
          ].join(',')
        );
      }

      // Summary row
      rows.push(
        [
          escapeCsvField('TOTAL / INSTITUTE'),
          escapeCsvField(`${report.totalEmployees} Employees`),
          escapeCsvField('-'),
          escapeCsvField('-'),
          report.overallTotals.totalWorkingDays,
          report.overallTotals.totalPresent,
          report.overallTotals.totalAbsent,
          report.overallTotals.totalNotMarked,
          report.overallTotals.totalSundays,
          report.overallTotals.totalHolidays,
          escapeCsvField('-'),
        ].join(',')
      );

      const csvContent = rows.join('\r\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  /**
   * Get annual leave balance report for all active employees (JSON).
   */
  public async getLeaveBalanceReport(req: Request, res: Response): Promise<void> {
    try {
      const year = req.query.year
        ? parseInt(req.query.year as string, 10)
        : new Date().getUTCFullYear();

      // 1. Batch fetch all necessary data in parallel (3 efficient reads)
      const [allUsers, allBalances, allRequests] = await Promise.all([
        userService.getAllUsers(),
        leaveService.getAllBalances(year),
        leaveService.getAllEnrichedRequests(),
      ]);

      const activeUsers = allUsers
        .filter((u) => userService.parseIsActive(u.IsActive))
        .sort((a, b) => a.FullName.localeCompare(b.FullName));

      // Build in-memory map of recorded leave taken per user for the calendar year
      // (strictly excluding withdrawn, cancelled, and exempt requests, and properly apportioning cross-year requests)
      const userTakenMap = new Map<string, number>();
      for (const r of allRequests) {
        if (r.Status === 'Withdrawn' || r.Status === 'Cancelled') continue;
        if (r.Remarks && r.Remarks.includes('(Exempt from Regular Balance)')) continue;
        const daysInYear = calculateLeaveDaysInYear(r, year);
        if (daysInYear > 0) {
          const uId = r.UserID.trim().toLowerCase();
          userTakenMap.set(uId, (userTakenMap.get(uId) || 0) + daysInYear);
        }
      }

      let totalEarned = 0;
      let totalCarried = 0;
      let totalUsed = 0;
      let totalAvailable = 0;
      let totalExceedingEmployees = 0;

      const balances = [];

      for (const user of activeUsers) {
        const uId = user.UserID.trim().toLowerCase();
        const bal = allBalances.find(
          (b) => b.UserID.trim().toLowerCase() === uId && Number(b.CalendarYear) === year
        );

        let earned = 0;
        let carried = 0;
        let used = 0;
        let isCarryForwardExpired = false;
        let effectiveCarried = 0;
        let transitionPending = false;

        if (bal) {
          earned = typeof bal.EarnedLeave === 'number' ? bal.EarnedLeave : parseFloat(String(bal.EarnedLeave || 0)) || 0;
          carried = typeof bal.CarriedForward === 'number' ? bal.CarriedForward : parseFloat(String(bal.CarriedForward || 0)) || 0;
          used = typeof bal.UsedLeave === 'number' ? bal.UsedLeave : parseFloat(String(bal.UsedLeave || 0)) || 0;
          isCarryForwardExpired = Boolean(bal.isCarryForwardExpired);
          effectiveCarried = Number(bal.effectiveCarriedForward ?? (isCarryForwardExpired ? 0 : carried)) || 0;
          transitionPending = Boolean(bal.transitionPending);
        } else {
          // Dynamic calculation based on user JoiningDate without requiring database write
          if (user.JoiningDate) {
            const accrual = leavePolicyService.calculateCompletedMonthAccrual(
              user.JoiningDate,
              undefined,
              year
            );
            earned = accrual.accruedDays;
          }
          isCarryForwardExpired = leavePolicyService.isCarryForwardExpired(undefined, year);
          effectiveCarried = isCarryForwardExpired ? 0 : carried;
        }

        const yearTaken = userTakenMap.get(uId) || 0;
        const totalLeaveTaken = Math.max(used, Math.round(yearTaken * 100) / 100);

        const totalAllowance = Math.round((earned + effectiveCarried) * 100) / 100;
        const isExceeded = totalLeaveTaken > totalAllowance;
        const exceededBy = isExceeded ? Math.round((totalLeaveTaken - totalAllowance) * 100) / 100 : 0;
        const dynamicAvailable = Math.max(0, Math.round((totalAllowance - totalLeaveTaken) * 100) / 100);

        if (isExceeded) {
          totalExceedingEmployees++;
        }

        totalEarned += earned;
        totalCarried += carried;
        totalUsed += totalLeaveTaken;
        totalAvailable += dynamicAvailable;

        balances.push({
          userId: user.UserID,
          fullName: user.FullName,
          email: user.Email,
          role: user.Role,
          joiningDate: user.JoiningDate || '',
          earnedLeave: Math.round(earned * 100) / 100,
          carriedForward: Math.round(carried * 100) / 100,
          isCarryForwardExpired,
          effectiveCarriedForward: Math.round(effectiveCarried * 100) / 100,
          usedLeave: totalLeaveTaken,
          availableLeave: dynamicAvailable,
          totalAllowance,
          isExceeded,
          exceededBy,
          transitionPending,
        });
      }

      res.json({
        success: true,
        data: {
          year,
          totalEmployees: activeUsers.length,
          totalExceedingEmployees,
          overallTotals: {
            totalEarned: Math.round(totalEarned * 100) / 100,
            totalCarried: Math.round(totalCarried * 100) / 100,
            totalUsed: Math.round(totalUsed * 100) / 100,
            totalAvailable: Math.round(totalAvailable * 100) / 100,
          },
          balances,
        },
      });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  /**
   * Export annual leave balance report as downloadable CSV.
   */
  public async exportLeaveBalanceCsv(req: Request, res: Response): Promise<void> {
    try {
      const year = req.query.year
        ? parseInt(req.query.year as string, 10)
        : new Date().getUTCFullYear();

      // 1. Batch fetch all necessary data in parallel
      const [allUsers, allBalances, allRequests] = await Promise.all([
        userService.getAllUsers(),
        leaveService.getAllBalances(year),
        leaveService.getAllEnrichedRequests(),
      ]);

      const activeUsers = allUsers
        .filter((u) => userService.parseIsActive(u.IsActive))
        .sort((a, b) => a.FullName.localeCompare(b.FullName));

      const userTakenMap = new Map<string, number>();
      for (const r of allRequests) {
        if (r.Status === 'Withdrawn' || r.Status === 'Cancelled') continue;
        if (r.Remarks && r.Remarks.includes('(Exempt from Regular Balance)')) continue;
        const daysInYear = calculateLeaveDaysInYear(r, year);
        if (daysInYear > 0) {
          const uId = r.UserID.trim().toLowerCase();
          userTakenMap.set(uId, (userTakenMap.get(uId) || 0) + daysInYear);
        }
      }

      let totalEarned = 0;
      let totalCarried = 0;
      let totalUsed = 0;
      let totalAvailable = 0;

      const headers = [
        'Employee ID',
        'Employee Name',
        'Email',
        'Role',
        'Joining Date',
        'Earned Leave',
        'Carried Forward',
        'Carried Forward Status',
        'Used Leave',
        'Available Leave',
        'Allowance Status',
      ];

      const rows: string[] = [headers.map(escapeCsvField).join(',')];

      for (const user of activeUsers) {
        const uId = user.UserID.trim().toLowerCase();
        const bal = allBalances.find(
          (b) => b.UserID.trim().toLowerCase() === uId && Number(b.CalendarYear) === year
        );

        let earned = 0;
        let carried = 0;
        let used = 0;
        let isCarryForwardExpired = false;
        let effectiveCarried = 0;

        if (bal) {
          earned = typeof bal.EarnedLeave === 'number' ? bal.EarnedLeave : parseFloat(String(bal.EarnedLeave || 0)) || 0;
          carried = typeof bal.CarriedForward === 'number' ? bal.CarriedForward : parseFloat(String(bal.CarriedForward || 0)) || 0;
          used = typeof bal.UsedLeave === 'number' ? bal.UsedLeave : parseFloat(String(bal.UsedLeave || 0)) || 0;
          isCarryForwardExpired = Boolean(bal.isCarryForwardExpired);
          effectiveCarried = Number(bal.effectiveCarriedForward ?? (isCarryForwardExpired ? 0 : carried)) || 0;
        } else {
          if (user.JoiningDate) {
            const accrual = leavePolicyService.calculateCompletedMonthAccrual(
              user.JoiningDate,
              undefined,
              year
            );
            earned = accrual.accruedDays;
          }
          isCarryForwardExpired = leavePolicyService.isCarryForwardExpired(undefined, year);
          effectiveCarried = isCarryForwardExpired ? 0 : carried;
        }

        const yearTaken = userTakenMap.get(uId) || 0;
        const totalLeaveTaken = Math.max(used, Math.round(yearTaken * 100) / 100);

        const totalAllowance = Math.round((earned + effectiveCarried) * 100) / 100;
        const isExceeded = totalLeaveTaken > totalAllowance;
        const exceededBy = isExceeded ? Math.round((totalLeaveTaken - totalAllowance) * 100) / 100 : 0;
        const dynamicAvailable = Math.max(0, Math.round((totalAllowance - totalLeaveTaken) * 100) / 100);
        const allowanceStatus = isExceeded ? `Exceeds Allowance by ${exceededBy}d` : 'Within Allowance';

        totalEarned += earned;
        totalCarried += carried;
        totalUsed += totalLeaveTaken;
        totalAvailable += dynamicAvailable;

        rows.push(
          [
            escapeCsvField(user.UserID),
            escapeCsvField(user.FullName),
            escapeCsvField(user.Email),
            escapeCsvField(user.Role),
            escapeCsvField(user.JoiningDate),
            earned,
            carried,
            escapeCsvField(isCarryForwardExpired ? 'Expired' : 'Active'),
            totalLeaveTaken,
            dynamicAvailable,
            escapeCsvField(allowanceStatus),
          ].join(',')
        );
      }

      // Summary row
      rows.push(
        [
          escapeCsvField('TOTAL / INSTITUTE'),
          escapeCsvField(`${activeUsers.length} Employees`),
          escapeCsvField('-'),
          escapeCsvField('-'),
          escapeCsvField('-'),
          Math.round(totalEarned * 100) / 100,
          Math.round(totalCarried * 100) / 100,
          escapeCsvField('-'),
          Math.round(totalUsed * 100) / 100,
          Math.round(totalAvailable * 100) / 100,
          escapeCsvField('-'),
        ].join(',')
      );

      const csvContent = rows.join('\r\n');
      const filename = `leave-balances-${year}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
}

export const reportController = new ReportController();
