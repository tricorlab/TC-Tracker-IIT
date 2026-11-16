# TC Tracker — Phase 4: Attendance & Leave Management Documentation

## 1. Executive Summary

Phase 4 delivers the core Attendance and Leave Management engine for **TC Tracker**, fully integrated with the React + TypeScript frontend, Express + TypeScript backend, Google Sheets API database layer, and Google OAuth 2.0 RBAC session authentication.

### Core Philosophy & Approved Architecture
- **Primary Database:** Google Sheets API v4 across 8 existing worksheets (`Users`, `Attendance`, `LeaveRequests`, `Holidays`, `LeaveBalances`, `LeavePolicy`, `ActivityLogs`, `EmailLogs`). Zero schema changes were introduced.
- **Excluded Technologies:** Strictly no Firebase, PostgreSQL, MySQL, MongoDB, or Prisma ORM.
- **Informational Leave Philosophy:** Leave requests serve an informational function for team planning and institute schedule continuity. **No approval/rejection workflows** exist, and submissions **never automatically deduct** from employee leave balances.
- **Excess Balance Behavior:** If an employee requests more days than their available leave balance, a clear notice banner is displayed on the frontend and returned in the API response, but the submission is **never blocked**.

---

## 2. Attendance Management System

### 2.1 Daily Attendance Marking
- **Status Options:** `Present`, `Absent`. Any active employee without a record on a given date is classified as `Not Marked`.
- **Duplicate Prevention & In-Place Corrections:** Attendance is keyed by `UserID` + `AttendanceDate`. Submitting a correction for an existing record updates the status, `MarkedBy`, and `UpdatedAt` fields in-place on Google Sheets without creating duplicate rows.
- **Calendar Awareness:** The marking interface alerts managers if a selected date is a Sunday (weekly off) or registered institute holiday.
- **Role Permissions:** Attendance marking and corrections are restricted to `Manager` and `Admin` roles via `requireManager` middleware.

### 2.2 Monthly Attendance Summaries
- Computes total calendar days, total working days, total Sundays, total holidays, present count, absent count, and not-marked count.
- **Exclusion Rule:** Sundays and official institute holidays are explicitly categorized as weekly offs and holidays—they are **never** counted as employee absences.
- Employees can review their personal attendance history via `/attendance/my`.

---

## 3. Holiday Management System

- **Worksheet:** `Holidays` (`HolidayID`, `HolidayName`, `HolidayDate`, `Description`, `CreatedBy`, `CreatedAt`, `UpdatedAt`).
- **Integrity Constraints:**
  - Duplicate holiday dates are strictly rejected.
  - Institute holidays cannot fall on a Sunday.
  - Dates must follow the strict ISO calendar format `YYYY-MM-DD`.
- **Permissions:** All authenticated staff members can view holidays (`/holidays`). Only `Manager` and `Admin` users can create, update, or delete holidays.
- **Audit Logging:** Every holiday creation, modification, and deletion is recorded in `ActivityLogs`.

---

## 4. Leave Calculation & Policy Engine

### 4.1 Inclusive Date Counting Engine
Leave duration calculation dynamically checks the total continuous calendar span:

| Condition | Rule | Rationale |
| :--- | :--- | :--- |
| **Span < 7 Calendar Days** | Working Days Only | Excludes Sundays and institute holidays that fall within the range. |
| **Span &ge; 7 Calendar Days** | All Calendar Days | Continuous long-term leaves count all calendar days including Sundays and holidays. |

#### Verification Examples
- **Example A (5 days):** Thursday 2026-11-05 to Monday 2026-11-09 (1 Sunday + 1 Diwali holiday) &rarr; **3 working days** counted.
- **Example B (7 continuous days):** Monday 2026-11-02 to Sunday 2026-11-08 (includes Sunday) &rarr; **7 days** counted.
- **Example C (10 continuous days):** Sunday 2026-11-01 to Tuesday 2026-11-10 &rarr; **10 days** counted.

### 4.2 Leave Accrual Logic
- **Rate:** Standard 2.5 days per completed calendar month based on `JoiningDate`.
- **Completed Month Rule:** Employees only accrue 2.5 days for months that have completed in full. The ongoing or partial month awards 0 days until fully elapsed.

### 4.3 Year-End Carry Forward & Expiry
- On December 31, 50% of the employee's unused leave balance carries forward into the subsequent calendar year.
- Carried-forward days expire after March 31 of the new calendar year.

---

## 5. Informational Leave Submissions & Notifications

### 5.1 Submission Workflow
1. Employee selects leave type (`Casual`, `Sick`, `Annual`, `Maternity/Paternity`, `Other`), start date, end date, reason, and optional remarks.
2. A live preview calculates total calendar days, excluded Sundays, excluded holidays, and final calculated days.
3. If `calculatedDays > availableBalance`, a prominent notice banner warns the user while still permitting submission.
4. Record is saved to `LeaveRequests` with status `Submitted`.
5. An informational email notification is dispatched or logged in `EmailLogs` for managers and administrators.
6. The submission is logged in `ActivityLogs`.

