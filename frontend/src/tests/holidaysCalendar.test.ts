import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CalendarGridCell {
  dateStr: string;
  dayNumber: number;
  monthIndex: number;
  year: number;
  isCurrentMonth: boolean;
  isSunday: boolean;
  isToday: boolean;
  holidays: any[];
}

function generateGoogleCalendarMonth(
  year: number,
  monthIndex: number,
  allHolidays: any[],
  todayStr: string
): CalendarGridCell[] {
  const cells: CalendarGridCell[] = [];

  const daysInCurrentMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const firstDayOfWeek = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();

  const prevMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
  const prevYear = monthIndex === 0 ? year - 1 : year;
  const daysInPrevMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();

  // 1. Previous month leading padding cells
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const dateStr = `${prevYear}-${String(prevMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayOfWeek = new Date(Date.UTC(prevYear, prevMonthIndex, day)).getUTCDay();
    cells.push({
      dateStr,
      dayNumber: day,
      monthIndex: prevMonthIndex,
      year: prevYear,
      isCurrentMonth: false,
      isSunday: dayOfWeek === 0,
      isToday: dateStr === todayStr,
      holidays: allHolidays.filter((h) => h.HolidayDate === dateStr),
    });
  }

  // 2. Current month cells
  for (let day = 1; day <= daysInCurrentMonth; day++) {
    const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayOfWeek = (firstDayOfWeek + day - 1) % 7;
    cells.push({
      dateStr,
      dayNumber: day,
      monthIndex,
      year,
      isCurrentMonth: true,
      isSunday: dayOfWeek === 0,
      isToday: dateStr === todayStr,
      holidays: allHolidays.filter((h) => h.HolidayDate === dateStr),
    });
  }

  // 3. Next month trailing padding cells (ensure full 5 or 6 rows: 35 or 42)
  const targetTotal = cells.length <= 35 ? 35 : 42;
  const nextMonthIndex = monthIndex === 11 ? 0 : monthIndex + 1;
  const nextYear = monthIndex === 11 ? year + 1 : year;

  let nextDay = 1;
  while (cells.length < targetTotal) {
    const dateStr = `${nextYear}-${String(nextMonthIndex + 1).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
    const dayOfWeek = new Date(Date.UTC(nextYear, nextMonthIndex, nextDay)).getUTCDay();
    cells.push({
      dateStr,
      dayNumber: nextDay,
      monthIndex: nextMonthIndex,
      year: nextYear,
      isCurrentMonth: false,
      isSunday: dayOfWeek === 0,
      isToday: dateStr === todayStr,
      holidays: allHolidays.filter((h) => h.HolidayDate === dateStr),
    });
    nextDay++;
  }

  return cells;
}

