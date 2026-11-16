# TC Tracker — Phase 3: Authentication & Role-Based Access Control (RBAC)

This document describes the secure authentication architecture, Google Identity Services flow, backend token verification, session management via HTTP-only cookies, role-based authorization, and verification procedures implemented in **Phase 3**.

---

## 1. Authentication Architecture

```
┌─────────────────────────────────┐           ┌─────────────────────────────────┐
│        Frontend (React SPA)     │           │      Backend (Express API)      │
│  - Google Identity Services GIS │           │  - google-auth-library verify   │
│  - Render Google Sign-In Button │  idToken  │  - Look up normalized email in  │
│  - Never handles secrets/keys   │ ────────> │    Google Sheets "Users" table  │
│  - Credentials: "include"       │   POST    │  - Checks IsActive == true      │
│  - Automatic session restore    │           │  - Issues signed session token  │
│                                 │ <──────── │    in HTTP-only cookie (Lax)    │
│                                 │  Set-     │                                 │
│                                 │  Cookie   │                                 │
└────────────────┬────────────────┘           └────────────────┬────────────────┘
                 │                                             │
                 │ Protected API Request                       │ Live Database Lookup
                 │ (Cookie: tc_session)                        │ (Source of Truth)
                 v                                             v
┌─────────────────────────────────┐           ┌─────────────────────────────────┐
│     Role-Aware Navigation       │           │      Google Sheets Database     │
│  - Staff / Manager / Admin      │           │                                 │
│  - ProtectedRoute enforcement   │           │  Worksheet: "Users"             │
│  - Unauthorized (403) redirect  │           │  Columns: UserID, FullName,     │
│  - Login (401) redirect         │           │  Email, Role, IsActive...       │
└─────────────────────────────────┘           └─────────────────────────────────┘
```

### Core Security Principles:
1. **Google as Identity Provider:** Users authenticate via Google OAuth 2.0 / Google Identity Services (GIS).
2. **Google Sheets as Source of Truth:** Google only validates email ownership. Whether an account is authorized, what role it possesses, and whether it is active are determined exclusively by the `Users` worksheet in Google Sheets.
3. **No Passwords or Self-Registration:** There is no public registration form, no username/password database, and users cannot select or elevate their own roles.
4. **No Token Storage in Web Storage:** Session tokens are stored strictly in `HttpOnly`, `SameSite=Lax` cookies. `localStorage` and `sessionStorage` are strictly forbidden for credentials.

---

## 2. Google OAuth Setup Instructions

