import { googleSheetsService } from './googleSheets.service.js';
import { SHEET_NAMES, ValidAttendanceStatus } from '../config/sheets.config.js';
import { LeaveRequestRow, LeaveBalanceRow, EnrichedLeaveRequestRow } from '../types/database.types.js';
import { userService } from './userService.js';
import { leavePolicyService } from './leavePolicy.service.js';
import { emailService } from './email.service.js';
import { activityLogService } from './activityLog.service.js';
import { attendanceService } from './attendance.service.js';
import { holidayService } from './holiday.service.js';
import { validateDate, validateLeaveDateRange } from '../validation/sheetValidators.js';

export interface LeaveSubmissionResult {
  request: LeaveRequestRow;
  warning?: string;
  calculatedDays: number;
  availableBalance: number;
  emailNotification?: {
    attempted: boolean;
    sent: boolean;
    recipientsCount: number;
    message: string;
  };
}

export interface YearTransitionPreviewItem {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  sourceEarned: number;
  sourceUsed: number;
  eligibleUnused: number;
  carryForwardAmount: number;
  lapsedAmount: number;
  status: 'Eligible' | 'Excluded';
  remarks?: string;
}

export interface YearTransitionPreviewResult {
  sourceYear: number;
  destinationYear: number;
  isAlreadyExecuted: boolean;
  alreadyExecutedDetails?: {
    executedAt: string;
    executedBy: string;
    reason?: string;
  };
  eligibleCount: number;
  totalCarried: number;
  totalLapsed: number;
  records: YearTransitionPreviewItem[];
  excludedRecords: YearTransitionPreviewItem[];
}

export interface YearTransitionExecutionResult {
  success: boolean;
  sourceYear: number;
  destinationYear: number;
  executedAt: string;
  executedBy: string;
  processedCount: number;
  totalCarried: number;
  totalLapsed: number;
  summary: YearTransitionPreviewItem[];
}

export class LeaveService {
  private mockRequests: LeaveRequestRow[] = [];
  private mockBalances: LeaveBalanceRow[] = [];
  private simulatedFailureUserId: string | null = null;

  public clearMockData(): void {
    this.mockRequests = [];
    this.mockBalances = [];
    this.simulatedFailureUserId = null;
  }

  public setMockRequests(requests: LeaveRequestRow[]): void {
    this.mockRequests = [...requests];
  }

  public setMockBalances(balances: LeaveBalanceRow[]): void {
    this.mockBalances = [...balances];
  }

  public setSimulatedFailureUserId(userId: string | null): void {
    this.simulatedFailureUserId = userId;
  }

  /**
   * Fetch all leave requests.
   */
  public async getAllRequests(): Promise<LeaveRequestRow[]> {
    const sanitize = (r: LeaveRequestRow): LeaveRequestRow => ({
      ...r,
      Status: (r.Status && String(r.Status).trim() ? String(r.Status).trim() : 'Recorded') as any,
    });
    if (googleSheetsService.isLiveApiEnabled()) {
      try {
        const records = await googleSheetsService.getSheetRecords<LeaveRequestRow>(
          SHEET_NAMES.LEAVE_REQUESTS
        );
        return records.map(sanitize).sort((a, b) => b.SubmittedAt.localeCompare(a.SubmittedAt));
      } catch (err: any) {
        console.error('[LeaveService Error] Failed to fetch requests:', err.message);
        throw new Error(`Database error: Failed to fetch leave requests: ${err.message}`);
      }
    }
    return [...this.mockRequests].map(sanitize).sort((a, b) => b.SubmittedAt.localeCompare(a.SubmittedAt));
  }

  /**
   * Fetch all leave requests enriched with employee FullName, Email, and Role.
   */
  public async getAllEnrichedRequests(): Promise<EnrichedLeaveRequestRow[]> {
    const rawRequests = await this.getAllRequests();
    const allUsers = await userService.getAllUsers();
    const userMap = new Map<string, { fullName: string; email: string; role: string }>();

    for (const u of allUsers) {
      if (u.UserID) {
        userMap.set(u.UserID.trim(), {
          fullName: u.FullName || 'Unknown Employee',
          email: u.Email || '',
          role: u.Role || 'Staff',
        });
      }
    }

    return rawRequests.map((req) => {
      const user = userMap.get((req.UserID || '').trim());
      return {
        ...req,
        FullName: user?.fullName || 'Unknown Employee',
        Email: user?.email || '',
        Role: user?.role || 'Staff',
      };
    });
  }

  /**
   * Fetch leave requests submitted by a specific user.
   */
  public async getUserRequests(userId: string): Promise<LeaveRequestRow[]> {
    const all = await this.getAllRequests();
    return all.filter((r) => r.UserID.trim() === userId.trim());
  }

  /**
   * Fetch all leave balances, optionally filtered by calendar year and evaluated as of a specific date.
   * Dynamically excludes carried-forward leave from AvailableLeave starting April 1.
   */
  public async getAllBalances(calendarYear?: number, asOfDateStr?: string): Promise<LeaveBalanceRow[]> {
    let records: LeaveBalanceRow[] = [];
    if (googleSheetsService.isLiveApiEnabled()) {
      try {
        records = await googleSheetsService.getSheetRecords<LeaveBalanceRow>(
          SHEET_NAMES.LEAVE_BALANCES
        );
      } catch (err: any) {
        console.error('[LeaveService Error] Failed to fetch balances:', err.message);
        throw new Error(`Database error: Failed to fetch leave balances: ${err.message}`);
      }
    } else {
      records = [...this.mockBalances];
    }

    if (calendarYear !== undefined) {
      records = records.filter((b) => Number(b.CalendarYear) === calendarYear);
    }

    let isPriorTransitionExecuted = true;
    if (calendarYear !== undefined) {
      const priorTransition = await this.isTransitionExecuted(calendarYear - 1, calendarYear);
      isPriorTransitionExecuted = priorTransition.executed;
    }

    return records.map((b) => {
      const earned = parseFloat(String(b.EarnedLeave || 0));
      const carried = parseFloat(String(b.CarriedForward || 0));
      const used = parseFloat(String(b.UsedLeave || 0));
      const bYear = Number(b.CalendarYear);
      const isExpired = leavePolicyService.isCarryForwardExpired(asOfDateStr, bYear);
      const effectiveCarried = isExpired ? 0 : carried;
      const available = Math.round((earned + effectiveCarried - used) * 100) / 100;
      const transitionPending = !isPriorTransitionExecuted && carried === 0;

      return {
        ...b,
        EarnedLeave: earned,
        CarriedForward: carried,
        UsedLeave: used,
        AvailableLeave: available,
        isCarryForwardExpired: isExpired,
        effectiveCarriedForward: effectiveCarried,
        transitionPending,
      } as LeaveBalanceRow & {
        isCarryForwardExpired: boolean;
        effectiveCarriedForward: number;
        transitionPending: boolean;
      };
    });
  }