describe('--- [FRONTEND TEST SUITE] TC Tracker Google Calendar Holidays & UI Integration ---', () => {
  /* ======================================================================= */
  /* 1. Google Calendar Month Grid Algorithm Verification                   */
  /* ======================================================================= */
  describe('1. Google Calendar Month Grid Generator Algorithm', () => {
    it('should generate a 35-cell grid for November 2026 (starts on Sunday)', () => {
      const mockHolidays = [
        { HolidayID: 'H1', HolidayName: 'Diwali', HolidayDate: '2026-11-08' },
        { HolidayID: 'H2', HolidayName: 'Guru Nanak Jayanti', HolidayDate: '2026-11-24' },
      ];
      const cells = generateGoogleCalendarMonth(2026, 10, mockHolidays, '2026-11-13');

      // Total cells must be a multiple of 7 (35 or 42)
      assert.strictEqual(cells.length, 35);

      // First cell is Nov 1, 2026 (Sunday)
      assert.strictEqual(cells[0].dateStr, '2026-11-01');
      assert.strictEqual(cells[0].isSunday, true);
      assert.strictEqual(cells[0].isCurrentMonth, true);

      // Verify today indicator on 2026-11-13
      const todayCell = cells.find((c) => c.dateStr === '2026-11-13');
      assert.ok(todayCell, 'Today cell should exist');
      assert.strictEqual(todayCell.isToday, true);

      // Verify holiday attachment
      const diwaliCell = cells.find((c) => c.dateStr === '2026-11-08');
      assert.ok(diwaliCell);
      assert.strictEqual(diwaliCell.holidays.length, 1);
      assert.strictEqual(diwaliCell.holidays[0].HolidayName, 'Diwali');

      // Verify trailing days are from December
      const trailingDecCell = cells[34];
      assert.strictEqual(trailingDecCell.isCurrentMonth, false);
      assert.strictEqual(trailingDecCell.dateStr, '2026-12-05');
    });

    it('should generate a 42-cell grid for a month requiring 6 rows (e.g. August 2026)', () => {
      const cells = generateGoogleCalendarMonth(2026, 7, [], '2026-08-15');
      assert.strictEqual(cells.length, 42);

      // First cell must be July 26, 2026 (Sunday)
      assert.strictEqual(cells[0].dateStr, '2026-07-26');
      assert.strictEqual(cells[0].isCurrentMonth, false);

      // August 1 is a Saturday (index 6)
      assert.strictEqual(cells[6].dateStr, '2026-08-01');
      assert.strictEqual(cells[6].isCurrentMonth, true);
    });
  });

  /* ======================================================================= */
  /* 2. Source Code & UI Component Verification                             */
  /* ======================================================================= */
  describe('2. HolidaysPage Source Code Verification', () => {
    it('should verify HolidaysPage.tsx implements Google Calendar Month grid, view switchers, and detail modal', () => {
      const filePath = path.resolve(__dirname, '../pages/HolidaysPage.tsx');
      assert.ok(fs.existsSync(filePath), 'HolidaysPage.tsx must exist');
      const content = fs.readFileSync(filePath, 'utf-8');

      // Google Calendar Month View imports & components
      assert.ok(content.includes('LayoutGrid'), 'Must import LayoutGrid icon');
      assert.ok(content.includes('calendarCells'), 'Must calculate calendarCells grid');
      assert.ok(content.includes('DAY_OF_WEEK_NAMES'), 'Must define 7-day week headers (Sun..Sat)');
      assert.ok(content.includes('handleGoToToday'), 'Must support Today quick navigation button');
      assert.ok(content.includes('handlePrevMonth') && content.includes('handleNextMonth'), 'Must support month steppers');
      assert.ok(content.includes('selectedHolidayPreview'), 'Must support Google Calendar event preview modal');
      assert.ok(content.includes('Absence Immunity Guarantee'), 'Must declare non-working day policy guarantee in detail modal');
      assert.ok(content.includes('3-Day Long Weekend'), 'Must indicate 3-day long weekends (Friday/Monday breaks)');
      assert.ok(content.includes('Weekly Off'), 'Must clearly mark Sundays as weekly offs');
    });

    it('should verify DashboardPage.tsx implements 4 distinct metric cards including Accrued & Remaining leaves', () => {
      const filePath = path.resolve(__dirname, '../pages/DashboardPage.tsx');
      assert.ok(fs.existsSync(filePath), 'DashboardPage.tsx must exist');
      const content = fs.readFileSync(filePath, 'utf-8');

      assert.ok(content.includes('Accrued Leaves'), 'Must include Accrued Leaves card');
      assert.ok(content.includes('Remaining Leaves'), 'Must include Remaining Leaves card');
      assert.ok(content.includes('AccrualWave'), 'Must include AccrualWave visual indicator');
      assert.ok(content.includes('RemainingWave'), 'Must include RemainingWave visual indicator');
      assert.ok(content.includes('MONTH_NAMES'), 'Must include dynamic month filter names');
    });

    it('should verify SubmitLeavePage.tsx removed Annual and Sick leave from options', () => {
      const filePath = path.resolve(__dirname, '../pages/SubmitLeavePage.tsx');
      assert.ok(fs.existsSync(filePath), 'SubmitLeavePage.tsx must exist');
      const content = fs.readFileSync(filePath, 'utf-8');

      assert.ok(!content.includes('value="Sick"'), 'Must not have Sick leave option in SubmitLeavePage');
      assert.ok(!content.includes('value="Annual"'), 'Must not have Annual leave option in SubmitLeavePage');
      assert.ok(content.includes('Casual Leave'), 'Must include Casual Leave option');
      assert.ok(content.includes('Maternity / Paternity Leave'), 'Must include Maternity / Paternity Leave');
    });

    it('should verify HolidaysPage.tsx implements extended year selection up to 2036+ with dynamic discovery and steppers', () => {
      const filePath = path.resolve(__dirname, '../pages/HolidaysPage.tsx');
      assert.ok(fs.existsSync(filePath), 'HolidaysPage.tsx must exist');
      const content = fs.readFileSync(filePath, 'utf-8');

      // Verify extended base horizon and dynamic year computation
      assert.ok(content.includes('MAX_BASE_YEAR'), 'Must define extended MAX_BASE_YEAR');
      assert.ok(content.includes('dynamicYearOptions'), 'Must compute dynamicYearOptions');
      assert.ok(content.includes('Previous Year'), 'Must support Previous Year stepper button');
      assert.ok(content.includes('Next Year'), 'Must support Next Year stepper button');
      assert.ok(content.includes('(Current)'), 'Must highlight current active year in dropdown options');
    });
  });
});