### 2.1 Google Cloud Console Configuration
1. Open the [Google Cloud Console](https://console.cloud.google.com/) and select your project.
2. Navigate to **APIs & Services > Credentials**.
3. Create or select an **OAuth 2.0 Client ID** (Application type: **Web application**).
4. Configure **Authorized JavaScript origins**:
   - Local: `http://localhost:5173`
   - Production: `https://your-vercel-domain.vercel.app`
5. Configure **Authorized redirect URIs**:
   - Local: `http://localhost:5000/api/auth/google/callback`
   - Production: `https://your-render-backend.onrender.com/api/auth/google/callback`
6. Copy the **Client ID** and **Client Secret**.

---

## 3. Required Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Example |
|---|---|---|
| `PORT` | Local backend HTTP server port | `5000` |
| `FRONTEND_URL` | Allowed CORS origin (Frontend URL) | `http://localhost:5173` |
| `SESSION_SECRET` | 32+ character signing secret for session cookies | `random-32-char-cryptographic-secret` |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth 2.0 Client ID (Audience) | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_ID` | Backward-compatible alias for OAuth Client ID | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret | `GOCSPX-xxxxxx` |
| `GOOGLE_SPREADSHEET_ID` | Google Spreadsheet database ID | `1BxiMVs0XRA5nFMd...` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service Account email for Sheets API | `tc-tracker-sa@project-id.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | Private key for Sheets API access | `"-----BEGIN PRIVATE KEY-----\n..."` |

### Frontend (`frontend/.env`)

| Variable | Description | Example |
|---|---|---|
| `VITE_API_BASE_URL` | Base URL of the backend API | `http://localhost:5000` |
| `VITE_GOOGLE_CLIENT_ID` | Client ID for Google Identity Services button | `xxx.apps.googleusercontent.com` |

---

## 4. How the Backend Verifies Google ID Tokens

When the frontend sends a Google credential to `POST /api/auth/google`:
1. `OAuth2Client.verifyIdToken({ idToken, audience: config.google.clientId })` verifies cryptographic signature and expiration against Google's public certificates.
2. **Issuer Verification:** Confirms `payload.iss` is `accounts.google.com` or `https://accounts.google.com`.
3. **Audience Verification:** Validates `payload.aud` matches `GOOGLE_OAUTH_CLIENT_ID`.
4. **Email Verification:** Validates `payload.email_verified === true`. If unverified, access is rejected immediately.
5. **Email Normalization:** The email is trimmed and converted to lowercase (`email.trim().toLowerCase()`).

---

## 5. How Users are Matched Against Google Sheets

1. The backend searches the `Users` worksheet for a row whose `Email` matches the normalized Google email.
2. **Unregistered Check:** If no row is found, access is denied (HTTP 401):
   `"Your account is not registered in TC Tracker. Please contact the administrator."`
3. **Account Status Check:** If `IsActive` is false (`'FALSE'`, `'false'`, `0`), access is denied (HTTP 401):
   `"Your account is inactive. Please contact the administrator."`
4. **Role Validation:** The user's role must be one of:
   - `Staff`
   - `Manager`
   - `Admin`  
   Unknown roles are rejected (HTTP 403):
   `"Invalid account role. Please contact the administrator."`
5. **Dynamic Role Resolution on Subsequent Requests:** The session token stores `userId` and `email`. On each authenticated request, `authenticateSession` resolves the user's **current** status and role from Google Sheets. If an administrator demotes an Admin to Staff or deactivates an account in Google Sheets, the change takes effect immediately without waiting for the session cookie to expire.

---

## 6. Session, Cookie & CSRF Security Architecture

- **Session Cookie Name:** `tc_session`
- **Companion CSRF Cookie Name:** `XSRF-TOKEN`
- **Security Attributes:**
  - `httpOnly: true` on `tc_session` (prevents JavaScript access, mitigating XSS risks).
  - `httpOnly: false` on `XSRF-TOKEN` (allows client-side JavaScript to read and attach the token as `X-CSRF-Token` header on state-changing requests).
  - `sameSite`: Configured as `'none'` in production cross-site deployments (Vercel + Render) with `secure: true`, or `'lax'` in local development.
  - `secure: true` in production (enforcing HTTPS transport).
  - `path: '/'`
  - `maxAge: 7 * 24 * 60 * 60 * 1000` (7 days)
- **Token Signing & Secret Strength:** Signed via HMAC-SHA256 using `SESSION_SECRET`. In production, a missing or weak secret (< 32 characters) causes an immediate fatal startup error.
- **CSRF Defense-in-Depth:**
  1. **Strict Origin Validation (`validateOrigin`):** All state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) require `Origin` or `Referer` matching `config.frontendUrl`. Untrusted or missing origins are rejected with HTTP 403.
  2. **Double-Submit Anti-CSRF Token (`validateCsrfToken`):** On login, a cryptographically random 32-byte hex token is generated, stored in the signed session, and set in the companion `XSRF-TOKEN` cookie. State-changing authenticated requests must provide matching `X-CSRF-Token` header.
  3. **Strict CORS Policy:** Credentials (`Access-Control-Allow-Credentials: true`) are exclusively allowed for the configured frontend origin. Wildcard origins with credentials are explicitly blocked.
- **Logout:** `POST /api/auth/logout` clears both `tc_session` and `XSRF-TOKEN` cookies using identical security attributes.