  /**
   * Retrieve or compute leave balance for a user in a specific calendar year.
   * AvailableLeave = EarnedLeave + (isExpired ? 0 : CarriedForward) - UsedLeave
   */
  public async getUserBalance(
    userId: string,
    calendarYear = new Date().getUTCFullYear(),
    asOfDateStr?: string
  ): Promise<LeaveBalanceRow & { isCarryForwardExpired?: boolean; effectiveCarriedForward?: number; transitionPending?: boolean }> {
    const all = await this.getAllBalances(calendarYear, asOfDateStr);
    const existing = all.find(
      (b) => b.UserID.trim() === userId.trim() && Number(b.CalendarYear) === calendarYear
    );

    if (existing) {
      if (googleSheetsService.isLiveApiEnabled()) {
        const user = await userService.getUserById(userId);
        if (user && user.JoiningDate) {
          const accrual = leavePolicyService.calculateCompletedMonthAccrual(
            user.JoiningDate,
            asOfDateStr,
            calendarYear
          );
          const recentLogs = await activityLogService.getRecentLogs(100);
          const hasManualAdjustment = recentLogs.some(
            (l) => l.Action === 'BALANCE_ADJUSTED' && l.EntityID === existing.LeaveBalanceID
          );
          if (!hasManualAdjustment && Number(existing.EarnedLeave) !== accrual.accruedDays) {
            existing.EarnedLeave = accrual.accruedDays;
            const effectiveCarried = existing.effectiveCarriedForward ?? 0;
            const used = Number(existing.UsedLeave) || 0;
            existing.AvailableLeave = Math.max(0, Math.round((existing.EarnedLeave + effectiveCarried - used) * 100) / 100);
            existing.UpdatedAt = new Date().toISOString();
            try {
              const actualRow = await googleSheetsService.findRowIndexByColumnValue(
                SHEET_NAMES.LEAVE_BALANCES,
                'A',
                existing.LeaveBalanceID
              );
              const allBals = await googleSheetsService.getSheetRecords<LeaveBalanceRow>(SHEET_NAMES.LEAVE_BALANCES);
              const rowIdx = allBals.findIndex((b) => b.LeaveBalanceID === existing.LeaveBalanceID);
              const sheetRow = actualRow !== -1 ? actualRow : (rowIdx !== -1 ? rowIdx + 2 : -1);

              if (sheetRow !== -1) {
                await googleSheetsService.updateSheetRange(
                  `${SHEET_NAMES.LEAVE_BALANCES}!A${sheetRow}:H${sheetRow}`,
                  [[
                    existing.LeaveBalanceID,
                    existing.UserID,
                    existing.CalendarYear,
                    existing.EarnedLeave,
                    existing.CarriedForward,
                    existing.UsedLeave,
                    existing.AvailableLeave,
                    existing.UpdatedAt,
                  ]]
                );
              }
            } catch (err: any) {
              console.warn('[LeaveService] Failed auto-syncing dynamic accrual to sheet:', err.message);
            }
          }
        }
      }
      return existing;
    }

    // Initialize initial balance record based on user's JoiningDate and policy
    const user = await userService.getUserById(userId);
    let earnedLeave = 0;
    if (user && user.JoiningDate) {
      const accrual = leavePolicyService.calculateCompletedMonthAccrual(
        user.JoiningDate,
        asOfDateStr,
        calendarYear
      );
      earnedLeave = accrual.accruedDays;
    }

    // Check if prior-year transition has been executed
    let transitionPending = false;
    const priorYear = calendarYear - 1;
    const transitionCheck = await this.isTransitionExecuted(priorYear, calendarYear);
    if (!transitionCheck.executed) {
      // Check if employee had unused balance in prior year
      const priorYearBalance = (await this.getAllBalances(priorYear)).find(
        (b) => b.UserID.trim() === userId.trim()
      );
      if (priorYearBalance && Number(priorYearBalance.AvailableLeave) > 0) {
        transitionPending = true;
      }
    }

    const isExpired = leavePolicyService.isCarryForwardExpired(asOfDateStr, calendarYear);
    const initialCarried = 0;
    const effectiveCarried = isExpired ? 0 : initialCarried;

    const newBalance: LeaveBalanceRow & {
      isCarryForwardExpired?: boolean;
      effectiveCarriedForward?: number;
      transitionPending?: boolean;
    } = {
      LeaveBalanceID: `BAL-${calendarYear}-${userId}`,
      UserID: userId.trim(),
      CalendarYear: calendarYear,
      EarnedLeave: earnedLeave,
      CarriedForward: initialCarried,
      UsedLeave: 0,
      AvailableLeave: Math.round((earnedLeave + effectiveCarried) * 100) / 100,
      UpdatedAt: new Date().toISOString(),
      isCarryForwardExpired: isExpired,
      effectiveCarriedForward: effectiveCarried,
      transitionPending,
    };

    if (googleSheetsService.isLiveApiEnabled()) {
      try {
        await googleSheetsService.appendSheetRow(SHEET_NAMES.LEAVE_BALANCES, [
          newBalance.LeaveBalanceID,
          newBalance.UserID,
          newBalance.CalendarYear,
          newBalance.EarnedLeave,
          newBalance.CarriedForward,
          newBalance.UsedLeave,
          newBalance.AvailableLeave,
          newBalance.UpdatedAt,
        ]);
      } catch (err: any) {
        console.error('[LeaveService Error] Failed to append initial balance:', err.message);
        throw new Error(`Database error: Failed to append initial leave balance: ${err.message}`);
      }
    } else {
      this.mockBalances.push({
        LeaveBalanceID: newBalance.LeaveBalanceID,
        UserID: newBalance.UserID,
        CalendarYear: newBalance.CalendarYear,
        EarnedLeave: newBalance.EarnedLeave,
        CarriedForward: newBalance.CarriedForward,
        UsedLeave: newBalance.UsedLeave,
        AvailableLeave: newBalance.AvailableLeave,
        UpdatedAt: newBalance.UpdatedAt,
      });
    }

    return newBalance;
  }

