/**
 * Google Sheets Database Worksheet Names & Schema Definitions
 * TC Tracker - Phase 2: Database Design
 */

export const SHEET_NAMES = {
  USERS: 'Users',
  ATTENDANCE: 'Attendance',
  LEAVE_REQUESTS: 'LeaveRequests',
  HOLIDAYS: 'Holidays',
  LEAVE_BALANCES: 'LeaveBalances',
  LEAVE_POLICY: 'LeavePolicy',
  ACTIVITY_LOGS: 'ActivityLogs',
  EMAIL_LOGS: 'EmailLogs',
} as const;

export type SheetName = (typeof SHEET_NAMES)[keyof typeof SHEET_NAMES];

export const SHEET_SCHEMAS: Record<SheetName, readonly string[]> = {
  [SHEET_NAMES.USERS]: [
    'UserID',
    'FullName',
    'Email',
    'Role',
    'JoiningDate',
    'IsActive',
    'CreatedAt',
    'UpdatedAt',
  ],
  [SHEET_NAMES.ATTENDANCE]: [
    'AttendanceID',
    'UserID',
    'AttendanceDate',
    'Status',
    'MarkedBy',
    'CreatedAt',
    'UpdatedAt',
  ],
  [SHEET_NAMES.LEAVE_REQUESTS]: [
    'LeaveRequestID',
    'UserID',
    'LeaveType',
    'StartDate',
    'EndDate',
    'CalculatedDays',
    'Reason',
    'Remarks',
    'SubmittedAt',
    'NotificationStatus',
  ],
  [SHEET_NAMES.HOLIDAYS]: [
    'HolidayID',
    'HolidayName',
    'HolidayDate',
    'Description',
    'CreatedBy',
    'CreatedAt',
    'UpdatedAt',
  ],
  [SHEET_NAMES.LEAVE_BALANCES]: [
    'LeaveBalanceID',
    'UserID',
    'CalendarYear',
    'EarnedLeave',
    'CarriedForward',
    'UsedLeave',
    'AvailableLeave',
    'UpdatedAt',
  ],
  [SHEET_NAMES.LEAVE_POLICY]: [
    'PolicyID',
    'MonthlyAccrual',
    'CarryForwardPercentage',
    'CarryForwardDate',
    'CarryForwardExpiryDate',
    'MinimumContinuousCalendarDays',
    'WorkingDays',
    'EffectiveFrom',
    'UpdatedAt',
    'UpdatedBy',
  ],
  [SHEET_NAMES.ACTIVITY_LOGS]: [
    'LogID',
    'PerformedBy',
    'Action',
    'EntityType',
    'EntityID',
    'PreviousValue',
    'NewValue',
    'Reason',
    'Timestamp',
  ],
  [SHEET_NAMES.EMAIL_LOGS]: [
    'EmailLogID',
    'RelatedLeaveRequestID',
    'RecipientEmail',
    'DeliveryStatus',
    'ErrorMessage',
    'AttemptedAt',
    'SentAt',
  ],
} as const;

export const VALID_ROLES = ['Staff', 'Manager', 'Admin'] as const;
export type ValidRole = (typeof VALID_ROLES)[number];

export const VALID_ATTENDANCE_STATUSES = ['Present', 'Absent'] as const;
export type ValidAttendanceStatus = (typeof VALID_ATTENDANCE_STATUSES)[number];

export const VALID_NOTIFICATION_STATUSES = ['Pending', 'Sent', 'Failed'] as const;
export type ValidNotificationStatus = (typeof VALID_NOTIFICATION_STATUSES)[number];
