# TC Tracker — Phase 5: User Management, Email Audit & Attendance/Leave Reports

## 1. Overview & Architecture

Phase 5 delivers institutional roster administration, email notification auditing, and official monthly attendance and annual leave balance reporting. The system continues to strictly operate on:
- **Frontend:** React + Vite + TypeScript + Tailwind CSS + React Router + Lucide React
- **Backend:** Node.js + Express + TypeScript
- **Database:** Google Sheets API v4 (Worksheets: `Users`, `Attendance`, `LeaveRequests`, `Holidays`, `LeaveBalances`, `LeavePolicy`, `ActivityLogs`, `EmailLogs`)
- **Authentication:** Google OAuth 2.0 / Google Identity Services with HTTP-only cookies and Double-Submit CSRF protection

---

## 2. Features Implemented

### 2.1 User & Team Roster Management (`/admin/users`)
- **Admin Capabilities:**
  - View full roster of registered accounts.
  - Onboard new users with roles: `Staff`, `Manager`, or `Admin`.
  - Edit user details: Full Name, Email, Role, Joining Date, and Active Status.
  - Search and filter by name, email, UserID, role, and active status.
- **Manager Capabilities:**
  - View full roster of registered accounts.
  - Onboard **Staff users only** (role selector is locked to `Staff` with explicit policy guidance).
  - Cannot promote users, change roles, modify Admin accounts, or edit other users.
- **Staff Restrictions:**
  - Staff members are denied access to user management APIs and pages with HTTP `403 Forbidden` and client redirect to `/unauthorized`.
- **Validation & Data Integrity:**
  - Mandatory fields: `FullName`, `Email`, `Role`, `JoiningDate`.
  - Canonical email normalization (`trim().toLowerCase()`).
  - Unique email enforcement across all users (`409 Conflict`).
  - Unique UserID generation pattern (`USR-${Date.now()}-${random}`).
  - Valid date format enforcement (`YYYY-MM-DD`).
  - Passwords are never stored; accounts authenticate exclusively via verified Google OAuth.
  - Comprehensive audit logging: Every user creation (`USER_CREATED`) and update (`USER_UPDATED`, storing previous and new snapshots) is recorded in `ActivityLogs`.

### 2.2 Security Safeguards
- **Server-Side RBAC:** All protected endpoints strictly read and verify the caller's role from the server-side session context (`req.user.role`). Client-submitted role claims are ignored.
- **Self-Role Modification Prevention:** Administrators cannot change or demote their own account role (`403 Forbidden`).
- **Last Active Administrator Protection:** If only one active Administrator exists, that account cannot be deactivated or demoted (`400 Bad Request`).
- **Dynamic Role Reflection:** Account roles are resolved directly from the source of truth (`Users` sheet / synchronized cache), ensuring role changes take effect immediately on the very next request.

### 2.3 Email Notification Audit Inspector (`/admin/email-logs`)
- **Admin-Only Visibility:** Accessible exclusively to Administrators (`403 Forbidden` for Staff and Manager).
- **Inspection Capabilities:**
  - Displays all records from the `EmailLogs` worksheet (`EmailLogID`, `RecipientEmail`, `RelatedLeaveRequestID`, `DeliveryStatus`, `ErrorMessage`, `AttemptedAt`, `SentAt`).
  - Real-time search across recipient email, leave request ID, and error messages.
  - Status filter: `All`, `Sent`, and `Failed`.
  - Metrics cards summarizing total attempts, delivered emails, and unsent/failed transmissions.
  - Clear empty states and status badges.

### 2.4 Attendance & Leave Reports (`/reports`)
- **Manager & Admin Access:** Available to Managers and Administrators (`403 Forbidden` for Staff).
- **Monthly Attendance Report:**
  - Month and year selection.
  - Summarizes active Staff attendance: Working Days, Present, Absent, Not Marked, Sundays, Holidays, and Attendance Rate (%).
  - **Policy Guarantee:** Sundays and official Institute Holidays are never counted as working-day absences. Unmarked dates are distinctly tracked as *Not Marked*.
  - Full institute totals displayed in summary cards and table footer.
  - **CSV Export:** `GET /api/reports/attendance/csv?year=...&month=...` streams standard RFC 4180 CSV with headers, employee rows, and summary totals.
  - **Print Layout:** Print-optimized layout with print media styles hiding navigation and actions.
- **Annual Leave Balance Report:**
  - Calendar year selection.
  - Tabular breakdown for each active employee: Full Name, Role, Joining Date, Earned Leave, Carried Forward, Used Leave, Available Leave, and status indicators.
  - **Policy Guarantee:** Earned leave strictly computes 2.5 days per completed calendar month credited on the 1st of the following month. Carried-forward leave reflects Admin-controlled 50% year-end rollover and dynamically flags expiry starting April 1.
  - Full institute totals for Earned, Carried, Used, and Available leave.
  - **CSV Export:** `GET /api/reports/leave-balances/csv?year=...` streams standard RFC 4180 CSV.
  - **Print Layout:** Clean print-ready summary.

---

## 3. Endpoints Added

| Method | Endpoint | Allowed Roles | Description |
|---|---|---|---|
| `GET` | `/api/users` | Manager, Admin | Retrieve user roster |
| `POST` | `/api/users` | Manager, Admin | Create user (Manager: Staff only; Admin: all roles) |
| `PUT` | `/api/users/:id` | Admin | Edit user details with self-role and last-admin safeguards |
| `GET` | `/api/dashboard/email-logs` | Admin | Inspect email dispatch audit logs |
| `GET` | `/api/reports/attendance` | Manager, Admin | Retrieve monthly attendance report (JSON) |
| `GET` | `/api/reports/attendance/csv` | Manager, Admin | Download monthly attendance report (CSV) |
| `GET` | `/api/reports/leave-balances` | Manager, Admin | Retrieve annual leave balance report (JSON) |
| `GET` | `/api/reports/leave-balances/csv` | Manager, Admin | Download annual leave balance report (CSV) |

---

## 4. Test Verification Results

### Backend Tests
- Total backend test suites: **30**
- Total backend tests: **99 passed, 0 failed**
- Key Phase 5 coverage:
  - Admin creation of Staff, Manager, Admin
  - Manager creation of Staff only & 403 on Manager/Admin creation
  - Staff creation block (403)
  - Duplicate normalized email rejection (409)
  - Admin self-role modification block (403)
  - Last active Admin protection (400)
  - Immediate dynamic role reflection
  - ActivityLog audit entries (`USER_CREATED`, `USER_UPDATED`)
  - Email log retrieval & 403 for Staff/Manager
  - Monthly attendance calculation (Sundays/holidays excluded from absences)
  - Annual leave balance calculation & policy compliance
  - CSV exports for attendance and leave balances

### Frontend Tests
- Total frontend test suites: **14**
- Total frontend tests: **33 passed, 0 failed**
- Key Phase 5 coverage:
  - Unauthenticated redirect to `/login`
  - Manager and Admin access to `/admin/users` and `/reports`
  - Staff denial (redirect to `/unauthorized`)
  - Admin-only access to `/admin/email-logs`
  - Component source verification for `UsersPage`, `EmailLogsPage`, `ReportsPage`, `Navbar`, and `api.ts`

### Builds and Linter
- Backend TypeScript compilation: **Clean (0 errors)**
- Frontend TypeScript & Vite production build: **Clean (0 errors)**
- Frontend Linter (`oxlint`): **0 errors**