  /**
   * Check if year transition from sourceYear to destinationYear has already been executed.
   */
  public async isTransitionExecuted(
    sourceYear: number,
    destinationYear: number
  ): Promise<{ executed: boolean; log?: any }> {
    const transitionLogId = `TRANSITION-${sourceYear}-${destinationYear}`;
    const logs = await activityLogService.getAllLogs();
    const existingExecution = logs.find(
      (l) => l.Action === 'YEAR_TRANSITION_EXECUTED' && l.EntityID === transitionLogId
    );

    if (existingExecution) {
      return { executed: true, log: existingExecution };
    }
    return { executed: false };
  }

  /**
   * Preview year-end carry-forward transition (Admin only).
   * Strictly read-only: does NOT write to Google Sheets or ActivityLogs.
   */
  public async previewYearTransition(
    sourceYear: number,
    destinationYear: number
  ): Promise<YearTransitionPreviewResult> {
    if (!sourceYear || !destinationYear) {
      throw new Error('Both sourceYear and destinationYear are required.');
    }
    if (destinationYear !== sourceYear + 1) {
      throw new Error(`Destination year must be exactly one year after source year (${sourceYear} -> ${sourceYear + 1}).`);
    }

    const transitionCheck = await this.isTransitionExecuted(sourceYear, destinationYear);

    const allUsers = await userService.getAllUsers();
    const sourceBalances = await this.getAllBalances(sourceYear);

    const records: YearTransitionPreviewItem[] = [];
    const excludedRecords: YearTransitionPreviewItem[] = [];

    for (const user of allUsers) {
      const uId = user.UserID.trim();
      const isActive = userService.parseIsActive(user.IsActive);

      // Check active status
      if (!isActive) {
        excludedRecords.push({
          userId: uId,
          fullName: (user.FullName || '').trim(),
          email: (user.Email || '').trim(),
          role: user.Role,
          sourceEarned: 0,
          sourceUsed: 0,
          eligibleUnused: 0,
          carryForwardAmount: 0,
          lapsedAmount: 0,
          status: 'Excluded',
          remarks: 'Account is inactive.',
        });
        continue;
      }

      // Check role
      if (user.Role !== 'Staff') {
        excludedRecords.push({
          userId: uId,
          fullName: (user.FullName || '').trim(),
          email: (user.Email || '').trim(),
          role: user.Role,
          sourceEarned: 0,
          sourceUsed: 0,
          eligibleUnused: 0,
          carryForwardAmount: 0,
          lapsedAmount: 0,
          status: 'Excluded',
          remarks: `Non-staff role: ${user.Role}.`,
        });
        continue;
      }

      // Check joining date validity
      if (!user.JoiningDate || !validateDate(user.JoiningDate).isValid) {
        excludedRecords.push({
          userId: uId,
          fullName: (user.FullName || '').trim(),
          email: (user.Email || '').trim(),
          role: user.Role,
          sourceEarned: 0,
          sourceUsed: 0,
          eligibleUnused: 0,
          carryForwardAmount: 0,
          lapsedAmount: 0,
          status: 'Excluded',
          remarks: 'Missing or invalid joining date.',
        });
        continue;
      }

      // Check if user joined after source year
      if (user.JoiningDate > `${sourceYear}-12-31`) {
        excludedRecords.push({
          userId: uId,
          fullName: (user.FullName || '').trim(),
          email: (user.Email || '').trim(),
          role: user.Role,
          sourceEarned: 0,
          sourceUsed: 0,
          eligibleUnused: 0,
          carryForwardAmount: 0,
          lapsedAmount: 0,
          status: 'Excluded',
          remarks: `Joined on ${user.JoiningDate}, after source year ${sourceYear}.`,
        });
        continue;
      }

      const sBalance = sourceBalances.find((b) => b.UserID.trim() === uId);

      let sourceEarned = 0;
      let sourceUsed = 0;

      // Completed months accrual for full source year as of destination year start
      const accrual = leavePolicyService.calculateCompletedMonthAccrual(
        user.JoiningDate,
        `${destinationYear}-01-01`,
        sourceYear
      );

      if (sBalance) {
        sourceUsed = parseFloat(String(sBalance.UsedLeave || 0));
        const storedEarned = parseFloat(String(sBalance.EarnedLeave || 0));
        sourceEarned = Math.max(storedEarned, accrual.accruedDays);
      } else {
        sourceEarned = accrual.accruedDays;
        sourceUsed = 0;
      }

      // Eligible unused balance at year end
      const eligibleUnused = Math.max(0, Math.round((sourceEarned - sourceUsed) * 100) / 100);
      const carryForwardAmount = Math.round(eligibleUnused * 0.5 * 100) / 100;
      const lapsedAmount = Math.round((eligibleUnused - carryForwardAmount) * 100) / 100;

      records.push({
        userId: uId,
        fullName: (user.FullName || '').trim(),
        email: (user.Email || '').trim(),
        role: user.Role,
        sourceEarned,
        sourceUsed,
        eligibleUnused,
        carryForwardAmount,
        lapsedAmount,
        status: 'Eligible',
      });
    }

    const totalCarried = Math.round(records.reduce((sum, r) => sum + r.carryForwardAmount, 0) * 100) / 100;
    const totalLapsed = Math.round(records.reduce((sum, r) => sum + r.lapsedAmount, 0) * 100) / 100;

    return {
      sourceYear,
      destinationYear,
      isAlreadyExecuted: transitionCheck.executed,
      alreadyExecutedDetails: transitionCheck.executed
        ? {
            executedAt: transitionCheck.log.Timestamp,
            executedBy: transitionCheck.log.PerformedBy,
            reason: transitionCheck.log.Reason,
          }
        : undefined,
      eligibleCount: records.length,
      totalCarried,
      totalLapsed,
      records,
      excludedRecords,
    };
  }

