# TC Tracker — Enterprise Attendance & Leave Management Engine

> A high-performance, private employee attendance and leave management platform engineered with **React 19**, **Express.js**, **TypeScript**, and **Google Workspace APIs** (Google Sheets & Google Drive) as a resilient, serverless database architecture.

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Key Capabilities & Modules](#2-key-capabilities--modules)
3. [Technology Stack](#3-technology-stack)
4. [Repository File Organization](#4-repository-file-organization)
5. [Google Cloud & Workspace Setup Guide](#5-google-cloud--workspace-setup-guide)
   - [Google Sheets API & Service Account](#a-google-sheets-api--service-account)
   - [Google Drive API & Automated Backup Setup](#b-google-drive-api--automated-backup-setup)
   - [Google OAuth 2.0 Web Client](#c-google-oauth-20-web-client)
   - [Gmail SMTP App Password](#d-gmail-smtp-app-password)
6. [Environment Variables Reference](#6-environment-variables-reference)
7. [Local Development Quickstart](#7-local-development-quickstart)
8. [Production Deployment Blueprints](#8-production-deployment-blueprints)
   - [Blueprint A: Vercel (Frontend) + Render (Backend)](#blueprint-a-vercel-frontend--render-backend-recommended)
   - [Blueprint B: Docker & Docker Compose (Self-Hosted / VPS)](#blueprint-b-docker--docker-compose-self-hosted--vps)
   - [Blueprint C: Linux VPS (Ubuntu / Node / PM2 / Nginx)](#blueprint-c-linux-vps-ubuntu--pm2--nginx)
   - [Cross-Origin Cookie & CORS Essentials](#cross-origin-cookie--cors-essentials)
9. [Database Administration, Diagnostics & Recovery](#9-database-administration-diagnostics--recovery)
10. [Automated Testing & Verification](#10-automated-testing--verification)

---

## 1. Architecture Overview

TC Tracker is architected as a decoupled, zero-ORM application that leverages Google Sheets as a primary relational-style database and Google Drive for automated semi-annual versioned backups.

```mermaid
flowchart TD
    subgraph Client["Frontend Client (React 19 SPA)"]
        UI["Vite + React 19 + Tailwind CSS v4"]
        Context["AuthContext + ToastProvider"]
        Cache["In-Memory API Cache & Deduplication"]
    end

    subgraph Server["Backend API (Express.js + TypeScript)"]
        Auth["OAuth Token Verify & Dual-Auth"]
        CSRF["Origin Validation & CSRF Double-Submit"]
        Router["REST Controller Routes"]
        RateLimit["In-Memory Sliding-Window Limiter"]
        Policy["Leave Policy & Calculation Engine"]
        Backup["Google Drive Automated Backup Scheduler"]
    end

    subgraph GoogleCloud["Google Cloud Infrastructure"]
        GSheets["Google Sheets Database (8 Worksheets)"]
        GDrive["Google Drive (Shared Drive / Backup Clones)"]
        Gmail["Gmail SMTP (Email Notifications)"]
    end

    UI -->|REST + HTTP-only Cookie| CSRF
    CSRF --> Auth
    Auth --> Router
    Router --> RateLimit
    Router --> Policy
    Policy --> GSheets
    Backup -->|Semi-Annual Cron / Idempotent| GDrive
    Router -->|Nodemailer Transport| Gmail
```

### Core Architecture Principles
* **Google Sheets as Primary Database**: Stores all persistent records across 8 canonical worksheets (`Users`, `Attendance`, `LeaveRequests`, `Holidays`, `LeaveBalances`, `LeavePolicy`, `ActivityLogs`, `EmailLogs`).
* **Zero Database Bloat**: No PostgreSQL, MongoDB, or Prisma dependencies. Zero hosting costs for database servers.
* **Security & Isolation**: Service Account private keys remain strictly on the backend. Frontend never touches Google Sheets or cloud credentials directly.
* **Dual-Authentication & CSRF Defense**: Supports Google Single Sign-On (OAuth 2.0) and corporate Email/Password authentication (Argon2-equivalent salted bcrypt + server-side HMAC pepper) with strict Origin validation and Double-Submit Cookie CSRF tokens.

---

## 2. Key Capabilities & Modules

### 1. Role-Based Access Control (RBAC)
* **Admin**: Complete system control, attendance override, special leave grant, year-end transition execution, database diagnostics, user onboarding, and raw audit log access.
* **Staff**: Personal attendance dashboard, leave history, leave notice submissions, upcoming leave cancellations, and password management.
* **Self-Role Safeguard & Last-Admin Protection**: Administrators cannot demote their own account, and the system prevents deactivating the last active Administrator.

### 2. Daily Attendance & Roster Engine
* **Date-Driven Staff Roster**: Real-time marking of `Present`, `Absent`, or `Not Marked`.
* **Instant Unmarking / Punch Correction**: Allows administrators to clear accidental marks back to `Not Marked` without leaving orphaned records.
* **Automated Calendar Intelligence**: Automatically identifies Sundays and national/institute holidays; holidays are never penalized as employee absences.

### 3. Leave Policy & 7-Day Calculation Engine
* **< 7 Calendar Days**: Strictly counts **working days only** (excludes Sundays and official institute holidays).
* **≥ 7 Continuous Calendar Days**: Counts **all calendar days** continuously, including intervening weekends and holidays.
* **Pro-Rated Accrual**: Monthly completed-month accrual calculated dynamically based on employee `JoiningDate`.
* **50% Carry-Forward & 50% Lapse**: Admin-triggered year-end transition carries forward 50% of unused balance and permanently lapses 50%.
* **March 31 Dynamic Expiry**: Carried-forward leave expires automatically after March 31 of the new calendar year, while newly earned leave remains fully active.

### 4. Special Leave Allocation (Critical Section Grants)
* Allocates administrative special leaves for critical operational sections (e.g., Emergency Duty, Special Operations).
* Configurable exemption from casual leave balances.
* Optionally auto-marks all working days within the grant period as `Present` in the Attendance roster.

### 5. Automated Semi-Annual Google Drive Backups
* Automatically clones the entire Google Spreadsheet every 6 months (`01-01` and `07-01`) to Google Drive.
* Enterprise Shared Drive compatibility (`supportsAllDrives=true`) with quota handling.
* Local JSON snapshot fallback mechanism if cloud storage quota is constrained.
* Daily idempotency guard preventing duplicate backup copies on the same day.

### 6. Database Doctor & Schema Health Diagnostics
* Non-destructive real-time diagnostic inspector accessible from the Admin Panel.
* Validates canonical column headers against schemas across all worksheets.
* Single-click non-destructive schema repair without affecting or clearing existing employee data.

### 7. Audit Logging & Export Reporting
* **ActivityLogs**: Complete change log of all policy modifications, manual balance adjustments, user role updates, and attendance corrections.
* **EmailLogs**: Delivery audit trail for every notification dispatched.
* **Institute Reports**: Monthly, multi-month, custom range, and annual attendance and leave reports with CSV export protected against formula injection (CWE-1236).

---

## 3. Technology Stack

| Component | Technology | Version | Purpose |
|---|---|---|---|
| **Frontend Framework** | React | `^19.3.1` | Modern UI layer with React hooks & context |
| **Build Tooling** | Vite | `^8.3.5` | Fast ESM development & native bundling |
| **Styling** | Tailwind CSS | `^4.3.3` | Utility-first CSS styling engine |
| **Icons** | Lucide React | `^1.65.0` | Comprehensive UI iconography |
| **Routing** | React Router | `^7.18.5` | Client-side declarative routing & route guards |
| **Backend Runtime** | Node.js | `>=18.0.0` (LTS) | Asynchronous server execution |
| **HTTP Framework** | Express.js | `^4.21.2` | RESTful API server |
| **Language** | TypeScript | `^5.7.3` | Type safety across backend and frontend |
| **Google Client** | `googleapis` / `google-auth-library` | `^144.0.0` | Google Sheets & Drive API integration |
| **Email Transport** | Nodemailer | `^10.5.0` | Transactional email notification delivery |
| **Security** | `jsonwebtoken` + `cookie-parser` | Latest | Signed HTTP-only session tokens & cookies |

---

## 4. Repository File Organization

```
tc-tracker/
├── package.json                 # Root script orchestrator (install, build, test, start)
├── render.yaml                  # Render Production Blueprint deployment manifest
├── docker-compose.yml           # Unified multi-container Docker compose orchestration
├── .env.example                 # Root full-stack development environment template
├── .gitignore                   # Security exclusion rules
├── backend/
│   ├── Dockerfile               # Multi-stage production container build
│   ├── .dockerignore            # Container build exclusion list
│   ├── .env.example             # Backend-specific environment template
│   ├── package.json             # Backend dependencies and scripts
│   ├── tsconfig.json            # Node ESM TypeScript configuration
│   └── src/
│       ├── app.ts               # Express configuration, CORS, and middleware mount
│       ├── index.ts             # Server entry point & port listener
│       ├── config/
│       │   ├── env.config.ts    # Typed environment variables & secrets validation
│       │   └── sheets.config.ts # Database worksheet schemas and canonical headers
│       ├── controllers/         # REST request handlers (Auth, Attendance, Leave, Report, Users)
│       ├── middlewares/         # Auth, CSRF, Origin, RateLimiter, Role, ErrorHandler
│       ├── routes/              # Express API route modules
│       ├── services/            # Core business logic (Sheets, Drive, Attendance, Leave, Policy)
│       ├── scripts/             # CLI admin utilities (addUser, backup, initDatabase)
│       ├── tests/               # 179 Automated Unit and Integration Tests
│       ├── types/               # Database row interfaces & Express Request extensions
│       ├── utils/               # Password hashing, HMAC pepper, OTP, token generation
│       └── validation/          # Schema header, email, date, and status validators
└── frontend/
    ├── vercel.json              # Vercel SPA rewrite rules and HTTP security headers
    ├── .env.example             # Frontend environment variables template
    ├── package.json             # Frontend dependencies and build scripts
    ├── vite.config.ts           # Vite bundler configuration with Tailwind CSS v4
    └── src/
        ├── App.tsx              # Application layout & authenticated route structure
        ├── main.tsx             # React DOM root mounting
        ├── components/          # Modular UI components (Attendance, Auth, Common, Dashboard)
        ├── context/             # AuthContext (session state) & ToastContext
        ├── pages/               # Application views (Dashboard, Attendance, Leave, Reports, Doctor)
        ├── services/            # Centralized API client (`api.ts`), caching & CSRF injection
        └── tests/               # 69 Frontend and RBAC Route Protection Tests
```

---

## 5. Google Cloud & Workspace Setup Guide

### A. Google Sheets API & Service Account
1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project (e.g., `tc-tracker-prod`).
2. Navigate to **APIs & Services > Library**, search for **Google Sheets API**, and click **Enable**.
3. Navigate to **APIs & Services > Credentials > Create Credentials > Service Account**:
   - Name: `tc-tracker-sheets-sa`
   - Role: Leave default or assign **Editor**.
4. Click on the created service account, go to the **Keys** tab, click **Add Key > Create new key**, and choose **JSON**.
5. Save the downloaded JSON file. Open it to retrieve:
   - `client_email` ➔ `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` ➔ `GOOGLE_PRIVATE_KEY`
6. Create a new Google Spreadsheet in Google Drive:
   - Extract the ID from the URL (`https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`) ➔ `GOOGLE_SPREADSHEET_ID`.
   - Click the green **Share** button on the Google Sheet and grant **Editor** access to your `client_email`.

### B. Google Drive API & Automated Backup Setup
1. In Google Cloud Console, navigate to **APIs & Services > Library**, search for **Google Drive API**, and click **Enable**.
2. **Quota Note for Service Accounts**: Google Workspace does not allocate individual storage quotas to Service Accounts.
   - **Recommended**: Create a folder in a **Google Shared Drive** or standard drive, click **Share**, and grant **Editor** or **Content Manager** access to your service account email.
   - Copy the Folder ID from the URL ➔ `GOOGLE_DRIVE_BACKUP_FOLDER_ID`.
   - If no folder is configured, the system automatically falls back to local timestamped JSON snapshots in `backend/backups/`.

### C. Google OAuth 2.0 Web Client
1. Navigate to **APIs & Services > OAuth consent screen**:
   - User Type: **Internal** (Workspace members) or **External** (Public/Test users).
   - Scopes: `openid`, `email`, `profile`.
2. Navigate to **APIs & Services > Credentials > Create Credentials > OAuth client ID**:
   - Application Type: **Web application**.
   - **Authorized JavaScript origins**:
     - Local: `http://localhost:5173`
     - Production: `https://your-frontend-domain.vercel.app`
   - **Authorized redirect URIs**:
     - Local: `http://localhost:5000/api/auth/google/callback`
     - Production: `https://your-backend-api.onrender.com/api/auth/google/callback`
3. Copy the generated credentials:
   - Client ID ➔ `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID`
   - Client Secret ➔ `GOOGLE_CLIENT_SECRET`

### D. Email Notification Setup

#### Option 1: Google Apps Script Web App (Recommended - Zero Third-Party Services)
Cloud platforms like Render, AWS EC2, and DigitalOcean block outbound SMTP ports 25, 465, and 587. Google Apps Script communicates via HTTPS (Port 443), which is **never blocked by cloud firewalls**, and dispatches emails directly from your own Google account without any third-party services.
1. Open your database Google Sheet > **Extensions** > **Apps Script**.
2. Paste the provided webhook script and click **Deploy** > **New deployment** (Type: *Web app*, Execute as: *Me*, Access: *Anyone*).
3. Set the following environment variables in your Render Dashboard (or `backend/.env`):
   - `EMAIL_PROVIDER=google_script`
   - `APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbx.../exec`
   - `ADMIN_GMAIL=admin@institute.org`

#### Option 2: Gmail SMTP App Password (Local Development / Unblocked Hosts)
To send notifications via Gmail SMTP:
1. Enable **2-Step Verification** on the sending Google Account: [myaccount.google.com/security](https://myaccount.google.com/security).
2. Generate an **App Password**: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
   - App: *Mail* | Device: *Server / TC Tracker*.
3. Copy the 16-character code ➔ `GMAIL_APP_PASSWORD`.
4. Enter sender email in `GMAIL_USER` and recipient admin email in `ADMIN_GMAIL`.

---

## 6. Environment Variables Reference

### Backend Configuration (`backend/.env`)

| Variable | Required | Description | Example |
|---|---|---|---|
| `PORT` | Optional | Port for the backend API | `5000` |
| `NODE_ENV` | Yes | Environment mode (`development`, `production`, `test`) | `production` |
| `FRONTEND_URL` | Yes | Trusted frontend origin for CORS & CSRF | `https://tc-tracker.vercel.app` |
| `SESSION_SECRET` | Yes | Secret key for signing HTTP-only cookies (min 32 chars) | `32_char_cryptographic_random_string` |
| `PASSWORD_PEPPER` | Yes | Server-side HMAC pepper for password hashes (min 32 chars) | `32_char_cryptographic_random_string` |
| `COOKIE_SAME_SITE` | Yes | Cookie SameSite attribute (`lax` for local, `none` for cross-site) | `none` |
| `COOKIE_SECURE` | Yes | Require HTTPS for session cookies (`true` in production) | `true` |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth 2.0 Web Client ID | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth 2.0 Client Secret | `GOCSPX-xxxxxx` |
| `GOOGLE_REDIRECT_URI` | Yes | OAuth callback endpoint | `https://tc-tracker.onrender.com/api/auth/google/callback` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Yes | Google Service Account email | `tc-tracker-sa@project.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | Yes | Service Account private key with newline escapes | `"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"` |
| `GOOGLE_SPREADSHEET_ID` | Yes | Google Sheets Database ID | `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms` |
| `GOOGLE_DRIVE_BACKUP_FOLDER_ID` | Optional | Shared Drive folder ID for semi-annual backups | `19V-P3eI2jY-xxxxxx` |
| `APPS_SCRIPT_URL` | Optional | Google Apps Script Web App URL for zero-dependency email | `https://script.google.com/macros/s/.../exec` |
| `EMAIL_PROVIDER` | Optional | Email provider strategy (`google_script`, `smtp`) | `google_script` |
| `GMAIL_USER` | Optional | Sender Gmail address for SMTP notifications | `sender@gmail.com` |
| `GMAIL_APP_PASSWORD` | Optional | 16-character Gmail App Password | `abcd efgh ijkl mnop` |
| `ADMIN_GMAIL` | Optional | Recipient Admin email for leave alerts | `admin@institute.org` |

### Frontend Configuration (`frontend/.env`)

| Variable | Required | Description | Example |
|---|---|---|---|
| `VITE_API_BASE_URL` | Yes | Base URL of the backend API (without trailing slash) | `https://tc-tracker.onrender.com` |
| `VITE_GOOGLE_CLIENT_ID` | Yes | Google OAuth 2.0 Client ID (matches backend) | `xxx.apps.googleusercontent.com` |

---

## 7. Local Development Quickstart

### Prerequisites
* **Node.js**: v18.0.0 or higher
* **npm**: v9.0.0 or higher

### Step-by-Step Setup

```bash
# 1. Clone repository
git clone <repo-url>
cd "TC Tracker"

# 2. Install dependencies across backend and frontend
npm run install:all

# 3. Create environment files from templates
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 4. Fill in your credentials in backend/.env and frontend/.env

# 5. Initialize Google Sheets worksheets (first run only)
npm run db:init

# 6. Add initial Admin user via CLI
npm run user:add --prefix backend

# 7. Start both servers concurrently
# Terminal 1: Backend API (http://localhost:5000)
npm run dev:backend

# Terminal 2: Frontend SPA (http://localhost:5173)
npm run dev:frontend
```

Verify backend health by browsing to `http://localhost:5000/api/health`.

---

## 8. Production Deployment Blueprints

### Blueprint A: Vercel (Frontend) + Render (Backend) [Recommended]

This is the recommended deployment pattern offering zero infrastructure maintenance.

#### 1. Deploy Backend to Render
1. Create an account at [Render.com](https://render.com/).
2. Connect your Git repository.
3. Choose **Blueprint** deployment (Render automatically detects `render.yaml` at the root).
4. Fill in the environment variables marked with `sync: false` in the Render dashboard:
   - `FRONTEND_URL`: URL of your Vercel deployment (e.g. `https://tc-tracker.vercel.app`).
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SPREADSHEET_ID`.
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
   - `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `ADMIN_GMAIL`.
5. Trigger manual deploy. Once active, note the backend service URL (e.g., `https://tc-tracker-backend.onrender.com`).

#### 2. Deploy Frontend to Vercel
1. Create an account at [Vercel.com](https://vercel.com/) and import your repository.
2. Select **Root Directory**: `frontend`.
3. Framework Preset: **Vite** (auto-detected).
4. Add Environment Variables:
   - `VITE_API_BASE_URL`: `https://tc-tracker-backend.onrender.com`
   - `VITE_GOOGLE_CLIENT_ID`: Your Google OAuth Client ID.
5. Click **Deploy**. Vercel will build the frontend using `frontend/vercel.json`.

---

### Blueprint B: Docker & Docker Compose (Self-Hosted / VPS)

For single-server deployment on Ubuntu, Debian, AWS EC2, DigitalOcean, or Hetzner:

```bash
# 1. Clone project onto your server
git clone <repo-url> /var/www/tc-tracker
cd /var/www/tc-tracker

# 2. Create production .env file
cp .env.example .env
nano .env

# 3. Build and launch container in background
docker compose up -d --build

# 4. Inspect container health
docker compose ps
docker compose logs -f backend
```

---

### Blueprint C: Linux VPS (Ubuntu / PM2 / Nginx)

```bash
# 1. Install Node.js 22 LTS & PM2
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm install -g pm2

# 2. Clone & Build
cd /var/www/tc-tracker
npm run install:all
npm run build:backend
npm run build:frontend

# 3. Start Backend with PM2
pm2 start backend/dist/index.js --name "tc-tracker-api"
pm2 save
pm2 startup

# 4. Configure Nginx to serve frontend dist and reverse-proxy /api
sudo nano /etc/nginx/sites-available/tc-tracker
```

Sample Nginx Configuration:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend Static Build
    location / {
        root /var/www/tc-tracker/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API Reverse Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

### Cross-Origin Cookie & CORS Essentials

When the frontend and backend are hosted on separate domains (e.g. `vercel.app` and `onrender.com`), browsers enforce strict cross-site cookie partitioning. Ensure these settings are active in your production backend environment:

```env
FRONTEND_URL=https://your-frontend-app.vercel.app
COOKIE_SAME_SITE=none
COOKIE_SECURE=true
```

The backend automatically applies:
- `credentials: true` on CORS origins.
- `SameSite=None; Secure; HttpOnly` on authentication and CSRF cookies.
- Origin and Referer validation on state-modifying requests (`POST`, `PUT`, `PATCH`, `DELETE`).

---

## 9. Database Administration, Diagnostics & Recovery

### Database Doctor (Web UI)
Administrators can navigate to **Admin Panel > Database Doctor** (`/admin/database-doctor`):
- **Real-Time Health Inspection**: Verifies existence and header validity for all 8 worksheets.
- **One-Click Non-Destructive Repair**: Reconstructs missing worksheets or missing columns without overwriting existing data.
- **Backup Export**: Download a full JSON database snapshot directly to your local workstation.
- **Cloud Backup Trigger**: Run an immediate on-demand Google Drive backup.

### CLI Administrative Utilities

```bash
# Verify Google Sheets database connection and repair schemas
npm run db:init

# Create a manual JSON database backup snapshot
npm run db:backup

# Add or reset an employee or admin account via terminal prompt
npm run user:add --prefix backend

# Test Gmail SMTP connection and send a test notification
npm run test:email
```

---

## 10. Automated Testing & Verification

The codebase includes an extensive automated test suite covering all authentication workflows, leave calculation rules, edge cases, role guards, and report generators.

```bash
# Run complete test suite (Backend + Frontend)
npm test

# Run backend tests only (179 tests)
npm run test:backend

# Run frontend tests only (69 tests)
npm run test:frontend

# Validate TypeScript type consistency without emitting files
npm run typecheck:backend
npm run typecheck:frontend
```

### Test Coverage Highlights
* **Attendance Engine**: Daily marking, duplicate prevention, unmarking, Sunday/holiday exclusion.
* **Leave Engine**: 7-day calendar vs working day threshold, 50% carry-forward, March 31 expiration, pro-rated monthly accrual, leave request withdrawals, and special leave allocations.
* **Security & Auth**: Dual-token verification, bcrypt hashing + pepper, brute-force OTP limiters, sliding-window rate limiters, CSRF validation, and last-admin deactivation defense.
* **Diagnostics**: Header schema repair, credential masking, CWE-1236 CSV formula sanitization.

---

## License
Private & Proprietary — TC Tracker Development Team. All rights reserved.