### 5.2 Balance Integrity
- Leave submissions **do not debit** `LeaveBalances.UsedLeave` or `LeaveBalances.AvailableLeave`.
- Deductions and adjustments are maintained by administrators via the administrative ledger.

---

## 6. Administrative Balance Management & Policy Configuration

### 6.1 Leave Balance Ledger (`/admin/leave-balances`)
- Admins can inspect all staff balances for any calendar year.
- Modal allows adjusting `EarnedLeave`, `CarriedForward`, or `UsedLeave`.
- **Mandatory Reason:** A justification must be provided for any manual adjustment, which is logged to `ActivityLogs`.
- `AvailableLeave` is calculated automatically as `EarnedLeave + CarriedForward - UsedLeave`.

### 6.2 Leave Policy Editor (`/admin/leave-policy`)
- Admins can adjust the baseline parameters:
  - Monthly accrual rate (default: 2.5 days)
  - Carry-forward percentage (default: 50%)
  - Carry-forward expiry date (default: `03-31`)
- Changes are recorded in `LeavePolicy` and audited in `ActivityLogs`.

### 6.3 Activity Audit Logs (`/admin/activity-logs`)
- Provides a searchable timeline of all system actions, including attendance marks, holiday edits, leave requests, and balance adjustments.

---

## 7. REST API Endpoint Catalog

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/attendance/daily?date=YYYY-MM-DD` | Manager, Admin | Fetch roster attendance for a date |
| **POST** | `/api/attendance/daily` | Manager, Admin | Record/correct daily attendance entries |
| **GET** | `/api/attendance/monthly?userId=&year=&month=` | Staff (own), Manager, Admin | Fetch monthly summary and calendar breakdown |
| **GET** | `/api/attendance/history?userId=&startDate=&endDate=` | Staff (own), Manager, Admin | Fetch attendance history within date range |
| **GET** | `/api/holidays?year=YYYY` | Staff, Manager, Admin | Fetch holidays for calendar year |
| **POST** | `/api/holidays` | Manager, Admin | Create holiday (rejects duplicate dates & Sundays) |
| **PUT** | `/api/holidays/:id` | Manager, Admin | Update existing holiday |
| **DELETE** | `/api/holidays/:id` | Manager, Admin | Delete holiday record |
| **GET** | `/api/leave/calculate?startDate=&endDate=` | Staff, Manager, Admin | Live preview calculation with <7 vs &ge;7 rule |
| **POST** | `/api/leave/requests` | Staff, Manager, Admin | Submit informational leave notice |
| **GET** | `/api/leave/requests/my` | Staff, Manager, Admin | Fetch authenticated user's submitted requests |
| **GET** | `/api/leave/requests` | Manager, Admin | Fetch all staff leave notices across institute |
| **GET** | `/api/leave/balance?userId=&year=` | Staff (own), Manager, Admin | Fetch leave balance for user and year |
| **GET** | `/api/leave/balances?year=` | Admin | Fetch all staff leave balances |
| **POST** | `/api/leave/balances/adjust` | Admin | Manually adjust staff leave balance with reason |
| **GET** | `/api/leave/policy` | Staff, Manager, Admin | Fetch active leave policy parameters |
| **PUT** | `/api/leave/policy` | Admin | Update leave policy parameters |
| **GET** | `/api/leave/year-transition/preview?sourceYear=&destinationYear=` | Admin | Preview carry-forward & lapsed amounts without writing |
| **POST** | `/api/leave/year-transition/execute` | Admin | Manually execute year transition with confirmation |
| **GET** | `/api/dashboard/staff` | Staff, Manager, Admin | Aggregate personal dashboard data |
| **GET** | `/api/dashboard/manager?date=YYYY-MM-DD` | Manager, Admin | Aggregate manager operational overview |
| **GET** | `/api/dashboard/admin?date=YYYY-MM-DD` | Admin | Aggregate admin operational overview |
| **GET** | `/api/dashboard/activity-logs?limit=` | Admin | Fetch recent audit activity logs |

---

## 8. Automated Test Results

The automated test suite covers database schemas, authentication, RBAC, CSRF, attendance marking, holiday integrity, leave counting engine, completed month accrual effective dates, year-transition preview and execution, duplicate prevention, partial failure handling, dynamic carried-forward expiry, excess warnings, email logging, and frontend route protection:

```
Backend Test Suites: 25
Backend Tests Passed: 80 / 80 (100%)

Frontend Test Suites: 11
Frontend Tests Passed: 23 / 23 (100%)

Total Passing Tests: 103 / 103
```

Both backend (`tsc`) and frontend (`tsc -b && vite build`) compile without errors or warnings.