  /**
   * Execute year-end carry-forward transition (Admin only).
   * Confirmed rules:
   * - Exactly 50% carried forward to destination year.
   * - Remaining 50% permanently lapses on Dec 31.
   * - Idempotent: duplicate execution is rejected with explanation.
   * - Destination balances created or updated without duplicates.
   * - Source year historical balances preserved untouched.
   * - Audit logged to ActivityLogs.
   * - Safe against partial failure: does not log transition completion if an error occurs.
   */
  public async executeYearTransition(
    adminId: string,
    sourceYear: number,
    destinationYear: number,
    confirm = false
  ): Promise<YearTransitionExecutionResult> {
    if (!confirm) {
      throw new Error('Explicit admin confirmation is required to execute year transition.');
    }
    if (destinationYear !== sourceYear + 1) {
      throw new Error(`Destination year must be exactly one year after source year (${sourceYear} -> ${sourceYear + 1}).`);
    }

    const transitionCheck = await this.isTransitionExecuted(sourceYear, destinationYear);
    if (transitionCheck.executed) {
      throw new Error(
        `Year transition from ${sourceYear} to ${destinationYear} was already executed on ${transitionCheck.log.Timestamp} by ${transitionCheck.log.PerformedBy}. Duplicate execution is rejected.`
      );
    }

    const preview = await this.previewYearTransition(sourceYear, destinationYear);
    const now = new Date().toISOString();
    const destinationBalances = await this.getAllBalances(destinationYear);

    const isExpired = leavePolicyService.isCarryForwardExpired(undefined, destinationYear);
    let processedCount = 0;

    try {
      for (const item of preview.records) {
        // Support testing partial failure
        if (this.simulatedFailureUserId && item.userId.trim() === this.simulatedFailureUserId.trim()) {
          throw new Error(`Simulated database failure for employee ${item.userId}`);
        }

        const existingDest = destinationBalances.find(
          (b) => b.UserID.trim() === item.userId.trim() && Number(b.CalendarYear) === destinationYear
        );

        if (existingDest) {
          existingDest.CarriedForward = item.carryForwardAmount;
          const earned = parseFloat(String(existingDest.EarnedLeave || 0));
          const used = parseFloat(String(existingDest.UsedLeave || 0));
          const effectiveCarried = isExpired ? 0 : item.carryForwardAmount;
          existingDest.AvailableLeave = Math.round((earned + effectiveCarried - used) * 100) / 100;
          existingDest.UpdatedAt = now;

          if (googleSheetsService.isLiveApiEnabled()) {
            const actualRow = await googleSheetsService.findRowIndexByColumnValue(
              SHEET_NAMES.LEAVE_BALANCES,
              'A',
              existingDest.LeaveBalanceID
            );
            const all = await this.getAllBalances();
            const idx = all.findIndex(
              (b) => b.UserID.trim() === item.userId.trim() && Number(b.CalendarYear) === destinationYear
            );
            const sheetRowIndex = actualRow !== -1 ? actualRow : (idx !== -1 ? idx + 2 : -1);

            if (sheetRowIndex !== -1) {
              try {
                await googleSheetsService.updateSheetRange(
                  `${SHEET_NAMES.LEAVE_BALANCES}!A${sheetRowIndex}:H${sheetRowIndex}`,
                  [
                    [
                      existingDest.LeaveBalanceID,
                      existingDest.UserID,
                      existingDest.CalendarYear,
                      existingDest.EarnedLeave,
                      existingDest.CarriedForward,
                      existingDest.UsedLeave,
                      existingDest.AvailableLeave,
                      existingDest.UpdatedAt,
                    ],
                  ]
                );
              } catch (err: any) {
                console.error(`[YearTransition Error] Failed updating row for user ${item.userId}:`, err.message);
                throw new Error(`Database error during year transition update for employee ${item.userId}: ${err.message}`);
              }
            }
          } else {
            const idx = this.mockBalances.findIndex(
              (b) => b.UserID.trim() === item.userId.trim() && Number(b.CalendarYear) === destinationYear
            );
            if (idx !== -1) {
              this.mockBalances[idx] = existingDest;
            }
          }
        } else {
          const user = await userService.getUserById(item.userId);
          let destEarned = 0;
          if (user && user.JoiningDate) {
            const accrual = leavePolicyService.calculateCompletedMonthAccrual(
              user.JoiningDate,
              undefined,
              destinationYear
            );
            destEarned = accrual.accruedDays;
          }

          const effectiveCarried = isExpired ? 0 : item.carryForwardAmount;
          const newRecord: LeaveBalanceRow = {
            LeaveBalanceID: `BAL-${destinationYear}-${item.userId}`,
            UserID: item.userId,
            CalendarYear: destinationYear,
            EarnedLeave: destEarned,
            CarriedForward: item.carryForwardAmount,
            UsedLeave: 0,
            AvailableLeave: Math.round((destEarned + effectiveCarried) * 100) / 100,
            UpdatedAt: now,
          };

          if (googleSheetsService.isLiveApiEnabled()) {
            try {
              await googleSheetsService.appendSheetRow(SHEET_NAMES.LEAVE_BALANCES, [
                newRecord.LeaveBalanceID,
                newRecord.UserID,
                newRecord.CalendarYear,
                newRecord.EarnedLeave,
                newRecord.CarriedForward,
                newRecord.UsedLeave,
                newRecord.AvailableLeave,
                newRecord.UpdatedAt,
              ]);
            } catch (err: any) {
              console.error(`[YearTransition Error] Failed appending row for user ${item.userId}:`, err.message);
              throw new Error(`Database error during year transition append for employee ${item.userId}: ${err.message}`);
            }
          } else {
            this.mockBalances.push(newRecord);
          }
        }

        processedCount++;
      }
    } catch (err: any) {
      console.error('[YearTransition Error] Failure during transition execution:', err.message);
      throw new Error(
        `Partial failure during year transition from ${sourceYear} to ${destinationYear}: successfully processed ${processedCount} of ${preview.records.length} employees before failure: ${err.message}. Transition not marked as complete.`
      );
    }

    // Record audit event in ActivityLogs
    await activityLogService.logActivity({
      performedBy: adminId,
      action: 'YEAR_TRANSITION_EXECUTED',
      entityType: 'YearTransition',
      entityID: `TRANSITION-${sourceYear}-${destinationYear}`,
      newValue: JSON.stringify({
        sourceYear,
        destinationYear,
        processedCount: preview.records.length,
        totalCarried: preview.totalCarried,
        totalLapsed: preview.totalLapsed,
        summary: preview.records,
      }),
      reason: `Admin executed year-end transition from ${sourceYear} to ${destinationYear}. Carried: ${preview.totalCarried} days, Lapsed: ${preview.totalLapsed} days.`,
    });

    return {
      success: true,
      sourceYear,
      destinationYear,
      executedAt: now,
      executedBy: adminId,
      processedCount: preview.records.length,
      totalCarried: preview.totalCarried,
      totalLapsed: preview.totalLapsed,
      summary: preview.records,
    };
  }

