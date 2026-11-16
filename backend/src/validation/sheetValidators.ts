import {
  SHEET_SCHEMAS,
  SheetName,
  VALID_ROLES,
  VALID_ATTENDANCE_STATUSES,
  VALID_NOTIFICATION_STATUSES,
  ValidRole,
  ValidAttendanceStatus,
  ValidNotificationStatus,
} from '../config/sheets.config.js';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate that an ID string is non-empty and well-formed.
 */
export function validateId(id: string, fieldName: string): ValidationResult {
  const errors: string[] = [];
  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    errors.push(`${fieldName} cannot be empty.`);
  }
  return { isValid: errors.length === 0, errors };
}

/**
 * Validate unique UserID against an existing set of IDs.
 */
export function validateUniqueUserId(
  userId: string,
  existingUserIds: string[] = []
): ValidationResult {
  const errors: string[] = [];
  const trimmed = (userId || '').trim();

  if (!trimmed) {
    errors.push('UserID is required.');
  } else if (existingUserIds.includes(trimmed)) {
    errors.push(`UserID '${trimmed}' already exists.`);
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate email format and uniqueness (ignoring case and whitespace).
 */
export function validateEmail(
  email: string,
  existingEmails: string[] = [],
  currentUserId?: string,
  existingUserMapping?: Array<{ userId: string; email: string }>
): ValidationResult {
  const errors: string[] = [];
  const normalized = (email || '').trim().toLowerCase();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!normalized) {
    errors.push('Email is required.');
  } else if (!emailRegex.test(normalized)) {
    errors.push(`Invalid email format: '${email}'.`);
  } else {
    // Uniqueness check
    if (existingUserMapping && currentUserId) {
      const match = existingUserMapping.find(
        (u) => u.email.trim().toLowerCase() === normalized && u.userId !== currentUserId
      );
      if (match) {
        errors.push(`Email '${normalized}' is already registered to another user.`);
      }
    } else {
      const isDuplicate = existingEmails.some(
        (e) => e.trim().toLowerCase() === normalized
      );
      if (isDuplicate) {
        errors.push(`Email '${normalized}' already exists.`);
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate Role must be Staff or Admin.
 */
export function validateRole(role: string): ValidationResult {
  const errors: string[] = [];
  if (!VALID_ROLES.includes(role as ValidRole)) {
    errors.push(
      `Invalid role '${role}'. Must be one of: ${VALID_ROLES.join(', ')}.`
    );
  }
  return { isValid: errors.length === 0, errors };
}

/**
 * Validate Attendance Status must be Present or Absent.
 */
export function validateAttendanceStatus(status: string): ValidationResult {
  const errors: string[] = [];
  if (!VALID_ATTENDANCE_STATUSES.includes(status as ValidAttendanceStatus)) {
    errors.push(
      `Invalid attendance status '${status}'. Must be one of: ${VALID_ATTENDANCE_STATUSES.join(', ')}.`
    );
  }
  return { isValid: errors.length === 0, errors };
}

/**
 * Validate Notification Status must be Pending, Sent, or Failed.
 */
export function validateNotificationStatus(status: string): ValidationResult {
  const errors: string[] = [];
  if (!VALID_NOTIFICATION_STATUSES.includes(status as ValidNotificationStatus)) {
    errors.push(
      `Invalid notification status '${status}'. Must be one of: ${VALID_NOTIFICATION_STATUSES.join(', ')}.`
    );
  }
  return { isValid: errors.length === 0, errors };
}

/**
 * Validate date format (YYYY-MM-DD) and check that it represents a real calendar date.
 */
export function validateDate(dateStr: string, fieldName = 'Date'): ValidationResult {
  const errors: string[] = [];
  const regex = /^\d{4}-\d{2}-\d{2}$/;

  if (!dateStr || !regex.test(dateStr)) {
    errors.push(`${fieldName} '${dateStr}' must be in YYYY-MM-DD format.`);
    return { isValid: false, errors };
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);

  if (
    dateObj.getFullYear() !== year ||
    dateObj.getMonth() !== month - 1 ||
    dateObj.getDate() !== day
  ) {
    errors.push(`${fieldName} '${dateStr}' is not a valid calendar date.`);
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate leave date range: StartDate and EndDate must be valid, and StartDate <= EndDate.
 */
export function validateLeaveDateRange(
  startDate: string,
  endDate: string
): ValidationResult {
  const errors: string[] = [];

  const startVal = validateDate(startDate, 'StartDate');
  const endVal = validateDate(endDate, 'EndDate');

  errors.push(...startVal.errors, ...endVal.errors);

  if (startVal.isValid && endVal.isValid) {
    if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
      errors.push(`StartDate '${startDate}' cannot be after EndDate '${endDate}'.`);
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate decimal numeric value with optional non-negativity constraint.
 */
export function validateDecimal(
  value: number | string,
  fieldName: string,
  allowNegative = false
): ValidationResult {
  const errors: string[] = [];
  const num = typeof value === 'number' ? value : parseFloat(value);

  if (isNaN(num)) {
    errors.push(`${fieldName} must be a valid number.`);
  } else if (!allowNegative && num < 0) {
    errors.push(`${fieldName} cannot be negative (received ${num}).`);
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate that an employee can have at most ONE attendance record per date.
 */
export function validateUniqueAttendance(
  userId: string,
  attendanceDate: string,
  existingRecords: Array<{ userId: string; attendanceDate: string }>
): ValidationResult {
  const errors: string[] = [];
  const trimmedUserId = (userId || '').trim();

  const isDuplicate = existingRecords.some(
    (record) =>
      record.userId.trim() === trimmedUserId &&
      record.attendanceDate.trim() === attendanceDate.trim()
  );

  if (isDuplicate) {
    errors.push(
      `Attendance record already exists for User '${trimmedUserId}' on date '${attendanceDate}'.`
    );
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate that a user has at most ONE yearly leave balance record per calendar year.
 */
export function validateUniqueLeaveBalance(
  userId: string,
  calendarYear: number | string,
  existingBalances: Array<{ userId: string; calendarYear: number | string }>
): ValidationResult {
  const errors: string[] = [];
  const trimmedUserId = (userId || '').trim();
  const yearNum = Number(calendarYear);

  if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
    errors.push(`CalendarYear '${calendarYear}' is invalid.`);
  }

  const isDuplicate = existingBalances.some(
    (b) =>
      b.userId.trim() === trimmedUserId && Number(b.calendarYear) === yearNum
  );

  if (isDuplicate) {
    errors.push(
      `Leave balance already exists for User '${trimmedUserId}' in calendar year ${yearNum}.`
    );
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate foreign key reference to Users sheet.
 */
export function validateUserReference(
  userId: string,
  validUserIds: string[] | Set<string>,
  fieldName = 'UserID'
): ValidationResult {
  const errors: string[] = [];
  const trimmed = (userId || '').trim();
  const set = validUserIds instanceof Set ? validUserIds : new Set(validUserIds);

  if (!trimmed) {
    errors.push(`${fieldName} is required.`);
  } else if (!set.has(trimmed)) {
    errors.push(`Referenced ${fieldName} '${trimmed}' does not exist in Users worksheet.`);
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate worksheet headers against expected schema.
 * Checks for missing expected columns and unexpected extra columns.
 */
export function validateWorksheetHeaders(
  sheetName: SheetName,
  actualHeaders: string[]
): {
  isValid: boolean;
  missingColumns: string[];
  unexpectedColumns: string[];
  expectedColumns: readonly string[];
} {
  const expectedColumns = SHEET_SCHEMAS[sheetName];
  if (!expectedColumns) {
    return {
      isValid: false,
      missingColumns: [],
      unexpectedColumns: [],
      expectedColumns: [],
    };
  }

  const actualClean = actualHeaders.map((h) => (h || '').trim());
  const missingColumns = expectedColumns.filter((col) => !actualClean.includes(col));
  const unexpectedColumns = actualClean.filter(
    (col) => col.length > 0 && !expectedColumns.includes(col)
  );

  return {
    isValid: missingColumns.length === 0,
    missingColumns,
    unexpectedColumns,
    expectedColumns,
  };
}

/**
 * Decimal-safe calculation of available leave:
 * AvailableLeave = EarnedLeave + CarriedForward - UsedLeave
 */
export function calculateAvailableLeave(
  earned: number | string,
  carried: number | string,
  used: number | string
): number {
  const earnedNum = typeof earned === 'number' ? earned : parseFloat(earned || '0');
  const carriedNum = typeof carried === 'number' ? carried : parseFloat(carried || '0');
  const usedNum = typeof used === 'number' ? used : parseFloat(used || '0');

  const result = earnedNum + carriedNum - usedNum;
  return Math.round(result * 100) / 100;
}
