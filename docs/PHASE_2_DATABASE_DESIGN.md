# TC Tracker – Phase 2: Google Sheets Database Design

This document details the Google Sheets database architecture, canonical worksheet schemas, validation rules, concurrency handling, environment setup, and verification results for **TC Tracker**.

---

## 1. Executive Summary & Architecture

TC Tracker uses **Google Sheets** as its primary persistent database via the **Google Sheets API v4**.

```
┌─────────────────────────────────┐           ┌─────────────────────────────────┐
│       Frontend (React SPA)      │           │      Backend (Express API)      │
│  - Never connects directly      │  REST     │  - Centralized Google API Auth  │
│  - No service keys on client    │ ────────> │  - Validates Schemas & Rules    │
│  - Interacts via REST API       │  (JSON)   │  - Google Service Account JWT   │
└─────────────────────────────────┘           └────────────────┬────────────────┘
                                                               │
                                                               │ Google Sheets API v4
                                                               v
                                              ┌─────────────────────────────────┐
                                              │      Google Sheets Database     │
                                              │                                 │
                                              │  Worksheets:                    │
                                              │  1. Users                       │
                                              │  2. Attendance                  │
                                              │  3. LeaveRequests               │
                                              │  4. Holidays                    │
                                              │  5. LeaveBalances               │
                                              │  6. LeavePolicy                 │
                                              │  7. ActivityLogs                │
                                              │  8. EmailLogs                   │
                                              └─────────────────────────────────┘
```

> **Strict Non-Relational / No-ORM Enforcement:**
> Firebase is **NOT** used. PostgreSQL is **NOT** used. Prisma ORM is **NOT** used. MongoDB is **NOT** used. All persistence and reporting leverage the 8 Google Sheets worksheets defined below.

---

## 2. Worksheet Schemas & Column Definitions

### 2.1 Worksheet 1: `Users`
Stores employee profiles and system roles. No passwords or secrets are stored here.

| Column | Type | Constraints / Rules | Description |
|---|---|---|---|
| `UserID` | String | Unique, Immutable, Required | Primary identifier (e.g. `USR-1001`) |
| `FullName` | String | Required | Full employee name |
| `Email` | String | Unique, Trimmed, Lowercase | Corporate email address |
| `Role` | Enum | `'Staff'`, `'Manager'`, `'Admin'` | Assigned application role |
| `JoiningDate` | Date | ISO `YYYY-MM-DD`, Required for active | Official joining date |
| `IsActive` | Boolean | `TRUE` or `FALSE` | Active employment status |
| `CreatedAt` | DateTime | ISO 8601 (`YYYY-MM-DDTHH:mm:ss.sssZ`) | Record creation timestamp |
| `UpdatedAt` | DateTime | ISO 8601 | Record last update timestamp |

### 2.2 Worksheet 2: `Attendance`
Tracks daily attendance marked by authorized Managers or Admins.

| Column | Type | Constraints / Rules | Description |
|---|---|---|---|
| `AttendanceID` | String | Unique, Immutable | Primary identifier (e.g. `ATT-2026-1001`) |
| `UserID` | String | References `Users.UserID` | Target employee |
| `AttendanceDate`| Date | ISO `YYYY-MM-DD` | Calendar date of attendance |
| `Status` | Enum | `'Present'` or `'Absent'` | Saved attendance state |
| `MarkedBy` | String | References `Users.UserID` | Manager or Admin who marked attendance |
| `CreatedAt` | DateTime | ISO 8601 | Record creation timestamp |
| `UpdatedAt` | DateTime | ISO 8601 | Record last update timestamp |

> **Unmarked Employee Rule:**
> If an employee has no row in the `Attendance` worksheet for a given date, the application computes and displays their status dynamically as **Not Marked**. At most one attendance record may exist per user per calendar date.

### 2.3 Worksheet 3: `LeaveRequests`
Stores employee leave submissions. Leave requests are **informational only**.

