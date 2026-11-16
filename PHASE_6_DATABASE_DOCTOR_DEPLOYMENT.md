# TC Tracker — Phase 6: Database Doctor, Leave Enrichment, Rate Limiting & Deployment Readiness

## 1. Overview & Architecture

Phase 6 completes the production hardening, administrative health inspection, leave review enrichment, abuse prevention, and hosting configuration for the TC Tracker platform.

The architectural foundation remains strictly preserved:
- **Frontend:** React + Vite + TypeScript + Tailwind CSS + React Router + Lucide React
- **Backend:** Node.js + Express + TypeScript
- **Database:** Google Sheets API v4 (Worksheets: `Users`, `Attendance`, `LeaveRequests`, `Holidays`, `LeaveBalances`, `LeavePolicy`, `ActivityLogs`, `EmailLogs`)
- **Authentication:** Google OAuth 2.0 / Google Identity Services with HTTP-only signed session cookies and Double-Submit CSRF protection
- **Hosting Plan:** Vercel (Frontend SPA) + Render (Express Backend Web Service)

---

## 2. Implemented Features

### 2.1 Google Sheets Database Doctor & Diagnostics Inspector (`/admin/database-doctor`)
- **Admin-Only RBAC:** Strictly restricted to Administrators (`requireAdmin` middleware on backend, route guard on frontend). Staff and Managers receive HTTP `403 Forbidden` and client redirect to `/unauthorized`.
- **Read-Only Diagnostics (`GET /api/dashboard/database-doctor`):**
  - Verifies presence and access to the target Google Spreadsheet.
  - Inspects all 8 required worksheets: `Users`, `Attendance`, `LeaveRequests`, `Holidays`, `LeaveBalances`, `LeavePolicy`, `ActivityLogs`, `EmailLogs`.
  - Audits schema headers against official system definitions (`EXPECTED_COLUMNS`).
  - Reports row counts, header health status (`MATCH`, `MISMATCH`, `EMPTY`), and overall system status (`HEALTHY` vs `ACTION_REQUIRED`).
- **Credential Protection & Masking:**
  - Database credentials (`GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`) are masked in both UI and API responses (e.g., `1Bxi...2upms`, `tc-***@project.iam...`).
  - Sensitive secrets (`GOOGLE_PRIVATE_KEY`, `SESSION_SECRET`) are never transmitted over the wire or logged.
- **Safe Non-Destructive Repair (`POST /api/dashboard/database-doctor/repair`):**
  - Requires explicit confirmation payload (`options: { confirm: true }`).
  - Safe repair operations:
    1. Creates missing worksheets with canonical column headers.
    2. Initializes headers on existing but empty worksheets.
    3. **Preservation guarantee:** Existing data rows are never deleted, overwritten, or truncated.
  - Emits mandatory audit trail event in `ActivityLogs` (`DATABASE_DOCTOR_REPAIR`).

### 2.2 Leave Request Employee Enrichment
- **Manager & Admin Review Context:**
  - Backend `getAllEnrichedRequests()` in `leave.service.ts` joins `LeaveRequests` with the `Users` worksheet roster by `UserID`.
  - Returned payload enriches each request with `FullName`, `Email`, and `Role` (with fallback to `"Unknown Employee"` if the user ID is unlinked).
- **Frontend Leave Requests UI (`/leave/requests`):**
  - Table column updated to **Employee**, showing the employee's full name, email address, and role badge (`Staff` / `Manager` / `Admin`).
  - Multi-field search enables instant filtering across Employee Name, Email, Leave Request ID, and Leave Reason.

### 2.3 API Sliding-Window Rate Limiting
- **In-Memory Rate Limiter Middleware (`rateLimiter.middleware.ts`):**
  - Implements lightweight, dependency-free sliding-window rate tracking.
  - Emits standard RFC rate limit headers: `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset`.
  - Upon exceeding the quota, halts execution with HTTP `429 Too Many Requests`, JSON error message, and `Retry-After` header (seconds until reset).
- **Protected Endpoints:**
  - `POST /api/auth/google`: 20 requests per 15 minutes per IP (`authRateLimiter`).
  - `GET /api/reports/attendance/csv` & `GET /api/reports/leave-balances/csv`: 30 requests per minute per user ID / IP (`reportExportRateLimiter`).
  - `POST /api/leave/year-transition/execute`: 5 requests per minute per Admin (`yearTransitionRateLimiter`).
- **Architectural Scope & Single-Instance Limitation:**
  - Rate tracking records reside in Node.js process memory.
  - Limits are enforced on a per-instance basis. On Render with multiple instances, each instance maintains its own memory window; this provides immediate node protection without requiring an external Redis/database dependency.

### 2.4 Deployment Configuration & Security Hardening
- **HTTP Security Headers (`backend/src/app.ts`):**
  - `X-Content-Type-Options: nosniff` (prevents MIME type sniffing).
  - `X-Frame-Options: DENY` (clickjacking defense).
  - `X-XSS-Protection: 1; mode=block` (legacy XSS filter).
  - `Referrer-Policy: strict-origin-when-cross-origin` (protects internal path leakage).
- **Vercel SPA Hosting (`frontend/vercel.json`):**
  - Framework: `vite`.
  - SPA routing rewrite: `{ "source": "/(.*)", "destination": "/index.html" }`.
  - Cache and security headers configured for production assets and documents.
- **Render Backend Deployment (`render.yaml`):**
  - Service type: `web`, runtime: `node`.
  - Build command: `npm install && npm run build`.
  - Start command: `npm start`.
  - Health check path: `/api/health`.
  - Declarations for environment variables (`NODE_ENV`, `PORT`, `FRONTEND_URL`, `SPREADSHEET_ID`, etc.).

---

## 3. Verification & Test Results

### 3.1 Test Execution Summary
- **Backend Test Suite:** 110 passed, 0 failed across 35 test suites (`npm run test --prefix backend`).
- **Frontend Test Suite:** 43 passed, 0 failed across 17 test suites (`npm run test --prefix frontend`).
- **Total Project Tests:** 153 passed, 0 failed across 52 test suites (`npm test`).
- **Production Builds:**
  - Backend: `tsc` compiled cleanly with zero errors.
  - Frontend: `tsc -b && vite build` bundled 2,061 modules successfully (`dist/index.html`, `dist/assets/index-*.js`, `dist/assets/index-*.css`).
- **Linting:** `oxlint` completed with 0 errors across 32 files.

### 3.2 Integration Testing Status (Live vs Mock)
- **Automated Tests:** Conducted using comprehensive mocked services simulating Google OAuth, Google Sheets API v4 endpoints, HTTP sessions, CSRF headers, and rate-limiting clocks.
- **Live Cloud Integrations:** Live Google Sheets API, Google OAuth credentials, live Vercel deployments, and live Render instances require live production secrets and were not invoked during automated local testing.
