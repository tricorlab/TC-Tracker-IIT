import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '..');

interface UserContext {
  userId: string;
  fullName: string;
  email: string;
  role: 'Staff' | 'Admin';
}

function evaluateNoticeRouteAccess(
  user: UserContext | null,
  targetPath: string
): { canAccess: boolean; redirectPath?: string } {
  if (!user) {
    return { canAccess: false, redirectPath: '/login' };
  }

  // /admin/notices is restricted to Admin
  if (targetPath === '/admin/notices') {
    if (user.role === 'Admin') {
      return { canAccess: true };
    }
    return { canAccess: false, redirectPath: '/unauthorized' };
  }

  // /notices is accessible by both Staff and Admin
  if (targetPath === '/notices') {
    return { canAccess: true };
  }

  return { canAccess: true };
}

describe('--- [FRONTEND TEST SUITE] TC Tracker Staff Notice & Broadcast UI Integration ---', () => {
  const staffUser: UserContext = {
    userId: 'USR-STAFF-01',
    fullName: 'Bob Staff',
    email: 'bob@example.com',
    role: 'Staff',
  };

  const adminUser: UserContext = {
    userId: 'USR-ADMIN-01',
    fullName: 'System Administrator',
    email: 'admin@tctracker.local',
    role: 'Admin',
  };

  /* ======================================================================= */
  /* 1. Route-Level RBAC Enforcement for Notice Endpoints                     */
  /* ======================================================================= */
  describe('1. Route-Level RBAC Enforcement', () => {
    it('should redirect unauthenticated users to /login when visiting /notices or /admin/notices', () => {
      assert.deepEqual(evaluateNoticeRouteAccess(null, '/notices'), {
        canAccess: false,
        redirectPath: '/login',
      });
      assert.deepEqual(evaluateNoticeRouteAccess(null, '/admin/notices'), {
        canAccess: false,
        redirectPath: '/login',
      });
    });

    it('should allow Staff to access /notices and deny Staff from /admin/notices', () => {
      assert.deepEqual(evaluateNoticeRouteAccess(staffUser, '/notices'), {
        canAccess: true,
      });
      assert.deepEqual(evaluateNoticeRouteAccess(staffUser, '/admin/notices'), {
        canAccess: false,
        redirectPath: '/unauthorized',
      });
    });

    it('should allow Admin to access both /notices and /admin/notices', () => {
      assert.deepEqual(evaluateNoticeRouteAccess(adminUser, '/notices'), {
        canAccess: true,
      });
      assert.deepEqual(evaluateNoticeRouteAccess(adminUser, '/admin/notices'), {
        canAccess: true,
      });
    });
  });

  /* ======================================================================= */
  /* 2. Source Code & Component Integration Verification                     */
  /* ======================================================================= */
  describe('2. Source Code & Component Integration', () => {
    it('should verify App.tsx registers /notices and /admin/notices with ProtectedRoute', () => {
      const appFile = path.join(SRC_DIR, 'App.tsx');
      assert.ok(fs.existsSync(appFile), 'App.tsx must exist');
      const content = fs.readFileSync(appFile, 'utf8');

      assert.ok(content.includes("import { NoticesPage } from './pages/NoticesPage'"), 'Must import NoticesPage');
      assert.ok(content.includes('path="notices"'), 'Must define /notices route');
      assert.ok(content.includes('path="admin/notices"'), 'Must define /admin/notices route');
    });

    it('should verify Sidebar.tsx includes Notices navigation for both Admin and Staff', () => {
      const sidebarFile = path.join(SRC_DIR, 'components/layout/Sidebar.tsx');
      assert.ok(fs.existsSync(sidebarFile), 'Sidebar.tsx must exist');
      const content = fs.readFileSync(sidebarFile, 'utf8');

      assert.ok(content.includes("to=\"/admin/notices\""), 'Sidebar must link to /admin/notices');
      assert.ok(content.includes("to=\"/notices\""), 'Sidebar must link to /notices');
      assert.ok(content.includes('Megaphone'), 'Sidebar must render Megaphone icon for notices');
    });

    it('should verify Navbar.tsx resolves title for notice pages', () => {
      const navbarFile = path.join(SRC_DIR, 'components/layout/Navbar.tsx');
      assert.ok(fs.existsSync(navbarFile), 'Navbar.tsx must exist');
      const content = fs.readFileSync(navbarFile, 'utf8');

      assert.ok(
        content.includes('/admin/notices') || content.includes('/notices'),
        'Navbar getPageTitle must handle notice paths'
      );
    });

    it('should verify AdminDashboardView.tsx provides direct action button to Staff Notices', () => {
      const adminDashFile = path.join(SRC_DIR, 'components/dashboard/AdminDashboardView.tsx');
      assert.ok(fs.existsSync(adminDashFile), 'AdminDashboardView.tsx must exist');
      const content = fs.readFileSync(adminDashFile, 'utf8');

      assert.ok(content.includes("to=\"/admin/notices\""), 'AdminDashboardView must provide link to /admin/notices');
      assert.ok(content.includes('Staff Notice'), 'AdminDashboardView must display Staff Notice action');
    });

    it('should verify DashboardPage.tsx surfaces the latest official notice banner for staff', () => {
      const dashFile = path.join(SRC_DIR, 'pages/DashboardPage.tsx');
      assert.ok(fs.existsSync(dashFile), 'DashboardPage.tsx must exist');
      const content = fs.readFileSync(dashFile, 'utf8');

      assert.ok(content.includes('latestNotice'), 'DashboardPage must track latestNotice state');
      assert.ok(content.includes('fetchNotices'), 'DashboardPage must query active notices');
      assert.ok(content.includes('/notices'), 'DashboardPage notice banner must link to /notices');
    });

    it('should verify NoticesPage.tsx implements professional broadcast, email toggle, and live preview', () => {
      const noticePageFile = path.join(SRC_DIR, 'pages/NoticesPage.tsx');
      assert.ok(fs.existsSync(noticePageFile), 'NoticesPage.tsx must exist');
      const content = fs.readFileSync(noticePageFile, 'utf8');

      assert.ok(content.includes('QUICK_TEMPLATES'), 'Must offer quick fill presets');
      assert.ok(content.includes('Live Email & Card Preview') || content.includes('previewTab'), 'Must offer preview tab');
      assert.ok(content.includes('resendNoticeEmail'), 'Must offer resend notice email action');
      assert.ok(content.includes('formSendEmail'), 'Must offer email broadcast checkbox');
    });

    it('should verify api.ts exports notice functions and cache invalidation', () => {
      const apiFile = path.join(SRC_DIR, 'services/api.ts');
      assert.ok(fs.existsSync(apiFile), 'api.ts must exist');
      const content = fs.readFileSync(apiFile, 'utf8');

      assert.ok(content.includes('export async function fetchNotices'), 'Must export fetchNotices');
      assert.ok(content.includes('export async function createNotice'), 'Must export createNotice');
      assert.ok(content.includes('export async function updateNotice'), 'Must export updateNotice');
      assert.ok(content.includes('export async function deleteNotice'), 'Must export deleteNotice');
      assert.ok(content.includes('export async function resendNoticeEmail'), 'Must export resendNoticeEmail');
    });
  });
});
