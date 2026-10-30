/**
 * Configuration for Google Sheets worksheet names.
 * These represent the planned sheets in the TC Tracker Google Spreadsheet.
 * Final worksheet schemas will be defined in Phase 2.
 */
export const SHEET_NAMES = {
  USERS: 'Users',
  ATTENDANCE: 'Attendance',
  LEAVES: 'Leaves',
  SETTINGS: 'Settings',
} as const;

export type SheetName = (typeof SHEET_NAMES)[keyof typeof SHEET_NAMES];
