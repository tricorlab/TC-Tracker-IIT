import { googleSheetsService } from './googleSheets.service.js';
import { SHEET_NAMES } from '../config/sheets.config.js';
import { LeavePolicyRow } from '../types/database.types.js';
import { holidayService } from './holiday.service.js';
import { activityLogService } from './activityLog.service.js';

export interface LeaveCalculationResult {
  startDate: string;
  endDate: string;
  totalCalendarDays: number;
  calculatedDays: number;
  isContinuousSevenDaysOrMore: boolean;
  workingDaysCount: number;
  sundaysCount: number;
  holidaysCount: number;
  excludedDates: string[];
}

export function normalizeDateString(dateStr: string): string {
  if (!dateStr) return '';
  // Strip any time component (e.g. '2026-11-15T10:08:41.000Z' or '2026-11-15 10:08:41')
  const dateOnly = dateStr.trim().split(/[T ]/)[0];
  const parts = dateOnly.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      const year = Number(parts[2]);
      const month = Number(parts[1]).toString().padStart(2, '0');
      const day = Number(parts[0]).toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    if (parts[0].length === 4) {
      const year = Number(parts[0]);
      const month = Number(parts[1]).toString().padStart(2, '0');
      const day = Number(parts[2]).toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  return dateOnly.slice(0, 10);
}

export class LeavePolicyService {
  private defaultPolicy: LeavePolicyRow = {
    PolicyID: 'POL-DEFAULT',
    MonthlyAccrual: 2.5,
    CarryForwardPercentage: 50,
    CarryForwardDate: '12-31',
    CarryForwardExpiryDate: '03-31',
    MinimumContinuousCalendarDays: 7,
    WorkingDays: 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday',
    EffectiveFrom: '2026-01-01',
    UpdatedAt: new Date().toISOString(),
    UpdatedBy: 'SYSTEM',
  };

  private mockPolicy: LeavePolicyRow | null = null;

  public clearMockPolicy(): void {
    this.mockPolicy = null;
  }

  public setMockPolicy(policy: LeavePolicyRow): void {
    this.mockPolicy = { ...policy };
  }

  /**
   * Retrieve active LeavePolicy from Google Sheets or default fallback.
   */
  public async getPolicy(): Promise<LeavePolicyRow> {
    if (this.mockPolicy) {
      return { ...this.mockPolicy };
    }

    if (googleSheetsService.isLiveApiEnabled()) {
      try {
        const records = await googleSheetsService.getSheetRecords<LeavePolicyRow>(
          SHEET_NAMES.LEAVE_POLICY
        );
        if (records.length > 0) {
          return records[0];
        }
      } catch (err: any) {
        console.error('[LeavePolicyService Error] Failed to fetch policy:', err.message);
        throw new Error(`Database error: Failed to fetch leave policy: ${err.message}`);
      }
    }

    return { ...this.defaultPolicy };
  }

  /**
   * Update LeavePolicy configuration (Admin only).
   */
  public async updatePolicy(
    updates: Partial<LeavePolicyRow>,
    updatedBy: string
  ): Promise<LeavePolicyRow> {
    const current = await this.getPolicy();
    const prevSnapshot = JSON.stringify(current);

    const updated: LeavePolicyRow = {
      ...current,
      ...updates,
      UpdatedAt: new Date().toISOString(),
      UpdatedBy: updatedBy,
    };

    if (googleSheetsService.isLiveApiEnabled()) {
      await googleSheetsService.updateSheetRange(`${SHEET_NAMES.LEAVE_POLICY}!A2:J2`, [
        [
          updated.PolicyID,
          updated.MonthlyAccrual,
          updated.CarryForwardPercentage,
          updated.CarryForwardDate,
          updated.CarryForwardExpiryDate,
          updated.MinimumContinuousCalendarDays,
          updated.WorkingDays,
          updated.EffectiveFrom,
          updated.UpdatedAt,
          updated.UpdatedBy,
        ],
      ]);
    } else {
      this.mockPolicy = updated;
    }

    await activityLogService.logActivity({
      performedBy: updatedBy,
      action: 'LEAVE_POLICY_UPDATED',
      entityType: 'LeavePolicy',
      entityID: updated.PolicyID,
      previousValue: prevSnapshot,
      newValue: JSON.stringify(updated),
      reason: 'Admin updated leave policy parameters',
    });

    return updated;
  }

  /**
   * Calculate requested leave days according to the agreed policy:
   * - Inclusive start and end dates.
   * - If continuous leave is FEWER than 7 calendar days (< 7):
   *     Count WORKING DAYS ONLY. Exclude Sundays and Institute Holidays.
   * - If continuous leave is 7 OR MORE calendar days (>= 7):
   *     Count ALL CALENDAR DAYS, including Sundays and Institute Holidays.
   */
  public async calculateLeaveDays(
    startDate: string,
    endDate: string
  ): Promise<LeaveCalculationResult> {
    const cleanStart = normalizeDateString(startDate);
    const cleanEnd = normalizeDateString(endDate);
    const [startYear, startMonth, startDay] = cleanStart.split('-').map(Number);
    const [endYear, endMonth, endDay] = cleanEnd.split('-').map(Number);

    const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
    const endUtc = Date.UTC(endYear, endMonth - 1, endDay);

    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const totalCalendarDays = Math.round((endUtc - startUtc) / MS_PER_DAY) + 1;

    if (totalCalendarDays <= 0) {
      throw new Error(`StartDate '${startDate}' cannot be after EndDate '${endDate}'.`);
    }

    const policy = await this.getPolicy();
    const minThreshold = Number(policy.MinimumContinuousCalendarDays) || 7;
    const isContinuousSevenDaysOrMore = totalCalendarDays >= minThreshold;

    const holidays = await holidayService.getAllHolidays();
    const holidayMap = new Map(holidays.map((h) => [h.HolidayDate.trim(), h.HolidayName.trim()]));

    let sundaysCount = 0;
    let holidaysCount = 0;
    let workingDaysCount = 0;
    const excludedDates: string[] = [];

    let currentUtc = startUtc;
    while (currentUtc <= endUtc) {
      const curDate = new Date(currentUtc);
      const dateStr = curDate.toISOString().slice(0, 10);
      const isSun = curDate.getUTCDay() === 0;
      const holidayName = holidayMap.get(dateStr);

      if (isSun) {
        sundaysCount++;
        excludedDates.push(`${dateStr} (Sunday)`);
      } else if (holidayName) {
        holidaysCount++;
        excludedDates.push(`${dateStr} (Holiday: ${holidayName})`);
      } else {
        workingDaysCount++;
      }

      currentUtc += MS_PER_DAY;
    }

    let calculatedDays: number;
    if (isContinuousSevenDaysOrMore) {
      // Rule: >= 7 calendar days counts all calendar days
      calculatedDays = totalCalendarDays;
    } else {
      // Rule: < 7 calendar days counts working days only
      calculatedDays = workingDaysCount;
    }

    return {
      startDate,
      endDate,
      totalCalendarDays,
      calculatedDays,
      isContinuousSevenDaysOrMore,
      workingDaysCount,
      sundaysCount,
      holidaysCount,
      excludedDates: isContinuousSevenDaysOrMore ? [] : excludedDates,
    };
  }

  /**
   * Calculate leave accrual based on employee's JoiningDate:
   * - Rule: Leave is calculated from January to December (full year = 12 months = 30.0 days)
   *   for employees who joined prior to the calendar year.
   * - Completed Month Rule: Leave is credited strictly AFTER completing a calendar month.
   *   An ongoing or partial month awards 0 days until fully elapsed (i.e. asOfDay >= daysInCurrentMonth).
   *   Credited on the 1st of the following month (or upon reaching month-end).
   * - For employees who joined during the calendar year, leave is calculated from
   *   the joining month to December: (12 - joinMonth + 1) * 2.5 days as each month completes.
   *   Example: For an employee joining on 7-9-2026 (September 7, 2026):
   *   - In September before Sept 30: 0 completed months (0.0 days).
   *   - In November on Nov 3: September & October completed, November ongoing -> 2 months * 2.5 = 5.0 days.
   *   - In December at year-end: September, October, November, December completed -> 4 months * 2.5 = 10.0 days.
   * - If an employee joins in a future year, 0 days are credited.
   * - If evaluating a point-in-time strictly before the employee's joining date, 0 days are credited.
   * - Remaining unused leave at year-end (December 31) carries forward and can be taken up to March 31 of next year.
   * - Preserves 2-decimal precision.
   * - Uses timezone-safe YYYY-MM-DD parsing.
   *
   * @param joiningDateStr YYYY-MM-DD
   * @param asOfDateStr YYYY-MM-DD (defaults to current date)
   * @param calendarYear Optional specific calendar year (e.g. 2026)
   */
  public calculateCompletedMonthAccrual(
    joiningDateStr: string,
    asOfDateStr?: string,
    calendarYear?: number
  ): { completedMonths: number; accruedDays: number } {
    const cleanJoin = normalizeDateString(joiningDateStr);
    const [joinYear, joinMonth, joinDay] = cleanJoin.split('-').map(Number);

    const cleanAsOf = normalizeDateString(
      asOfDateStr ? asOfDateStr : new Date().toISOString().slice(0, 10)
    );
    const [asOfYear, asOfMonth, asOfDay] = cleanAsOf.split('-').map(Number);

    const targetYear = calendarYear !== undefined ? calendarYear : asOfYear;

    // If joining date is in a future year compared to targetYear, no leave has accrued
    if (joinYear > targetYear) {
      return { completedMonths: 0, accruedDays: 0 };
    }

    // If querying a point-in-time strictly before employee joined
    if (
      asOfYear < joinYear ||
      (asOfYear === joinYear && asOfMonth < joinMonth) ||
      (asOfYear === joinYear && asOfMonth === joinMonth && asOfDay < joinDay)
    ) {
      if (calendarYear === undefined || calendarYear <= joinYear) {
        return { completedMonths: 0, accruedDays: 0 };
      }
    }

    let creditedMonths = 0;

    if (targetYear < asOfYear) {
      // Historical past year evaluated in hindsight: full year or remaining part after joinMonth
      const startM = joinYear === targetYear ? joinMonth : 1;
      creditedMonths = Math.min(12, Math.max(0, 12 - startM + 1));
    } else if (targetYear > asOfYear) {
      // Future year
      creditedMonths = 0;
    } else {
      // Current active year: leave is credited ONLY after completing a calendar month.
      // An ongoing month awards 0 days until it has completed in full (asOfDay >= daysInCurrentMonth).
      const daysInCurrentMonth = new Date(Date.UTC(asOfYear, asOfMonth, 0)).getUTCDate();
      const isCurrentMonthCompleted = asOfDay >= daysInCurrentMonth;
      const lastCompletedMonth = isCurrentMonthCompleted ? asOfMonth : asOfMonth - 1;
      const startM = joinYear === targetYear ? joinMonth : 1;

      if (lastCompletedMonth < startM) {
        creditedMonths = 0;
      } else {
        const elapsed = lastCompletedMonth - startM + 1;
        creditedMonths = Math.min(12, Math.max(0, elapsed));
      }
    }

    const accruedDays = Math.round(creditedMonths * 2.5 * 100) / 100;
    return { completedMonths: creditedMonths, accruedDays };
  }

  /**
   * Determine whether carried-forward leave has expired:
   * - Confirmed rule: Carried-forward leave expires after March 31 and must be dynamically excluded starting April 1.
   * - Active from January 1 through March 31.
   * - Expired starting April 1.
   */
  public isCarryForwardExpired(asOfDateStr?: string, calendarYear?: number): boolean {
    const cleanAsOf = asOfDateStr
      ? asOfDateStr.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const [asOfYear, asOfMonth, asOfDay] = cleanAsOf.split('-').map(Number);

    const queryYear = calendarYear ?? asOfYear;

    if (queryYear < asOfYear) {
      // Historical year carry-forward is expired
      return true;
    }
    if (queryYear > asOfYear) {
      // Future year
      return false;
    }

    // Current query year: valid Jan 1 to March 31 (months 1, 2, 3).
    // Starting April 1 (month 4), it is expired.
    return asOfMonth > 3 || (asOfMonth === 3 && asOfDay > 31);
  }

  /**
   * Calculate carry-forward leave rules:
   * - On Dec 31, exactly 50% of eligible unused balance carries forward into next year.
   * - The other 50% permanently lapses on Dec 31.
   * - Carried-forward leave expires after March 31 of next year.
   */
  public calculateCarryForwardAmount(
    balanceAtYearEnd: number,
    asOfDateStr?: string,
    calendarYear?: number
  ): { carriedForward: number; lapsedAmount: number; isExpired: boolean; rawCarry: number } {
    const rawBalance = Math.max(0, balanceAtYearEnd);
    const rawCarry = Math.round(rawBalance * 0.5 * 100) / 100; // Exactly 50%
    const lapsedAmount = Math.round((rawBalance - rawCarry) * 100) / 100; // Remaining 50% permanently lapses

    const isExpired = this.isCarryForwardExpired(asOfDateStr, calendarYear);
    const carriedForward = isExpired ? 0 : rawCarry;

    return {
      carriedForward,
      lapsedAmount,
      isExpired,
      rawCarry,
    };
  }
}

export const leavePolicyService = new LeavePolicyService();
