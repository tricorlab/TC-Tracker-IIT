import { googleSheetsService } from './googleSheets.service.js';
import { SHEET_NAMES } from '../config/sheets.config.js';
import { HolidayRow } from '../types/database.types.js';
import { activityLogService } from './activityLog.service.js';
import { validateDate } from '../validation/sheetValidators.js';

export class HolidayService {
  private mockHolidays: HolidayRow[] = [];

  public clearMockHolidays(): void {
    this.mockHolidays = [];
  }

  public setMockHolidays(holidays: HolidayRow[]): void {
    this.mockHolidays = [...holidays];
  }

  /**
   * Fetch all holidays from Google Sheets or mock store, sorted chronologically.
   */
  public async getAllHolidays(): Promise<HolidayRow[]> {
    if (googleSheetsService.isLiveApiEnabled()) {
      try {
        const records = await googleSheetsService.getSheetRecords<HolidayRow>(SHEET_NAMES.HOLIDAYS);
        return records.sort((a, b) => a.HolidayDate.localeCompare(b.HolidayDate));
      } catch (err: any) {
        console.error('[HolidayService Error] Failed to fetch holidays:', err.message);
        throw new Error(`Database error: Failed to fetch holidays: ${err.message}`);
      }
    }
    return [...this.mockHolidays].sort((a, b) => a.HolidayDate.localeCompare(b.HolidayDate));
  }

  /**
   * Get holidays for a specific calendar year.
   */
  public async getHolidaysByYear(year: number): Promise<HolidayRow[]> {
    const all = await this.getAllHolidays();
    return all.filter((h) => h.HolidayDate.startsWith(`${year}-`));
  }

  /**
   * Check if a specific calendar date (YYYY-MM-DD) is an institute holiday.
   */
  public async isHoliday(dateStr: string): Promise<boolean> {
    const all = await this.getAllHolidays();
    return all.some((h) => h.HolidayDate.trim() === dateStr.trim());
  }

  /**
   * Check if a date string is a Sunday.
   * Format: YYYY-MM-DD
   */
  public isSunday(dateStr: string): boolean {
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    return dateObj.getUTCDay() === 0;
  }

  /**
   * Add a new holiday. Prevents duplicate holiday dates.
   */
  public async createHoliday(data: {
    holidayName: string;
    holidayDate: string;
    description?: string;
    createdBy: string;
  }): Promise<HolidayRow> {
    const nameTrimmed = (data.holidayName || '').trim();
    const dateTrimmed = (data.holidayDate || '').trim();

    if (!nameTrimmed) {
      throw new Error('Holiday name is required.');
    }

    const dateVal = validateDate(dateTrimmed, 'HolidayDate');
    if (!dateVal.isValid) {
      throw new Error(dateVal.errors.join(' '));
    }

    const all = await this.getAllHolidays();
    const exists = all.some((h) => h.HolidayDate.trim() === dateTrimmed);
    if (exists) {
      throw new Error(`A holiday is already scheduled on '${dateTrimmed}'. Duplicate holiday dates are not permitted.`);
    }

    const now = new Date().toISOString();
    const newHoliday: HolidayRow = {
      HolidayID: `HOL-${dateTrimmed.replace(/-/g, '')}-${Math.floor(Math.random() * 1000)}`,
      HolidayName: nameTrimmed,
      HolidayDate: dateTrimmed,
      Description: (data.description || '').trim(),
      CreatedBy: data.createdBy,
      CreatedAt: now,
      UpdatedAt: now,
    };

    if (googleSheetsService.isLiveApiEnabled()) {
      await googleSheetsService.appendSheetRow(SHEET_NAMES.HOLIDAYS, [
        newHoliday.HolidayID,
        newHoliday.HolidayName,
        newHoliday.HolidayDate,
        newHoliday.Description,
        newHoliday.CreatedBy,
        newHoliday.CreatedAt,
        newHoliday.UpdatedAt,
      ]);
    } else {
      this.mockHolidays.push(newHoliday);
    }

    await activityLogService.logActivity({
      performedBy: data.createdBy,
      action: 'HOLIDAY_CREATED',
      entityType: 'Holiday',
      entityID: newHoliday.HolidayID,
      newValue: JSON.stringify({ name: newHoliday.HolidayName, date: newHoliday.HolidayDate }),
      reason: `Declared holiday: ${newHoliday.HolidayName}`,
    });

    return newHoliday;
  }