| Column | Type | Constraints / Rules | Description |
|---|---|---|---|
| `LeaveRequestID` | String | Unique, Immutable | Primary identifier (e.g. `LRQ-1001`) |
| `UserID` | String | References `Users.UserID` | Submitting employee |
| `LeaveType` | String | Required (e.g. `Annual`, `Casual`, `Sick`) | Type of leave |
| `StartDate` | Date | ISO `YYYY-MM-DD` | First day of leave |
| `EndDate` | Date | ISO `YYYY-MM-DD` (`StartDate <= EndDate`) | Final day of leave |
| `CalculatedDays` | Decimal | Numeric, Positive (e.g. `1.0`, `0.5`, `3.5`)| Total business/calendar days requested |
| `Reason` | String | Required | Stated reason for leave |
| `Remarks` | String | Optional | Supplementary notes |
| `SubmittedAt` | DateTime | ISO 8601 | Submission timestamp |
| `NotificationStatus` | Enum | `'Pending'`, `'Sent'`, `'Failed'` | Email notification delivery status only |

> **Important Strict Rules:**
> - `NotificationStatus` tracks **only** email delivery. It **never** represents approval or rejection.
> - There are **NO** approval or rejection columns.
> - Submitting a request does not automatically deduct leave balances.
> - There is **NO** Loss of Pay (LOP) calculation.

### 2.4 Worksheet 4: `Holidays`
Stores declared organization holidays.

| Column | Type | Constraints / Rules | Description |
|---|---|---|---|
| `HolidayID` | String | Unique, Immutable | Identifier (e.g. `HOL-2026-01`) |
| `HolidayName` | String | Required | Descriptive holiday name |
| `HolidayDate` | Date | ISO `YYYY-MM-DD`, Unique | Date of holiday (no duplicate dates allowed) |
| `Description` | String | Optional | Details / observance notes |
| `CreatedBy` | String | References `Users.UserID` | Manager/Admin who declared the holiday |
| `CreatedAt` | DateTime | ISO 8601 | Record creation timestamp |
| `UpdatedAt` | DateTime | ISO 8601 | Record last update timestamp |

### 2.5 Worksheet 5: `LeaveBalances`
Maintains annual leave balances for employees. Exactly one record per user per calendar year.

| Column | Type | Constraints / Rules | Description |
|---|---|---|---|
| `LeaveBalanceID` | String | Unique, Immutable | Identifier (e.g. `BAL-2026-USR1001`) |
| `UserID` | String | References `Users.UserID` | Target employee |
| `CalendarYear` | Integer | Valid year (e.g. `2026`) | Active calendar year |
| `EarnedLeave` | Decimal | Non-negative (e.g. `12.00`) | Accrued leave days |
| `CarriedForward`| Decimal | Non-negative (e.g. `3.00`) | Leave carried over from previous year |
| `UsedLeave` | Decimal | Non-negative (e.g. `2.00`) | Actual approved/utilized leave |
| `AvailableLeave`| Decimal | Calculated (`Earned + Carried - Used`) | Total available balance |
| `UpdatedAt` | DateTime | ISO 8601 | Record last update timestamp |

> **Balance Calculation Formula:**
> $$\text{AvailableLeave} = \text{round}((\text{EarnedLeave} + \text{CarriedForward} - \text{UsedLeave}), 2)$$
> - Pending informational leave requests are **never** deducted from `AvailableLeave`.
> - Deductions are only recorded when an official adjustment is made.

### 2.6 Worksheet 6: `LeavePolicy`
Stores global policy configuration separately from application code.

| Column | Type | Constraints / Rules | Description |
|---|---|---|---|
| `PolicyID` | String | Unique (e.g. `POL-DEFAULT`) | Policy configuration key |
| `MonthlyAccrual` | Decimal | Positive decimal (e.g. `1.50`) | Leave earned per month |
| `CarryForwardPercentage` | Decimal | Numeric percentage (`0` to `100`, e.g. `50.0`) | Percentage of unused leave carried forward |
| `CarryForwardDate` | String | Month-Day string (e.g. `01-01`) | Cut-off rollover date |
| `CarryForwardExpiryDate` | String | Month-Day string (e.g. `03-31`) | Expiry date of carried forward leave |
| `MinimumContinuousCalendarDays` | Integer | Positive integer (e.g. `1`) | Minimum continuous leave duration |
| `WorkingDays` | String | Comma-separated working days | `Monday,Tuesday,Wednesday,Thursday,Friday` |
| `EffectiveFrom` | Date | ISO `YYYY-MM-DD` | Date when policy takes effect |
| `UpdatedAt` | DateTime | ISO 8601 | Record last update timestamp |
| `UpdatedBy` | String | References `Users.UserID` | Admin who updated policy |