  /**
   * Submit an informational leave request for a staff member.
   * Enforces:
   * - No approval or rejection workflow.
   * - No automatic balance deduction on submission.
   * - Excess balance generates a warning but does NOT block submission.
   */
  public async submitLeaveRequest(
    userId: string,
    data: {
      leaveType: string;
      startDate: string;
      endDate: string;
      reason: string;
      remarks?: string;
    }
  ): Promise<LeaveSubmissionResult> {
    const user = await userService.getUserById(userId);
    if (!user) {
      throw new Error('User not found.');
    }

    const rangeVal = validateLeaveDateRange(data.startDate, data.endDate);
    if (!rangeVal.isValid) {
      throw new Error(rangeVal.errors.join(' '));
    }

    const leaveTypeTrimmed = (data.leaveType || '').trim();
    if (!leaveTypeTrimmed) {
      throw new Error('Leave type is required.');
    }

    const reasonTrimmed = (data.reason || '').trim();
    if (!reasonTrimmed) {
      throw new Error('Reason is required.');
    }

    // Calculate requested leave days using confirmed rules
    const calc = await leavePolicyService.calculateLeaveDays(data.startDate, data.endDate);
    const calculatedDays = calc.calculatedDays;

    // Check available balance and accrued allowance
    const currentYear = new Date(data.startDate).getUTCFullYear();
    const balance = await this.getUserBalance(userId, currentYear);
    const available = Number(balance.AvailableLeave);

    // Compute total leave taken for current calendar year from existing requests (excluding withdrawn/cancelled)
    const userRequests = await this.getUserRequests(userId);
    const yearPrefix = `${currentYear}-`;
    const priorLeaveTaken = userRequests
      .filter((r) => r.Status !== 'Withdrawn' && r.Status !== 'Cancelled' && !r.Remarks?.includes('(Exempt from Regular Balance)') && r.StartDate && r.StartDate.startsWith(yearPrefix))
      .reduce((sum, r) => sum + (parseFloat(String(r.CalculatedDays || 0)) || 0), 0);
    const totalLeaveTaken = Math.round((priorLeaveTaken + calculatedDays) * 100) / 100;

    const accruedAllowance = Math.round(
      (Number(balance.EarnedLeave || 0) + (balance.isCarryForwardExpired ? 0 : Number(balance.CarriedForward || 0))) * 100
    ) / 100;

    // Warning when total leave taken exceeds accrued allowance
    let warning: string | undefined;
    if (totalLeaveTaken > accruedAllowance) {
      const excessDays = Math.round((totalLeaveTaken - accruedAllowance) * 100) / 100;
      warning = `Leave taken exceeds accrued allowance by ${excessDays} day${excessDays === 1 ? '' : 's'}.`;
    } else if (calculatedDays > available) {
      const excessDays = Math.round((calculatedDays - available) * 100) / 100;
      warning = `Leave taken exceeds accrued allowance by ${excessDays} day${excessDays === 1 ? '' : 's'}.`;
    }

    const now = new Date().toISOString();
    const leaveRequestId = `LRQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newRequest: LeaveRequestRow = {
      LeaveRequestID: leaveRequestId,
      UserID: userId.trim(),
      LeaveType: leaveTypeTrimmed,
      StartDate: data.startDate.trim(),
      EndDate: data.endDate.trim(),
      CalculatedDays: calculatedDays,
      Reason: reasonTrimmed,
      Remarks: (data.remarks || '').trim(),
      SubmittedAt: now,
      NotificationStatus: 'Pending',
      Status: 'Recorded',
    };

    // Save to LeaveRequests
    if (googleSheetsService.isLiveApiEnabled()) {
      await googleSheetsService.appendSheetRow(SHEET_NAMES.LEAVE_REQUESTS, [
        newRequest.LeaveRequestID,
        newRequest.UserID,
        newRequest.LeaveType,
        newRequest.StartDate,
        newRequest.EndDate,
        newRequest.CalculatedDays,
        newRequest.Reason,
        newRequest.Remarks,
        newRequest.SubmittedAt,
        newRequest.NotificationStatus,
        newRequest.Status || 'Recorded',
      ]);
    } else {
      this.mockRequests.push(newRequest);
    }

    // Dispatch informational notification to Admins
    let emailNotification = {
      attempted: true,
      sent: false,
      recipientsCount: 0,
      message: '',
    };

    try {
      const emailResult = await emailService.sendLeaveSubmissionNotifications({
        leaveRequestId: newRequest.LeaveRequestID,
        staffName: user.FullName.trim(),
        staffEmail: user.Email.trim(),
        leaveType: newRequest.LeaveType,
        startDate: newRequest.StartDate,
        endDate: newRequest.EndDate,
        calculatedDays,
        reason: newRequest.Reason,
        submittedAt: newRequest.SubmittedAt,
        warning,
      });

      const finalNotificationStatus = emailResult.dispatchedCount > 0 ? 'Sent' : 'Failed';
      newRequest.NotificationStatus = finalNotificationStatus;
      emailNotification = {
        attempted: true,
        sent: emailResult.dispatchedCount > 0,
        recipientsCount: emailResult.logs.length,
        message: emailResult.dispatchedCount > 0
          ? `Notification dispatched to ${emailResult.dispatchedCount} recipient(s).`
          : `Notification logged to EmailLogs; email transport credentials not configured.`,
      };
    } catch (emailErr: any) {
      console.error('[LeaveService] Failed to send email notifications:', emailErr?.message);
      newRequest.NotificationStatus = 'Failed';
      emailNotification = {
        attempted: true,
        sent: false,
        recipientsCount: 0,
        message: `Notification dispatch failed: ${emailErr?.message}`,
      };
    }

    // Synchronize final NotificationStatus back to Google Sheets database
    if (googleSheetsService.isLiveApiEnabled()) {
      try {
        const allRequests = await googleSheetsService.getSheetRecords<LeaveRequestRow>(SHEET_NAMES.LEAVE_REQUESTS);
        const reqRowIdx = allRequests.findIndex((r) => r.LeaveRequestID === newRequest.LeaveRequestID);
        if (reqRowIdx !== -1) {
          const sheetRow = reqRowIdx + 2;
          await googleSheetsService.updateSheetRange(
            `${SHEET_NAMES.LEAVE_REQUESTS}!J${sheetRow}`,
            [[newRequest.NotificationStatus]]
          );
        }
      } catch (syncErr: any) {
        console.warn(`[LeaveService] Failed to sync NotificationStatus to Google Sheets:`, syncErr.message);
      }
    }

    // Log submission in ActivityLogs
    await activityLogService.logActivity({
      performedBy: userId,
      action: 'LEAVE_REQUEST_SUBMITTED',
      entityType: 'LeaveRequest',
      entityID: newRequest.LeaveRequestID,
      newValue: JSON.stringify({
        type: newRequest.LeaveType,
        days: calculatedDays,
        start: newRequest.StartDate,
        end: newRequest.EndDate,
      }),
      reason: `Submitted leave request for ${calculatedDays} day(s)`,
    });

    return {
      request: newRequest,
      warning,
      calculatedDays,
      availableBalance: available,
      emailNotification,
    };
  }

  /**
   * Adjust leave balance manually (Admin only).
   * Records previous values, new values, and mandatory reason in ActivityLogs.
   */
  public async adjustBalance(
    adminId: string,
    data: {
      userId: string;
      calendarYear: number;
      earnedLeave?: number;
      carriedForward?: number;
      usedLeave?: number;
      reason: string;
    }
  ): Promise<LeaveBalanceRow> {
    const reasonTrimmed = (data.reason || '').trim();
    if (!reasonTrimmed) {
      throw new Error('A valid reason is required for balance adjustment.');
    }

    const currentBalance = await this.getUserBalance(data.userId, data.calendarYear);
    const prevSnapshot = JSON.stringify(currentBalance);

    if (data.earnedLeave !== undefined) {
      currentBalance.EarnedLeave = Math.max(0, data.earnedLeave);
    }
    if (data.carriedForward !== undefined) {
      currentBalance.CarriedForward = Math.max(0, data.carriedForward);
    }
    if (data.usedLeave !== undefined) {
      currentBalance.UsedLeave = Math.max(0, data.usedLeave);
    }

    const earned = parseFloat(String(currentBalance.EarnedLeave));
    const carried = parseFloat(String(currentBalance.CarriedForward));
    const used = parseFloat(String(currentBalance.UsedLeave));
    currentBalance.AvailableLeave = Math.round((earned + carried - used) * 100) / 100;
    currentBalance.UpdatedAt = new Date().toISOString();

    if (googleSheetsService.isLiveApiEnabled()) {
      const actualRow = await googleSheetsService.findRowIndexByColumnValue(
        SHEET_NAMES.LEAVE_BALANCES,
        'A',
        currentBalance.LeaveBalanceID
      );
      const all = await this.getAllBalances();
      const idx = all.findIndex(
        (b) => b.UserID.trim() === data.userId.trim() && Number(b.CalendarYear) === data.calendarYear
      );
      const sheetRowIndex = actualRow !== -1 ? actualRow : (idx !== -1 ? idx + 2 : -1);

      if (sheetRowIndex !== -1) {
        await googleSheetsService.updateSheetRange(
          `${SHEET_NAMES.LEAVE_BALANCES}!A${sheetRowIndex}:H${sheetRowIndex}`,
          [
            [
              currentBalance.LeaveBalanceID,
              currentBalance.UserID,
              currentBalance.CalendarYear,
              currentBalance.EarnedLeave,
              currentBalance.CarriedForward,
              currentBalance.UsedLeave,
              currentBalance.AvailableLeave,
              currentBalance.UpdatedAt,
            ],
          ]
        );
      }
    } else {
      const idx = this.mockBalances.findIndex(
        (b) => b.UserID.trim() === data.userId.trim() && Number(b.CalendarYear) === data.calendarYear
      );
      if (idx !== -1) {
        this.mockBalances[idx] = currentBalance;
      }
    }

    await activityLogService.logActivity({
      performedBy: adminId,
      action: 'LEAVE_BALANCE_ADJUSTED',
      entityType: 'LeaveBalance',
      entityID: currentBalance.LeaveBalanceID,
      previousValue: prevSnapshot,
      newValue: JSON.stringify(currentBalance),
      reason: reasonTrimmed,
    });

    return currentBalance;
  }

  /**
   * Allocate Special Leave to one or more employees based on Critical Section criteria.
   * Admin-only administrative allocation.
   * - Critical section justification is mandatory.
   * - Sends informational notification email to employee.
   * - When autoMarkPresent is true (default), automatically marks working days in range as 'Present' in Attendance.
   */
  public async allocateSpecialLeave(
    adminId: string,
    data: {
      userIds: string[];
      criticalSection: string;
      startDate: string;
      endDate: string;
      reason: string;
      exemptFromBalance?: boolean;
      autoMarkPresent?: boolean;
      remarks?: string;
    }
  ): Promise<{
    allocatedCount: number;
    requests: LeaveRequestRow[];
    autoMarkedAttendanceDays?: number;
  }> {
    const admin = await userService.getUserById(adminId);
    if (!admin) {
      throw new Error('Admin user not found.');
    }

    const criticalSectionTrimmed = (data.criticalSection || '').trim();
    if (!criticalSectionTrimmed) {
      throw new Error('Critical section/reason is required.');
    }

    const reasonTrimmed = (data.reason || '').trim();
    if (!reasonTrimmed) {
      throw new Error('A valid justification reason is required for administrative allocation.');
    }

    const rangeVal = validateLeaveDateRange(data.startDate, data.endDate);
    if (!rangeVal.isValid) {
      throw new Error(rangeVal.errors.join(' '));
    }

    if (!data.userIds || !Array.isArray(data.userIds) || data.userIds.length === 0) {
      throw new Error('At least one employee must be selected.');
    }

    const calc = await leavePolicyService.calculateLeaveDays(data.startDate, data.endDate);
    const calculatedDays = calc.calculatedDays;
    const isExempt = data.exemptFromBalance !== false;

    const createdRequests: LeaveRequestRow[] = [];
    const now = new Date().toISOString();

    for (const userId of data.userIds) {
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error(`Employee with ID ${userId} not found.`);
      }

      const leaveRequestId = `LRQ-SPL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const leaveType = `Special Leave (${criticalSectionTrimmed})`;
      const exemptionTag = isExempt ? '(Exempt from Regular Balance)' : '(Standard Balance)';
      const fullRemarks = `[Admin Allocated - ${criticalSectionTrimmed}] ${exemptionTag} ${data.remarks ? data.remarks.trim() : ''}`.trim();

      const newRequest: LeaveRequestRow = {
        LeaveRequestID: leaveRequestId,
        UserID: userId.trim(),
        LeaveType: leaveType,
        StartDate: data.startDate.trim(),
        EndDate: data.endDate.trim(),
        CalculatedDays: calculatedDays,
        Reason: reasonTrimmed,
        Remarks: fullRemarks,
        SubmittedAt: now,
        NotificationStatus: 'Pending',
        Status: 'Recorded',
      };

      if (googleSheetsService.isLiveApiEnabled()) {
        await googleSheetsService.appendSheetRow(SHEET_NAMES.LEAVE_REQUESTS, [
          newRequest.LeaveRequestID,
          newRequest.UserID,
          newRequest.LeaveType,
          newRequest.StartDate,
          newRequest.EndDate,
          newRequest.CalculatedDays,
          newRequest.Reason,
          newRequest.Remarks,
          newRequest.SubmittedAt,
          newRequest.NotificationStatus,
          newRequest.Status || 'Recorded',
        ]);
      } else {
        this.mockRequests.push(newRequest);
      }

      // Log to ActivityLogs
      await activityLogService.logActivity({
        performedBy: adminId,
        action: 'SPECIAL_LEAVE_ALLOCATED',
        entityType: 'LeaveRequest',
        entityID: newRequest.LeaveRequestID,
        newValue: JSON.stringify({
          recipient: user.FullName,
          criticalSection: criticalSectionTrimmed,
          days: calculatedDays,
          startDate: newRequest.StartDate,
          endDate: newRequest.EndDate,
          exemptFromBalance: isExempt,
        }),
        reason: `Special leave allocated by ${admin.FullName} for critical section "${criticalSectionTrimmed}": ${reasonTrimmed}`,
      });

      // Dispatch Email Notification to Employee
      try {
        const emailRes = await emailService.sendSpecialLeaveNotification({
          leaveRequestId: newRequest.LeaveRequestID,
          staffName: user.FullName.trim(),
          staffEmail: user.Email ? user.Email.trim() : '',
          adminName: admin.FullName.trim(),
          criticalSection: criticalSectionTrimmed,
          startDate: newRequest.StartDate,
          endDate: newRequest.EndDate,
          calculatedDays,
          reason: reasonTrimmed,
          exemptFromBalance: isExempt,
        });
        newRequest.NotificationStatus = emailRes.dispatched ? 'Sent' : 'Failed';
      } catch (err: any) {
        console.error(`[LeaveService] Failed to notify ${user.Email}:`, err.message);
        newRequest.NotificationStatus = 'Failed';
      }

      // Synchronize final NotificationStatus back to Google Sheets database
      if (googleSheetsService.isLiveApiEnabled()) {
        try {
          const allRequests = await googleSheetsService.getSheetRecords<LeaveRequestRow>(SHEET_NAMES.LEAVE_REQUESTS);
          const reqRowIdx = allRequests.findIndex((r) => r.LeaveRequestID === newRequest.LeaveRequestID);
          if (reqRowIdx !== -1) {
            const sheetRow = reqRowIdx + 2;
            await googleSheetsService.updateSheetRange(
              `${SHEET_NAMES.LEAVE_REQUESTS}!J${sheetRow}`,
              [[newRequest.NotificationStatus]]
            );
          }
        } catch (syncErr: any) {
          console.warn(`[LeaveService] Failed to sync NotificationStatus for ${newRequest.LeaveRequestID}:`, syncErr.message);
        }
      }

      createdRequests.push(newRequest);
    }