  /**
   * Update an existing holiday.
   */
  public async updateHoliday(
    holidayId: string,
    updates: { holidayName?: string; holidayDate?: string; description?: string },
    updatedBy: string
  ): Promise<HolidayRow> {
    const all = await this.getAllHolidays();
    const holidayIndex = all.findIndex((h) => h.HolidayID === holidayId);

    if (holidayIndex === -1) {
      throw new Error(`Holiday with ID '${holidayId}' not found.`);
    }

    const existing = all[holidayIndex];
    const prevSnapshot = JSON.stringify(existing);

    if (updates.holidayDate && updates.holidayDate !== existing.HolidayDate) {
      const dateVal = validateDate(updates.holidayDate, 'HolidayDate');
      if (!dateVal.isValid) {
        throw new Error(dateVal.errors.join(' '));
      }
      const duplicate = all.some(
        (h) => h.HolidayID !== holidayId && h.HolidayDate.trim() === updates.holidayDate!.trim()
      );
      if (duplicate) {
        throw new Error(`Another holiday is already scheduled on '${updates.holidayDate}'.`);
      }
      existing.HolidayDate = updates.holidayDate.trim();
    }

    if (updates.holidayName !== undefined) {
      existing.HolidayName = updates.holidayName.trim();
    }

    if (updates.description !== undefined) {
      existing.Description = updates.description.trim();
    }

    existing.UpdatedAt = new Date().toISOString();

    if (googleSheetsService.isLiveApiEnabled()) {
      // Find true unsorted physical row index in Google Sheets
      const rawRecords = await googleSheetsService.getSheetRecords<HolidayRow>(SHEET_NAMES.HOLIDAYS);
      const rawIdx = rawRecords.findIndex((h) => (h.HolidayID || '').trim() === holidayId.trim());
      if (rawIdx !== -1) {
        const sheetRowIndex = rawIdx + 2;
        await googleSheetsService.updateSheetRange(`${SHEET_NAMES.HOLIDAYS}!A${sheetRowIndex}:G${sheetRowIndex}`, [
          [
            existing.HolidayID,
            existing.HolidayName,
            existing.HolidayDate,
            existing.Description,
            existing.CreatedBy,
            existing.CreatedAt,
            existing.UpdatedAt,
          ],
        ]);
      }
    } else {
      this.mockHolidays[holidayIndex] = existing;
    }

    await activityLogService.logActivity({
      performedBy: updatedBy,
      action: 'HOLIDAY_UPDATED',
      entityType: 'Holiday',
      entityID: existing.HolidayID,
      previousValue: prevSnapshot,
      newValue: JSON.stringify(existing),
      reason: `Updated holiday details for ${existing.HolidayName}`,
    });

    return existing;
  }

  /**
   * Delete an existing holiday.
   */
  public async deleteHoliday(holidayId: string, deletedBy: string): Promise<void> {
    const all = await this.getAllHolidays();
    const holiday = all.find((h) => h.HolidayID === holidayId);

    if (!holiday) {
      throw new Error(`Holiday with ID '${holidayId}' not found.`);
    }

    if (googleSheetsService.isLiveApiEnabled()) {
      const remaining = all.filter((h) => h.HolidayID !== holidayId);
      // Re-write all rows after header
      const rows = remaining.map((h) => [
        h.HolidayID,
        h.HolidayName,
        h.HolidayDate,
        h.Description,
        h.CreatedBy,
        h.CreatedAt,
        h.UpdatedAt,
      ]);
      // Clear and rewrite range
      const blankPad = Array(all.length).fill(Array(7).fill(''));
      await googleSheetsService.updateSheetRange(`${SHEET_NAMES.HOLIDAYS}!A2:G${all.length + 1}`, blankPad);
      if (rows.length > 0) {
        await googleSheetsService.updateSheetRange(`${SHEET_NAMES.HOLIDAYS}!A2:G${rows.length + 1}`, rows);
      }
    } else {
      this.mockHolidays = this.mockHolidays.filter((h) => h.HolidayID !== holidayId);
    }

    await activityLogService.logActivity({
      performedBy: deletedBy,
      action: 'HOLIDAY_DELETED',
      entityType: 'Holiday',
      entityID: holidayId,
      previousValue: JSON.stringify(holiday),
      reason: `Deleted holiday: ${holiday.HolidayName} (${holiday.HolidayDate})`,
    });
  }
}

export const holidayService = new HolidayService();
