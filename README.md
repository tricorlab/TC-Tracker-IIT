# TC Tracker – Private Attendance & Leave Management System

TC Tracker is a private employee attendance and leave management platform. It uses a modern decoupled architecture featuring a React SPA frontend, an Express.js REST API backend, and Google Sheets as its primary database accessed via the Google Sheets API.

---

## 1. Project Architecture

TC Tracker uses a decoupled client-server architecture:

```
┌─────────────────────────────────┐           ┌─────────────────────────────────┐
│        Frontend (React SPA)     │           │       Backend (Express API)     │
│  - Vite + React + TypeScript    │  REST     │  - Node.js + Express            │
│  - Tailwind CSS + Lucide Icons  │ ────────> │  - Google Auth Token Verify     │
│  - Hosted on Vercel             │  (JSON)   │  - Google Service Account Client│
└─────────────────────────────────┘           │  - Hosted on Render             │
                                              └────────────────┬────────────────┘
                                                               │
                                                               │ Google Sheets API v4
                                                               │ (Service Account Auth)
                                                               v
                                              ┌─────────────────────────────────┐
                                              │      Google Sheets Database     │
                                              │  - Worksheets: Users,           │
                                              │    Attendance, Leaves, Settings │
                                              │  - Private backend-only access  │
                                              └─────────────────────────────────┘
```

> **Important Architectural Principles:**
> - **Google Sheets as Primary Database:** All persistent records (Users, Attendance, Leaves, Settings) are stored in Google Sheets.
> - **Zero Database / ORM Bloat:** Firebase is **NOT** used. PostgreSQL is **NOT** used. Prisma ORM is **NOT** used.
> - **Security Isolation:** Google Service Account credentials and private keys remain strictly on the backend and are never exposed to the frontend or git.

---

## 2. Approved Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, Vite, TypeScript, Tailwind CSS, React Router, Lucide React |
| **Backend** | Node.js, Express.js, TypeScript, REST APIs |
| **Database** | Google Sheets via Google Sheets API v4 |
| **Authentication** | Google OAuth 2.0 (Identity token backend verification via `google-auth-library`) |
| **Email Service** | Gmail API / SMTP (Prepared for Phase 2 notification workflows) |
| **Hosting & Deployment** | Frontend: **Vercel** / Backend: **Render** |

---

## 3. Folder Structure

```
D:\TC Tracker\
├── .env.example                # Root environment variables template
├── .gitignore                  # Git ignore rules protecting credentials and artifacts
├── package.json                # Root orchestration scripts
├── README.md                   # Complete architectural documentation
├── backend/
│   ├── .env.example            # Backend environment variables template
│   ├── package.json            # Backend dependencies and scripts
│   ├── tsconfig.json           # TypeScript configuration for Node ESM
│   └── src/
│       ├── app.ts              # Express application setup, CORS, and routing
│       ├── index.ts            # Server bootstrap and port listening
│       ├── config/
│       │   ├── env.config.ts   # Typed environment variable loader
│       │   └── sheets.config.ts# Worksheet name definitions (Users, Attendance, etc.)
│       ├── middlewares/
│       │   ├── auth.middleware.ts        # Google ID Token verification middleware
│       │   ├── errorHandler.middleware.ts# Centralized error handler
│       │   └── role.middleware.ts        # Role-based access control middleware
│       ├── routes/
│       │   ├── health.routes.ts          # Health check route (GET /api/health)
│       │   └── index.ts                  # REST API root router
│       ├── services/
│       │   ├── googleAuth.service.ts     # Google OAuth 2.0 token verification service
│       │   └── googleSheets.service.ts   # Modular Google Sheets API client & helpers
│       └── types/
│           └── express.d.ts              # Express Request type extensions
└── frontend/
    ├── .env.example            # Frontend environment variables template
    ├── package.json            # Frontend dependencies and scripts
    ├── tsconfig.json           # Frontend TypeScript configuration
    ├── vite.config.ts          # Vite configuration with React & Tailwind CSS
    └── src/
        ├── App.tsx             # React Router routing configuration
        ├── main.tsx            # React application entry point
        ├── index.css           # Tailwind CSS imports and root styles
        ├── components/
        │   └── layout/
        │       ├── AppLayout.tsx # Main application layout container
        │       ├── Footer.tsx    # App footer
        │       └── Navbar.tsx    # App header navigation and branding
        ├── pages/
        │   ├── HomePage.tsx      # Application shell landing & live API health check
        │   └── NotFoundPage.tsx  # 404 Not Found fallback page
        └── services/
            └── api.ts            # Centralized API service for backend communication
```

---

## 4. Windows Installation Instructions

### Prerequisites
- **Node.js**: v18.0.0 or higher (Tested with v24.20.0)
- **npm**: v9.0.0 or higher (Tested with v11.19.0)
- **Git** for Windows

### Step-by-Step Setup
1. **Navigate to the Project Directory** (PowerShell or Command Prompt):
   ```powershell
   cd "D:\TC Tracker"
   ```

2. **Install Backend Dependencies**:
   ```powershell
   cd backend
   npm install
   cd ..
   ```

