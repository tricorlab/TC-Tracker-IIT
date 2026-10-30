import { ValidRole, ValidAttendanceStatus, ValidNotificationStatus } from '../config/sheets.config.js';

export interface UserRow {
  UserID: string;
  FullName: string;
  Email: string;
  Role: ValidRole;
  JoiningDate: string; // ISO YYYY-MM-DD
  IsActive: boolean | string; // Boolean or "TRUE" / "FALSE"
  CreatedAt: string; // ISO 8601
  UpdatedAt: string; // ISO 8601
}

export interface AttendanceRow {
  AttendanceID: string;
  UserID: string;
  AttendanceDate: string; // ISO YYYY-MM-DD
  Status: ValidAttendanceStatus;
  MarkedBy: string; // UserID of Manager/Admin
  CreatedAt: string; // ISO 8601
  UpdatedAt: string; // ISO 8601
}

export interface LeaveRequestRow {
  LeaveRequestID: string;
  UserID: string;
  LeaveType: string;
  StartDate: string; // ISO YYYY-MM-DD
  EndDate: string; // ISO YYYY-MM-DD
  CalculatedDays: number | string; // Decimal representation
  Reason: string;
  Remarks: string;
  SubmittedAt: string; // ISO 8601
  NotificationStatus: ValidNotificationStatus;
}

export interface HolidayRow {
  HolidayID: string;
  HolidayName: string;
  HolidayDate: string; // ISO YYYY-MM-DD
  Description: string;
  CreatedBy: string; // UserID
  CreatedAt: string; // ISO 8601
  UpdatedAt: string; // ISO 8601
}

export interface LeaveBalanceRow {
  LeaveBalanceID: string;
  UserID: string;
  CalendarYear: number | string; // e.g. 2026
  EarnedLeave: number | string; // Decimal
  CarriedForward: number | string; // Decimal
  UsedLeave: number | string; // Decimal
  AvailableLeave: number | string; // Decimal: EarnedLeave + CarriedForward - UsedLeave
  UpdatedAt: string; // ISO 8601
}

export interface LeavePolicyRow {
  PolicyID: string;
  MonthlyAccrual: number | string; // e.g. 1.50
  CarryForwardPercentage: number | string; // e.g. 50
  CarryForwardDate: string; // e.g. "01-01"
  CarryForwardExpiryDate: string; // e.g. "03-31"
  MinimumContinuousCalendarDays: number | string;
  WorkingDays: string; // e.g. "Monday,Tuesday,Wednesday,Thursday,Friday"
  EffectiveFrom: string; // ISO YYYY-MM-DD
  UpdatedAt: string; // ISO 8601
  UpdatedBy: string; // UserID
}

export interface ActivityLogRow {
  LogID: string;
  PerformedBy: string; // UserID or "SYSTEM"
  Action: string;
  EntityType: string;
  EntityID: string;
  PreviousValue: string; // JSON or stringified value
  NewValue: string; // JSON or stringified value
  Reason: string;
  Timestamp: string; // ISO 8601
}

export interface EmailLogRow {
  EmailLogID: string;
  RelatedLeaveRequestID: string;
  RecipientEmail: string;
  DeliveryStatus: ValidNotificationStatus;
  ErrorMessage: string;
  AttemptedAt: string; // ISO 8601
  SentAt: string; // ISO 8601 or empty
}
