import { googleSheetsService } from './googleSheets.service.js';
import { SHEET_NAMES, ValidAttendanceStatus } from '../config/sheets.config.js';
import { AttendanceRow } from '../types/database.types.js';
import { userService } from './userService.js';
import { holidayService } from './holiday.service.js';
import { activityLogService } from './activityLog.service.js';
import { validateDate, validateAttendanceStatus } from '../validation/sheetValidators.js';

export interface DailyAttendanceItem {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  attendanceId?: string;
  status: ValidAttendanceStatus | 'Not Marked';
  markedBy?: string;
  updatedAt?: string;
}

export interface InstituteMonthlyAttendanceReport {
  year?: number;
  month?: number;
  monthName?: string;
  startDate?: string;
  endDate?: string;
  periodTitle?: string;
  reportType?: 'monthly' | 'multi' | 'annual' | 'custom';
  totalEmployees: number;
  totalCalendarDays: number;
  totalWorkingDays: number;
  totalSundays: number;
  totalHolidays: number;
  overallTotals: {
    totalWorkingDays: number;
    totalPresent: number;
    totalAbsent: number;
    totalNotMarked: number;
    totalSundays: number;
    totalHolidays: number;
  };
  employeeSummaries: Array<{
    userId: string;
    fullName: string;
    email: string;
    role: string;
    workingDays: number;
    presentCount: number;
    absentCount: number;
    notMarkedCount: number;
    sundaysCount: number;
    holidaysCount: number;
    attendanceRate: number;
  }>;
}

export interface MonthlyAttendanceSummary {
  userId: string;
  year: number;
  month: number;
  totalCalendarDays: number;
  totalWorkingDays: number;
  totalSundays: number;
  totalHolidays: number;
  presentCount: number;
  absentCount: number;
  notMarkedCount: number;
  specialLeaveCount?: number;
  attendanceRate?: number;
  leaveCount?: number;
  records: Array<{
    date: string;
    dayOfWeek: string;
    isSunday: boolean;
    isHoliday: boolean;
    holidayName?: string;
    status: ValidAttendanceStatus | 'Not Marked';
    markedBy?: string;
    isLeave?: boolean;
    leaveType?: string;
    leaveRequestId?: string;
    isSpecialLeave?: boolean;
  }>;
}

export class AttendanceService {
  private mockAttendance: AttendanceRow[] = [];

  public clearMockAttendance(): void {
    this.mockAttendance = [];
  }

  public setMockAttendance(records: AttendanceRow[]): void {
    this.mockAttendance = [...records];
  }

  /**
   * Fetch all raw attendance records.
   */
  public async getAllAttendance(): Promise<AttendanceRow[]> {
    if (googleSheetsService.isLiveApiEnabled()) {
      try {
        return await googleSheetsService.getSheetRecords<AttendanceRow>(SHEET_NAMES.ATTENDANCE);
      } catch (err: any) {
        console.error('[AttendanceService Error] Failed to fetch records:', err.message);
        throw new Error(`Database error: Failed to fetch attendance records: ${err.message}`);
      }
    }
    return [...this.mockAttendance];
  }

  /**
   * Get attendance records for a specific date (YYYY-MM-DD) across all active employees.
   */
  public async getDailyAttendance(dateStr: string): Promise<{
    date: string;
    isSunday: boolean;
    isHoliday: boolean;
    holidayName?: string;
    totalStaff: number;
    presentCount: number;
    absentCount: number;
    notMarkedCount: number;
    staffAttendance: DailyAttendanceItem[];
  }> {
    const dateVal = validateDate(dateStr, 'AttendanceDate');
    if (!dateVal.isValid) {
      throw new Error(dateVal.errors.join(' '));
    }

    const allUsers = await userService.getAllUsers();
    const activeStaff = allUsers.filter(
      (u) => userService.parseIsActive(u.IsActive) && u.Role === 'Staff'
    );

    const allAttendance = await this.getAllAttendance();
    const dateRecords = allAttendance.filter((a) => a.AttendanceDate.trim() === dateStr.trim());

    const isSunday = holidayService.isSunday(dateStr);
    const holidays = await holidayService.getAllHolidays();
    const holidayMatch = holidays.find((h) => h.HolidayDate.trim() === dateStr.trim());

    let presentCount = 0;
    let absentCount = 0;
    let notMarkedCount = 0;

    const staffAttendance: DailyAttendanceItem[] = activeStaff.map((staff) => {
      const match = dateRecords.find((a) => a.UserID.trim() === staff.UserID.trim());
      if (match) {
        if (match.Status === 'Present') presentCount++;
        else if (match.Status === 'Absent') absentCount++;

        return {
          userId: staff.UserID.trim(),
          fullName: staff.FullName.trim(),
          email: staff.Email.trim(),
          role: staff.Role,
          attendanceId: match.AttendanceID,
          status: match.Status as ValidAttendanceStatus,
          markedBy: match.MarkedBy,
          updatedAt: match.UpdatedAt,
        };
      }

      notMarkedCount++;
      return {
        userId: staff.UserID.trim(),
        fullName: staff.FullName.trim(),
        email: staff.Email.trim(),
        role: staff.Role,
        status: 'Not Marked',
      };
    });

    return {
      date: dateStr,
      isSunday,
      isHoliday: Boolean(holidayMatch),
      holidayName: holidayMatch?.HolidayName,
      totalStaff: activeStaff.length,
      presentCount,
      absentCount,
      notMarkedCount,
      staffAttendance,
    };
  }