    // Auto-mark working days in range as 'Present' in Attendance (if autoMarkPresent is not false)
    const shouldAutoMark = data.autoMarkPresent !== false;
    let autoMarkedDaysCount = 0;

    if (shouldAutoMark && data.userIds.length > 0) {
      try {
        const holidays = await holidayService.getAllHolidays();
        const holidayDateSet = new Set(holidays.map((h) => h.HolidayDate.trim()));

        const [sYear, sMonth, sDay] = data.startDate.split('-').map(Number);
        const [eYear, eMonth, eDay] = data.endDate.split('-').map(Number);

        const curDate = new Date(Date.UTC(sYear, sMonth - 1, sDay));
        const stopDate = new Date(Date.UTC(eYear, eMonth - 1, eDay));

        const workingDates: string[] = [];
        while (curDate <= stopDate) {
          const dateStr = curDate.toISOString().split('T')[0];
          const dayOfWeek = curDate.getUTCDay(); // 0 is Sunday

          // Safely preserve Sundays and official Institute Holidays
          if (dayOfWeek !== 0 && !holidayDateSet.has(dateStr)) {
            workingDates.push(dateStr);
          }

          curDate.setUTCDate(curDate.getUTCDate() + 1);
        }

        // Batch mark Present for each working day
        for (const workingDate of workingDates) {
          const entries = data.userIds.map((uid) => ({
            userId: uid.trim(),
            status: 'Present' as ValidAttendanceStatus,
          }));

          if (entries.length > 0) {
            await attendanceService.markDailyAttendance(workingDate, entries, adminId);
          }
        }

        autoMarkedDaysCount = workingDates.length;
      } catch (attErr: any) {
        console.error('[LeaveService] Failed to auto-mark attendance for special leave:', attErr.message);
      }
    }