---

## 7. Role Permissions & Hierarchy

| Permission / Action | Staff | Manager | Admin |
|---|:---:|:---:|:---:|
| Authenticate with Google Sign-In | Yes | Yes | Yes |
| Access Dashboard (`/dashboard`) | Yes | Yes | Yes |
| View own profile (`GET /api/auth/me`) | Yes | Yes | Yes |
| Access Manager Portal (`/manager`, `requireManager`) | No | Yes | Yes |
| Access Admin Panel (`/admin`, `requireAdmin`) | No | No | Yes |
| Manage User Roles in Google Sheets | No | No | Yes |

---

## 8. API Endpoints

### Public Endpoints
- `GET /api/health` — System health check.
- `POST /api/auth/google` — Verifies Google ID token, verifies user in Google Sheets, issues HTTP-only session cookie.
  - Body: `{ "idToken": "string" }`
  - Response: `{ "success": true, "message": "Authentication successful", "user": { ... } }`
- `POST /api/auth/logout` — Clears HTTP-only session cookie.
  - Response: `{ "success": true, "message": "Logged out successfully" }`

### Protected Endpoints
- `GET /api/auth/me` — Returns current authenticated user context and dynamically resolved role.
  - Middleware: `authenticateSession`
  - Response: `{ "success": true, "user": { "userId": "...", "fullName": "...", "email": "...", "role": "Staff|Manager|Admin" } }`
- `GET /api/auth/test/staff` — Staff authorization test endpoint (`authenticateSession`, `requireStaff`).
- `GET /api/auth/test/manager` — Manager authorization test endpoint (`authenticateSession`, `requireManager`).
- `GET /api/auth/test/admin` — Admin authorization test endpoint (`authenticateSession`, `requireAdmin`).

---

## 9. Local Testing Instructions

### Run Automated Backend & DB Validation Tests
From project root:
```powershell
npm test
```
Executes all 40 automated tests:
- 17 Phase 3 Authentication & RBAC tests (token verification, email normalization, inactive accounts, unknown users, cookie lifecycle, dynamic role resolution, RBAC middleware).
- 23 Phase 2 Database Validation tests.

### Run Development Servers
```powershell
# Terminal 1 - Backend API (Port 5000)
npm run dev:backend

# Terminal 2 - Frontend SPA (Port 5173)
npm run dev:frontend
```

---

## 10. Deployment Configuration

### Vercel (Frontend)
- **Framework Preset:** Vite
- **Root Directory:** `frontend`
- **Build Command:** `npm run build`
- **Environment Variables:**
  - `VITE_API_BASE_URL`: `https://tc-tracker-api.onrender.com`
  - `VITE_GOOGLE_CLIENT_ID`: `your-google-oauth-client-id.apps.googleusercontent.com`

### Render (Backend)
- **Service Type:** Web Service (Node)
- **Root Directory:** `backend`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- **Environment Variables:**
  - `PORT`: `5000` (or assigned by Render)
  - `FRONTEND_URL`: `https://your-tc-tracker.vercel.app`
  - `SESSION_SECRET`: Strong random string
  - `GOOGLE_OAUTH_CLIENT_ID`: Google OAuth Client ID
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Service Account email
  - `GOOGLE_PRIVATE_KEY`: Service Account private key
  - `GOOGLE_SPREADSHEET_ID`: Target Google Spreadsheet ID

---

## 11. Features Not Yet Implemented (Strict Phase Restrictions)

In accordance with Phase 3 guidelines, the following business modules have **not** been implemented and are reserved for subsequent phases:
- Daily attendance marking (Present/Absent).
- Informational leave requests and date-range calculations.
- Leave balance calculations and policy accrual logic.
- Email notification dispatches via Gmail API.
- Staff and holiday management administration interfaces.
- Loss of Pay (LOP) functionality.
- Leave approval or rejection workflows (leave requests remain strictly informational).