3. **Install Frontend Dependencies**:
   ```powershell
   cd frontend
   npm install
   cd ..
   ```
   *(Alternatively, run `npm run install:all` from the root directory).*

---

## 5. Environment Variables Configuration

Copy `.env.example` to `.env` in the `backend/` directory or at root:

```powershell
cp .env.example backend\.env
```

### Backend Variables (`backend/.env`)

| Variable | Description | Example |
|---|---|---|
| `PORT` | Local backend HTTP server port | `5000` |
| `FRONTEND_URL` | Allowed CORS origin (Frontend URL) | `http://localhost:5173` |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth 2.0 Client ID | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth 2.0 Client Secret | `GOCSPX-xxxxxx` |
| `GOOGLE_REDIRECT_URI` | Google OAuth callback URI | `http://localhost:5000/api/auth/google/callback` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google Cloud Service Account email | `tc-tracker-sa@project-id.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | Private key from Service Account JSON keyfile | `"-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"` |
| `GOOGLE_SPREADSHEET_ID` | ID extracted from the Google Sheets URL | `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms` |

### Frontend Variables (`frontend/.env`)

| Variable | Description | Example |
|---|---|---|
| `VITE_API_BASE_URL` | Base URL of the backend REST API | `http://localhost:5000` |

---

## 6. Startup Commands

### Running Backend
In a terminal window:
```powershell
cd "D:\TC Tracker\backend"
npm run dev
```
The server will start at `http://localhost:5000`.

To verify health:
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/health" -Method Get
```
Response:
```json
{
  "success": true,
  "message": "TC Tracker API is running"
}
```

### Running Frontend
In another terminal window:
```powershell
cd "D:\TC Tracker\frontend"
npm run dev
```
Open `http://localhost:5173` in your web browser.

### Root Convenience Commands
From `D:\TC Tracker`:
- Run Backend Dev: `npm run dev:backend`
- Run Frontend Dev: `npm run dev:frontend`
- Build All: `npm run build`
- Type Check All: `npm run typecheck:backend && npm run typecheck:frontend`

---

## 7. Google Cloud Project Prerequisites

1. **Create or Select a Google Cloud Project**:
   - Go to the [Google Cloud Console](https://console.cloud.google.com/).
   - Create a project (e.g., `tc-tracker-prod`).

2. **Configure OAuth Consent Screen**:
   - Navigate to **APIs & Services** > **OAuth consent screen**.
   - Select **Internal** (if Google Workspace organization) or **External** (add test users).
   - Fill in application details (App name: *TC Tracker*, developer email).
   - Scopes: `openid`, `email`, `profile`.

3. **Create OAuth 2.0 Client Credentials**:
   - Navigate to **APIs & Services** > **Credentials** > **Create Credentials** > **OAuth Client ID**.
   - Application type: **Web application**.
   - Authorized JavaScript origins: `http://localhost:5173`, your Vercel deployment domain.
   - Authorized redirect URIs: `http://localhost:5000/api/auth/google/callback`, your Render backend callback domain.
   - Copy the generated `Client ID` and `Client Secret` to `backend/.env`.

---

## 8. Google Sheets API Prerequisites

1. **Enable Google Sheets API**:
   - In Google Cloud Console, navigate to **APIs & Services** > **Library**.
   - Search for **Google Sheets API** and click **Enable**.

2. **Create a Service Account**:
   - Navigate to **APIs & Services** > **Credentials** > **Create Credentials** > **Service Account**.
   - Name: `tc-tracker-sheets-service`.
   - Role: **Viewer** / **Editor** (or leave default for spreadsheet-level sharing).

3. **Generate a Service Account Key**:
   - Open the created service account > **Keys** tab > **Add Key** > **Create new key** (JSON format).
   - Download the JSON key file.
   - Extract `client_email` and set `GOOGLE_SERVICE_ACCOUNT_EMAIL` in `backend/.env`.
   - Extract `private_key` and set `GOOGLE_PRIVATE_KEY` in `backend/.env`.

4. **Prepare the Google Spreadsheet**:
   - Create a new Google Spreadsheet in Google Drive.
   - Copy the Spreadsheet ID from the browser URL:
     `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`
   - Set `GOOGLE_SPREADSHEET_ID` in `backend/.env`.
   - **Crucial Step**: Click **Share** on the Google Spreadsheet and grant **Editor** access to the Service Account email (`GOOGLE_SERVICE_ACCOUNT_EMAIL`).
   - *(Worksheet schema creation is deferred to Phase 2).*

---

## 9. Deployment Architecture

### Frontend Deployment (Vercel)
- **Platform**: Vercel
- **Framework Preset**: Vite
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_API_BASE_URL`: URL of the deployed Render backend (e.g., `https://tc-tracker-api.onrender.com`).

### Backend Deployment (Render)
- **Platform**: Render
- **Environment**: Node
- **Root Directory**: `backend`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start` (or `node dist/index.js`)
- **Environment Variables**: Set all production values from `backend/.env.example` in the Render dashboard.