### 2.7 Worksheet 7: `ActivityLogs`
Maintains an immutable audit log of administrative actions, attendance entries, and balance updates.

| Column | Type | Constraints / Rules | Description |
|---|---|---|---|
| `LogID` | String | Unique, Immutable | Identifier (e.g. `ACT-1001`) |
| `PerformedBy` | String | UserID or `'SYSTEM'` | Actor who executed action |
| `Action` | String | e.g. `USER_CREATED`, `ATTENDANCE_MARKED` | Action identifier |
| `EntityType` | String | e.g. `User`, `Attendance`, `Holiday` | Affected entity |
| `EntityID` | String | Associated primary ID | Target record ID |
| `PreviousValue` | String | JSON string or summary | Previous state before change |
| `NewValue` | String | JSON string or summary | New state after change |
| `Reason` | String | Optional justification | Reason for administrative modification |
| `Timestamp` | DateTime | ISO 8601 | Timestamp of activity |

> **Privacy & Security Notice:**
> Passwords, Google OAuth tokens, and service account private keys are **never** logged.

### 2.8 Worksheet 8: `EmailLogs`
Audit log for informational notification emails dispatched upon leave submission.

| Column | Type | Constraints / Rules | Description |
|---|---|---|---|
| `EmailLogID` | String | Unique, Immutable | Identifier (e.g. `EML-1001`) |
| `RelatedLeaveRequestID` | String | References `LeaveRequests.LeaveRequestID` | Related leave submission |
| `RecipientEmail` | String | Lowercase email | Target recipient (Manager/Admin) |
| `DeliveryStatus` | Enum | `'Queued'`, `'Sent'`, `'Failed'` | Status of email dispatch |
| `ErrorMessage` | String | Empty if successful | Detailed error message on failure |
| `AttemptedAt` | DateTime | ISO 8601 | First dispatch attempt timestamp |
| `SentAt` | DateTime | ISO 8601 or empty | Successful delivery timestamp |

> **Integrity Rule:**
> An email delivery failure **never** deletes or alters the underlying leave request.

---

## 3. Relationships & Referential Integrity

Google Sheets is a flat-file tabular store without native relational foreign key enforcement. The backend service layer enforces referential integrity explicitly:

```mermaid
erDiagram
    Users ||--o{ Attendance : "has daily record"
    Users ||--o{ LeaveRequests : "submits"
    Users ||--o{ LeaveBalances : "owns yearly balance"
    Users ||--o{ Holidays : "declared by"
    Users ||--o{ ActivityLogs : "performed by"
    LeaveRequests ||--o{ EmailLogs : "triggers notifications"
```

1. **`Attendance.UserID`** $\rightarrow$ **`Users.UserID`**
2. **`Attendance.MarkedBy`** $\rightarrow$ **`Users.UserID`** (must have role `Manager` or `Admin`)
3. **`LeaveRequests.UserID`** $\rightarrow$ **`Users.UserID`**
4. **`LeaveBalances.UserID`** $\rightarrow$ **`Users.UserID`**
5. **`Holidays.CreatedBy`** $\rightarrow$ **`Users.UserID`** (must have role `Manager` or `Admin`)
6. **`EmailLogs.RelatedLeaveRequestID`** $\rightarrow$ **`LeaveRequests.LeaveRequestID`**

---

## 4. Formats & Standards

- **Unique IDs:** Consistent prefixed alphanumeric keys (e.g., `USR-1001`, `ATT-2026-1001`, `LRQ-1001`, `HOL-2026-01`, `BAL-2026-USR1001`, `ACT-1001`, `EML-1001`).
- **Dates:** Strict ISO 8601 Calendar Date: `YYYY-MM-DD` (e.g., `2026-10-30`).
- **Timestamps:** Strict ISO 8601 UTC: `YYYY-MM-DDTHH:mm:ss.sssZ` (e.g., `2026-10-30T11:20:00.000Z`).
- **Decimals:** IEEE 754 float rounded to 2 decimal places (`Math.round(val * 100) / 100`) to eliminate floating-point drift.
- **Booleans:** String literals `'TRUE'` or `'FALSE'`.
- **Emails:** Case-insensitive, trimmed, and normalized to lowercase before validation and storage.