    return {
      allocatedCount: createdRequests.length,
      requests: createdRequests,
      autoMarkedAttendanceDays: autoMarkedDaysCount,
    };
  }

  /**
   * Withdraw / cancel an existing leave request.
   * - Staff can withdraw their own upcoming leave requests.
   * - Admin can withdraw any leave request.
   * - Cannot withdraw already withdrawn/cancelled leaves.
   * - Non-admin cannot withdraw past or ongoing leaves.
   * - Records audit log to ActivityLogs.
   */
  public async cancelLeaveRequest(
    currentUser: { userId: string; role: string },
    leaveRequestId: string,
    reason?: string
  ): Promise<LeaveRequestRow> {
    const trimmedId = (leaveRequestId || '').trim();
    if (!trimmedId) {
      const err: any = new Error('Leave request ID is required.');
      err.statusCode = 400;
      throw err;
    }

    const all = await this.getAllRequests();
    const existingIndex = all.findIndex((r) => r.LeaveRequestID.trim() === trimmedId);
    if (existingIndex === -1) {
      const err: any = new Error(`Leave request '${trimmedId}' not found.`);
      err.statusCode = 404;
      throw err;
    }

    const existing = all[existingIndex];

    // Authorization: owner or Admin
    if (currentUser.role !== 'Admin' && existing.UserID.trim() !== currentUser.userId.trim()) {
      const err: any = new Error('You are not authorized to withdraw this leave request.');
      err.statusCode = 403;
      throw err;
    }

    // Status: cannot withdraw twice
    if (existing.Status === 'Withdrawn' || existing.Status === 'Cancelled') {
      const err: any = new Error('This leave request has already been withdrawn.');
      err.statusCode = 400;
      throw err;
    }

    // Date check: staff can only withdraw upcoming leaves (starting today or later)
    const todayStr = new Date().toISOString().split('T')[0];
    if (currentUser.role !== 'Admin' && existing.StartDate < todayStr) {
      const err: any = new Error('Cannot withdraw leave notices for past or ongoing dates. Please contact an Administrator.');
      err.statusCode = 400;
      throw err;
    }

    const prevData = { ...existing };
    existing.Status = 'Withdrawn';
    const withdrawalNote = reason && reason.trim() ? `[Withdrawn: ${reason.trim()}]` : '[Withdrawn]';
    existing.Remarks = existing.Remarks ? `${existing.Remarks} ${withdrawalNote}` : withdrawalNote;

    // Update in Google Sheets or mock
    if (googleSheetsService.isLiveApiEnabled()) {
      // Find true unsorted physical row index in Google Sheets
      const rawRecords = await googleSheetsService.getSheetRecords<LeaveRequestRow>(
        SHEET_NAMES.LEAVE_REQUESTS
      );
      const rawIndex = rawRecords.findIndex((r) => (r.LeaveRequestID || '').trim() === trimmedId);
      if (rawIndex !== -1) {
        const rowIndex = rawIndex + 2;
        await googleSheetsService.updateSheetRange(
          `${SHEET_NAMES.LEAVE_REQUESTS}!A${rowIndex}:K${rowIndex}`,
          [
            [
              existing.LeaveRequestID,
              existing.UserID,
              existing.LeaveType,
              existing.StartDate,
              existing.EndDate,
              existing.CalculatedDays,
              existing.Reason,
              existing.Remarks,
              existing.SubmittedAt,
              existing.NotificationStatus,
              existing.Status,
            ],
          ]
        );
      }
    } else {
      const mockIdx = this.mockRequests.findIndex((r) => r.LeaveRequestID.trim() === trimmedId);
      if (mockIdx !== -1) {
        this.mockRequests[mockIdx] = { ...existing };
      }
    }

    // Record ActivityLog
    await activityLogService.logActivity({
      performedBy: currentUser.userId,
      action: 'LEAVE_WITHDRAWN',
      entityType: 'LeaveRequest',
      entityID: trimmedId,
      previousValue: JSON.stringify(prevData),
      newValue: JSON.stringify(existing),
      reason: reason ? reason.trim() : 'Withdrawn by employee',
    });

    return existing;
  }
}

export const leaveService = new LeaveService();