  /**
   * Save or correct daily attendance records for one or more staff members.
   * Enforces: at most 1 attendance record per employee per date.
   */
  public async markDailyAttendance(
    dateStr: string,
    entries: Array<{ userId: string; status: ValidAttendanceStatus | 'Not Marked' }>,
    markedByUserId: string
  ): Promise<{ savedCount: number; records: AttendanceRow[] }> {
    const dateVal = validateDate(dateStr, 'AttendanceDate');
    if (!dateVal.isValid) {
      throw new Error(dateVal.errors.join(' '));
    }

    if (!entries || entries.length === 0) {
      throw new Error('No attendance entries submitted.');
    }

    const allUsers = await userService.getAllUsers();
    const allAttendance = await this.getAllAttendance();
    const now = new Date().toISOString();
    const updatedOrCreated: AttendanceRow[] = [];
    const newRecordsToAppend: AttendanceRow[] = [];
    const newRowsToAppend: any[][] = [];
    const rangesToBatchUpdate: Array<{ range: string; values: any[][] }> = [];
    const rowIndicesToDelete: number[] = [];

    for (const entry of entries) {
      if (entry.status !== 'Not Marked') {
        const statusVal = validateAttendanceStatus(entry.status);
        if (!statusVal.isValid) {
          throw new Error(`Invalid status for user ${entry.userId}: ${statusVal.errors.join(' ')}`);
        }
      }

      const userExists = allUsers.find((u) => u.UserID.trim() === entry.userId.trim());
      if (!userExists) {
        throw new Error(`Referenced UserID '${entry.userId}' does not exist.`);
      }

      // Check for existing record for this user and date
      const existingIdx = allAttendance.findIndex(
        (a) => a.UserID.trim() === entry.userId.trim() && a.AttendanceDate.trim() === dateStr.trim()
      );

      // Handle unmarking / resetting to 'Not Marked'
      if (entry.status === 'Not Marked') {
        if (existingIdx !== -1) {
          const prevRecord = allAttendance[existingIdx];
          const prevSnapshot = JSON.stringify(prevRecord);

          if (googleSheetsService.isLiveApiEnabled()) {
            const actualRow = await googleSheetsService.findRowIndexByColumnValue(
              SHEET_NAMES.ATTENDANCE,
              'A',
              prevRecord.AttendanceID
            );
            if (actualRow !== -1) {
              rowIndicesToDelete.push(actualRow);
            }
          } else {
            this.mockAttendance.splice(existingIdx, 1);
          }
          allAttendance.splice(existingIdx, 1);

          await activityLogService.logActivity({
            performedBy: markedByUserId,
            action: 'ATTENDANCE_CORRECTED',
            entityType: 'Attendance',
            entityID: prevRecord.AttendanceID,
            previousValue: prevSnapshot,
            newValue: JSON.stringify({ status: 'Not Marked' }),
            reason: `Attendance cleared and reset to Not Marked for ${userExists.FullName} on ${dateStr}`,
          });

          updatedOrCreated.push({
            ...prevRecord,
            Status: 'Not Marked' as any,
          });
        }
        continue;
      }

      if (existingIdx !== -1) {
        // Correction of existing record
        const prevRecord = allAttendance[existingIdx];
        const prevSnapshot = JSON.stringify(prevRecord);

        prevRecord.Status = entry.status;
        prevRecord.MarkedBy = markedByUserId;
        prevRecord.UpdatedAt = now;

        if (googleSheetsService.isLiveApiEnabled()) {
          const actualRow = await googleSheetsService.findRowIndexByColumnValue(
            SHEET_NAMES.ATTENDANCE,
            'A',
            prevRecord.AttendanceID
          );
          const sheetRowIndex = actualRow !== -1 ? actualRow : existingIdx + 2;
          rangesToBatchUpdate.push({
            range: `${SHEET_NAMES.ATTENDANCE}!A${sheetRowIndex}:G${sheetRowIndex}`,
            values: [
              [
                prevRecord.AttendanceID,
                prevRecord.UserID,
                prevRecord.AttendanceDate,
                prevRecord.Status,
                prevRecord.MarkedBy,
                prevRecord.CreatedAt,
                prevRecord.UpdatedAt,
              ],
            ],
          });
        } else {
          this.mockAttendance[existingIdx] = prevRecord;
        }

        await activityLogService.logActivity({
          performedBy: markedByUserId,
          action: 'ATTENDANCE_CORRECTED',
          entityType: 'Attendance',
          entityID: prevRecord.AttendanceID,
          previousValue: prevSnapshot,
          newValue: JSON.stringify(prevRecord),
          reason: `Attendance status updated to ${entry.status} on ${dateStr}`,
        });

        updatedOrCreated.push(prevRecord);
      } else {
        // Create new record
        const newRecord: AttendanceRow = {
          AttendanceID: `ATT-${dateStr.replace(/-/g, '')}-${entry.userId}-${Math.floor(Math.random() * 1000)}`,
          UserID: entry.userId.trim(),
          AttendanceDate: dateStr.trim(),
          Status: entry.status,
          MarkedBy: markedByUserId,
          CreatedAt: now,
          UpdatedAt: now,
        };

        newRecordsToAppend.push(newRecord);
        newRowsToAppend.push([
          newRecord.AttendanceID,
          newRecord.UserID,
          newRecord.AttendanceDate,
          newRecord.Status,
          newRecord.MarkedBy,
          newRecord.CreatedAt,
          newRecord.UpdatedAt,
        ]);

        allAttendance.push(newRecord);

        await activityLogService.logActivity({
          performedBy: markedByUserId,
          action: 'ATTENDANCE_MARKED',
          entityType: 'Attendance',
          entityID: newRecord.AttendanceID,
          newValue: JSON.stringify(newRecord),
          reason: `Marked ${entry.status} for ${userExists.FullName} on ${dateStr}`,
        });

        updatedOrCreated.push(newRecord);
      }
    }

    // Execute batch deletions safely in descending order
    if (rowIndicesToDelete.length > 0 && googleSheetsService.isLiveApiEnabled()) {
      await googleSheetsService.deleteSheetRows(SHEET_NAMES.ATTENDANCE, rowIndicesToDelete);
    }

    // Execute batch range updates in a single API call
    if (rangesToBatchUpdate.length > 0 && googleSheetsService.isLiveApiEnabled()) {
      await googleSheetsService.batchUpdateSheetRanges(rangesToBatchUpdate);
    }

    // Batch append all new records in a single Google Sheets API call
    if (newRowsToAppend.length > 0) {
      if (googleSheetsService.isLiveApiEnabled()) {
        await googleSheetsService.appendSheetRows(SHEET_NAMES.ATTENDANCE, newRowsToAppend);
      } else {
        this.mockAttendance.push(...newRecordsToAppend);
      }
    }

    return {
      savedCount: updatedOrCreated.length,
      records: updatedOrCreated,
    };
  }