---

## 5. Google Sheets Setup & Environment Variables

### 5.1 Google Cloud Prerequisites
1. Create a Google Cloud project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Google Sheets API v4**.
3. Create a **Service Account** with access to Google Sheets.
4. Generate and download a Service Account JSON keyfile.
5. Create a blank Google Spreadsheet in Google Drive.
6. Share the spreadsheet with the Service Account email (`client_email`) with **Editor** permissions.
7. Copy the Spreadsheet ID from the URL (`https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`).

### 5.2 Environment Variables Configuration
Set the following variables in `backend/.env`:

```ini
# Google Sheets Database Configuration
GOOGLE_SPREADSHEET_ID="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
GOOGLE_SERVICE_ACCOUNT_EMAIL="tc-tracker-sa@project-id.iam.gserviceaccount.com"
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

---

## 6. Initialization & Safe Migration Script

The database initializer [`initDatabase.ts`](file:///D:/TC%20Tracker/backend/src/scripts/initDatabase.ts) provides a non-destructive audit and setup routine:

```powershell
npm run db:init
```

### Script Execution Flow:
1. **Connectivity Check:** Verifies presence of environment variables. Exits gracefully with clear instructions if unconfigured.
2. **Metadata Inspection:** Reads existing worksheet titles from Google Sheets.
3. **Safe Worksheet Creation:** Creates **only** missing worksheets. Never deletes, overwrites, or recreates existing worksheets.
4. **Header Validation:**
   - If a worksheet is empty, canonical headers are written to Row 1.
   - If headers exist, the script compares them against canonical schemas, detecting missing or unexpected columns while preserving all existing data rows.
5. **No Synthetic Data:** Does not insert fake staff records or arbitrary admin roles.

---

## 7. Concurrency Limitations & Mitigation Strategy

Google Sheets is a cloud spreadsheet, not an ACID relational database. It lacks row-level locking, multi-row atomic transactions, and foreign key constraints.

### Limitations:
- **Write Race Conditions:** Two simultaneous writes to the same worksheet can lead to race conditions if based on outdated read state.
- **API Rate Limits:** Google Sheets API limits read requests to 300 per minute per project and write requests to 300 per minute per project.

### Backend Mitigation Strategy:
1. **Read-Before-Write Verification:** The backend fetches current records and validates constraints (e.g. duplicate attendance checks, unique email checks) immediately prior to appending.
2. **Atomic Append Operations:** Appending new rows uses `values.append` with `insertDataOption: INSERT_ROWS`, which is atomic at the worksheet append level.
3. **Batch Updates for Multistep Mutations:** Using `spreadsheets.batchUpdate` bundles atomic structural modifications.
4. **Application-Level Referential Validation:** All foreign key relationships (`UserID` in `Attendance`, `LeaveRequests`, `Balances`) are checked in memory by the backend before persistence.

---

## 8. Test Suite & Verification Results

The automated test suite in [`databaseValidation.test.ts`](file:///D:/TC%20Tracker/backend/src/tests/databaseValidation.test.ts) covers 23 test cases across 11 test suites:

```
> tc-tracker@1.0.0 test
> npm run test --prefix backend

▶ --- [MOCK TEST SUITE] TC Tracker Phase 2 Database Validation ---
  ✔ 1. Worksheet Header Validation (3 tests)
  ✔ 2. Spreadsheet Configuration Validation (2 tests)
  ✔ 3. Duplicate User Email Detection (3 tests)
  ✔ 4. Duplicate Attendance Detection (2 tests)
  ✔ 5. Duplicate Yearly Leave Balance Detection (2 tests)
  ✔ 6. Valid Roles, Attendance, and Notification Statuses (3 tests)
  ✔ 7. Date and Decimal Validation (4 tests)
  ✔ 8. Referential Integrity & Foreign Key Check (2 tests)
  ✔ 9. Missing Worksheet and Error Simulation (1 test)
  ✔ 10. Safe Non-Destructive Initialization Logic (1 test)
✔ All 23 tests passed (0 failures)
```
