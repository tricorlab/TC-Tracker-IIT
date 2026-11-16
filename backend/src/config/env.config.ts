import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Auto-detect test runner execution (even if .env contains NODE_ENV=development)
const isTestRunner =
  process.env.NODE_ENV === 'test' ||
  process.env.npm_lifecycle_event === 'test' ||
  process.env.npm_lifecycle_event === 'test:backend' ||
  process.execArgv.some((a) => a.includes('--test')) ||
  process.argv.some((a) => a.endsWith('.test.ts') || a.includes('.test.'));

if (isTestRunner) {
  process.env.NODE_ENV = 'test';
}

export interface EnvConfig {
  port: number;
  frontendUrl: string;
  sessionSecret: string;
  passwordPepper: string;
  isProduction: boolean;
  isTest: boolean;
  google: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    serviceAccountEmail: string;
    privateKey: string;
    spreadsheetId: string;
    driveBackupFolderId?: string;
    enableDriveBackup?: boolean;
  };
  cookie: {
    name: string;
    csrfCookieName: string;
    maxAgeMs: number;
    sameSite: 'lax' | 'none' | 'strict';
    secure: boolean;
    domain?: string;
  };
}

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';
const rawSessionSecret = process.env.SESSION_SECRET;

// Strict production requirement: SESSION_SECRET must exist and be cryptographically strong (>= 32 chars)
if (isProduction) {
  if (!rawSessionSecret) {
    throw new Error('FATAL SECURITY ERROR: SESSION_SECRET is required in production environment.');
  }
  if (rawSessionSecret.length < 32) {
    throw new Error('FATAL SECURITY ERROR: SESSION_SECRET must be at least 32 characters long in production.');
  }
} else if (!isTest) {
  if (!rawSessionSecret) {
    console.warn('[SECURITY WARNING] SESSION_SECRET is not set in environment. Using fallback development secret.');
  } else if (rawSessionSecret.length < 32) {
    console.warn('[SECURITY WARNING] SESSION_SECRET is shorter than recommended 32 characters.');
  }
}

const sessionSecret = rawSessionSecret || 'tc-tracker-dev-insecure-secret-key-change-in-production';

const rawPasswordPepper = process.env.PASSWORD_PEPPER;
if (isProduction) {
  if (!rawPasswordPepper) {
    throw new Error('FATAL SECURITY ERROR: PASSWORD_PEPPER is required in production environment.');
  }
  if (rawPasswordPepper.length < 32) {
    throw new Error('FATAL SECURITY ERROR: PASSWORD_PEPPER must be at least 32 characters long in production.');
  }
} else if (!isTest) {
  if (!rawPasswordPepper) {
    console.warn('[SECURITY WARNING] PASSWORD_PEPPER is not set in environment. Using fallback development pepper.');
  } else if (rawPasswordPepper.length < 32) {
    console.warn('[SECURITY WARNING] PASSWORD_PEPPER is shorter than recommended 32 characters.');
  }
}

const passwordPepper = rawPasswordPepper || sessionSecret;

// Cookie SameSite and Secure resolution:
// In production cross-site deployment (e.g. Vercel frontend + Render backend), SameSite=None + Secure=true is required.
// In local development, SameSite=Lax + Secure=false is standard for localhost HTTP.
const sameSiteConfig = (process.env.COOKIE_SAME_SITE as 'lax' | 'none' | 'strict') ||
  (isProduction ? 'none' : 'lax');
const secureConfig = isProduction || process.env.COOKIE_SECURE === 'true';

export const config: EnvConfig = {
  port: parseInt(process.env.PORT || '5000', 10),
  frontendUrl: (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  sessionSecret,
  passwordPepper,
  isProduction,
  isTest,
  google: {
    clientId: (process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '').replace(/^["']|["']$/g, '').trim(),
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    privateKey: process.env.GOOGLE_PRIVATE_KEY
      ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : '',
    spreadsheetId: (process.env.GOOGLE_SPREADSHEET_ID || '').replace(/^["']|["']$/g, '').trim(),
    driveBackupFolderId: (process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID || '').replace(/^["']|["']$/g, '').trim(),
    enableDriveBackup: process.env.ENABLE_GOOGLE_DRIVE_BACKUP !== 'false',
  },
  cookie: {
    name: 'tc_session',
    csrfCookieName: 'XSRF-TOKEN',
    maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: sameSiteConfig,
    secure: secureConfig,
    domain: process.env.COOKIE_DOMAIN || undefined,
  },
};