  /**
   * Monthly attendance summary for a staff member.
   * Sundays and Institute Holidays are NOT counted as ordinary absences!
   */
  public async getMonthlyAttendanceSummary(
    userId: string,
    year: number,
    month: number
  ): Promise<MonthlyAttendanceSummary> {
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

    const allAttendance = await this.getAllAttendance();
    const userRecords = allAttendance.filter(
      (a) => a.UserID.trim() === userId.trim() && a.AttendanceDate.startsWith(monthPrefix)
    );

    const holidays = await holidayService.getHolidaysByYear(year);
    const holidayMap = new Map<string, string>();
    holidays.forEach((h) => holidayMap.set(h.HolidayDate.trim(), h.HolidayName));

    let userLeaves: any[] = [];
    try {
      const { leaveService } = await import('./leave.service.js');
      const all = await leaveService.getUserRequests(userId);
      userLeaves = all.filter((r) => r.Status !== 'Withdrawn' && r.Status !== 'Cancelled');
    } catch {
      userLeaves = [];
    }

    let presentCount = 0;
    let absentCount = 0;
    let notMarkedCount = 0;
    let totalSundays = 0;
    let totalHolidays = 0;
    let totalWorkingDays = 0;
    let specialLeaveCount = 0;

    const records = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
      const isSunday = holidayService.isSunday(dateStr);
      const isHoliday = holidayMap.has(dateStr);
      const holidayName = holidayMap.get(dateStr);

      if (isSunday) totalSundays++;
      if (isHoliday) totalHolidays++;
      if (!isSunday && !isHoliday) totalWorkingDays++;

      const match = userRecords.find((a) => a.AttendanceDate.trim() === dateStr);
      let status: ValidAttendanceStatus | 'Not Marked' = 'Not Marked';

      if (match) {
        status = match.Status as ValidAttendanceStatus;
        if (status === 'Present') presentCount++;
        else if (status === 'Absent') absentCount++;
      } else {
        notMarkedCount++;
      }

      // Check leave requests for this date
      const leaveMatch = userLeaves.find(
        (l) => l.StartDate && l.EndDate && l.StartDate.trim() <= dateStr && l.EndDate.trim() >= dateStr
      );
      const isLeave = Boolean(leaveMatch);
      const leaveType = leaveMatch?.LeaveType;
      const leaveRequestId = leaveMatch?.LeaveRequestID;
      const isSpecialLeave = Boolean(leaveType && leaveType.toLowerCase().includes('special'));

      if (isSpecialLeave && !isSunday && !isHoliday && status === 'Present') {
        specialLeaveCount++;
      }

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayOfWeek = dayNames[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];

      records.push({
        date: dateStr,
        dayOfWeek,
        isSunday,
        isHoliday,
        holidayName,
        status,
        markedBy: match?.MarkedBy,
        isLeave,
        leaveType,
        leaveRequestId,
        isSpecialLeave,
      });
    }

    const recordedDays = presentCount + absentCount;
    const attendanceRate = totalWorkingDays > 0
      ? Math.min(100, Math.round((presentCount / totalWorkingDays) * 100))
      : recordedDays > 0
      ? Math.min(100, Math.round((presentCount / recordedDays) * 100))
      : 100;

    return {
      userId,
      year,
      month,
      totalCalendarDays: daysInMonth,
      totalWorkingDays,
      totalSundays,
      totalHolidays,
      presentCount,
      absentCount,
      notMarkedCount,
      specialLeaveCount,
      attendanceRate,
      records,
    };
  }

  /**
   * Get employee attendance history (filterable by date range).
   */
  public async getEmployeeAttendanceHistory(
    userId: string,
    startDate?: string,
    endDate?: string
  ): Promise<AttendanceRow[]> {
    const all = await this.getAllAttendance();
    return all.filter((a) => {
      if (a.UserID.trim() !== userId.trim()) return false;
      if (startDate && a.AttendanceDate < startDate) return false;
      if (endDate && a.AttendanceDate > endDate) return false;
      return true;
    }).sort((a, b) => b.AttendanceDate.localeCompare(a.AttendanceDate));
  }

  /**
   * Institute-wide Date Range Attendance Report:
   * Aggregates working days, present, absent, not marked, sundays, and holidays for all active staff
   * across any arbitrary date range (e.g. single month, 2-3 months, quarter, or annual).
   * Sundays and holidays are never counted as working-day absences.
   * Not Marked is kept distinct from Absent.
   */
  public async getInstituteAttendanceRangeReport(
    startDate: string,
    endDate: string,
    periodTitle?: string,
    reportType: 'monthly' | 'multi' | 'annual' | 'custom' = 'custom'
  ): Promise<InstituteMonthlyAttendanceReport> {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      throw new Error(`Invalid date range format (${startDate} - ${endDate}). Expected YYYY-MM-DD.`);
    }
    if (startDate > endDate) {
      throw new Error(`Start date '${startDate}' must not be after end date '${endDate}'.`);
    }

    const [startY, startM, startD] = startDate.split('-').map(Number);
    const [endY, endM, endD] = endDate.split('-').map(Number);

    const startUtc = Date.UTC(startY, startM - 1, startD);
    const endUtc = Date.UTC(endY, endM - 1, endD);

    const dates: string[] = [];
    let curUtc = startUtc;
    while (curUtc <= endUtc) {
      const curDate = new Date(curUtc);
      dates.push(curDate.toISOString().slice(0, 10));
      curUtc += 86400000;
    }

    const uniqueYears: number[] = [];
    for (let y = startY; y <= endY; y++) {
      uniqueYears.push(y);
    }

    const [allUsers, allAttendance, ...holidayLists] = await Promise.all([
      userService.getAllUsers(),
      this.getAllAttendance(),
      ...uniqueYears.map((y) => holidayService.getHolidaysByYear(y)),
    ]);

    const holidayMap = new Set<string>();
    for (const arr of holidayLists) {
      for (const h of arr) {
        holidayMap.add(h.HolidayDate.trim());
      }
    }

    let rangeWorkingDays = 0;
    let rangeSundays = 0;
    let rangeHolidays = 0;

    for (const d of dates) {
      const isSun = holidayService.isSunday(d);
      const isHol = holidayMap.has(d);
      if (isSun) rangeSundays++;
      if (isHol) rangeHolidays++;
      if (!isSun && !isHol) rangeWorkingDays++;
    }

    const activeStaff = allUsers
      .filter((u) => userService.parseIsActive(u.IsActive) && u.Role === 'Staff')
      .sort((a, b) => a.FullName.localeCompare(b.FullName));

    // Map: `${userId}|${dateStr}` -> status
    const userDateStatusMap = new Map<string, ValidAttendanceStatus>();
    for (const a of allAttendance) {
      const d = a.AttendanceDate.trim();
      if (d >= startDate && d <= endDate) {
        userDateStatusMap.set(`${a.UserID.trim().toLowerCase()}|${d}`, a.Status as ValidAttendanceStatus);
      }
    }

    let totalPresent = 0;
    let totalAbsent = 0;
    let totalNotMarked = 0;

    const employeeSummaries = [];

    for (const staff of activeStaff) {
      const uKey = staff.UserID.trim().toLowerCase();
      let presentCount = 0;
      let absentCount = 0;
      let notMarkedCount = 0;

      for (const d of dates) {
        const status = userDateStatusMap.get(`${uKey}|${d}`);
        if (status === 'Present') presentCount++;
        else if (status === 'Absent') absentCount++;
        else notMarkedCount++;
      }

      totalPresent += presentCount;
      totalAbsent += absentCount;
      totalNotMarked += notMarkedCount;

      const rate = rangeWorkingDays > 0
        ? Math.round((presentCount / rangeWorkingDays) * 10000) / 100
        : 0;

      employeeSummaries.push({
        userId: staff.UserID,
        fullName: staff.FullName,
        email: staff.Email,
        role: staff.Role,
        joiningDate: staff.JoiningDate || '',
        workingDays: rangeWorkingDays,
        presentCount,
        absentCount,
        notMarkedCount,
        sundaysCount: rangeSundays,
        holidaysCount: rangeHolidays,
        attendanceRate: rate,
      });
    }

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const isSingleMonth = startY === endY && startM === endM;

    return {
      year: isSingleMonth ? startY : (startY === endY ? startY : undefined),
      month: isSingleMonth ? startM : undefined,
      monthName: isSingleMonth ? monthNames[startM - 1] : undefined,
      startDate,
      endDate,
      periodTitle: periodTitle || (isSingleMonth ? `${monthNames[startM - 1]} ${startY}` : `${startDate} to ${endDate}`),
      reportType,
      totalEmployees: activeStaff.length,
      totalCalendarDays: dates.length,
      totalWorkingDays: rangeWorkingDays,
      totalSundays: rangeSundays,
      totalHolidays: rangeHolidays,
      overallTotals: {
        totalWorkingDays: rangeWorkingDays,
        totalPresent,
        totalAbsent,
        totalNotMarked,
        totalSundays: rangeSundays,
        totalHolidays: rangeHolidays,
      },
      employeeSummaries,
    };
  }

  /**
   * Institute-wide Monthly Attendance Report:
   * Aggregates working days, present, absent, not marked, sundays, and holidays for all active staff.
   * Sundays and holidays are never counted as working-day absences.
   * Not Marked is kept distinct from Absent.
   */
  public async getInstituteMonthlyAttendanceReport(
    year: number,
    month: number
  ): Promise<InstituteMonthlyAttendanceReport> {
    if (isNaN(year) || year < 2000 || year > 2100) {
      throw new Error(`Invalid year '${year}'. Must be between 2000 and 2100.`);
    }
    if (isNaN(month) || month < 1 || month > 12) {
      throw new Error(`Invalid month '${month}'. Must be between 1 and 12.`);
    }

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[month - 1];
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    return this.getInstituteAttendanceRangeReport(
      startDate,
      endDate,
      `${monthName} ${year}`,
      'monthly'
    );
  }
}

export const attendanceService = new AttendanceService();
