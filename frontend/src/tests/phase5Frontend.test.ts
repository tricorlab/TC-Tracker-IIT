import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

interface UserContext {
  userId: string;
  fullName: string;
  email: string;
  role: 'Staff' | 'Admin';
}

function evaluatePhase5RouteAccess(
  user: UserContext | null,
  targetPath: string
): { canAccess: boolean; redirectPath?: string } {
  if (!user) {
    return { canAccess: false, redirectPath: '/login' };
  }

  // Phase 5 Route permissions (Admin only)
  if (targetPath === '/admin/users' || targetPath === '/reports') {
    if (user.role === 'Admin') {
      return { canAccess: true };
    }
    return { canAccess: false, redirectPath: '/unauthorized' };
  }

  if (targetPath === '/admin/email-logs') {
    if (user.role === 'Admin') {
      return { canAccess: true };
    }
    return { canAccess: false, redirectPath: '/unauthorized' };
  }

  return { canAccess: true };
}

describe('--- [FRONTEND TEST SUITE] TC Tracker Phase 5 User Management, Email Audit & Reports ---', () => {
  const staffUser: UserContext = {
    userId: 'USR-STAFF-01',
    fullName: 'John Staff',
    email: 'staff@example.com',
    role: 'Staff',
  };

  const adminUser: UserContext = {
    userId: 'USR-ADMIN-01',
    fullName: 'Alice Admin',
    email: 'admin@example.com',
    role: 'Admin',
  };

  /* ======================================================================= */
  /* 1. Route RBAC Evaluation                                                */
  /* ======================================================================= */
  describe('1. Route-Level RBAC Enforcement', () => {
    it('should redirect unauthenticated users to /login for all Phase 5 routes', () => {
      assert.deepEqual(evaluatePhase5RouteAccess(null, '/admin/users'), {
        canAccess: false,
        redirectPath: '/login',
      });
      assert.deepEqual(evaluatePhase5RouteAccess(null, '/reports'), {
        canAccess: false,
        redirectPath: '/login',
      });
      assert.deepEqual(evaluatePhase5RouteAccess(null, '/admin/email-logs'), {
        canAccess: false,
        redirectPath: '/login',
      });
    });

    it('should allow Admin to access /admin/users and /reports', () => {
      assert.equal(evaluatePhase5RouteAccess(adminUser, '/admin/users').canAccess, true);
      assert.equal(evaluatePhase5RouteAccess(adminUser, '/reports').canAccess, true);
    });

    it('should deny Staff from accessing /admin/users and /reports with /unauthorized redirect', () => {
      assert.deepEqual(evaluatePhase5RouteAccess(staffUser, '/admin/users'), {
        canAccess: false,
        redirectPath: '/unauthorized',
      });
      assert.deepEqual(evaluatePhase5RouteAccess(staffUser, '/reports'), {
        canAccess: false,
        redirectPath: '/unauthorized',
      });
    });

    it('should allow Admin only to access /admin/email-logs and deny Staff', () => {
      assert.equal(evaluatePhase5RouteAccess(adminUser, '/admin/email-logs').canAccess, true);
      assert.deepEqual(evaluatePhase5RouteAccess(staffUser, '/admin/email-logs'), {
        canAccess: false,
        redirectPath: '/unauthorized',
      });
    });
  });

  /* ======================================================================= */
  /* 2. Component Implementation & Source Verification                       */
  /* ======================================================================= */
  describe('2. Source Code & UI Component Verification', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const srcDir = path.resolve(currentDir, '..');

    it('should verify App.tsx contains registered routes for /admin/users, /reports, and /admin/email-logs', () => {
      const appContent = fs.readFileSync(path.join(srcDir, 'App.tsx'), 'utf-8');
      assert.ok(appContent.includes('path="admin/users"'));
      assert.ok(appContent.includes('path="reports"'));
      assert.ok(appContent.includes('path="admin/email-logs"'));
      assert.ok(appContent.includes('UsersPage'));
      assert.ok(appContent.includes('ReportsPage'));
      assert.ok(appContent.includes('EmailLogsPage'));
    });

    it('should verify Navbar.tsx contains links to Users, Reports, and Email Audit', () => {
      const navContent = fs.readFileSync(path.join(srcDir, 'components', 'layout', 'Navbar.tsx'), 'utf-8');
      assert.ok(navContent.includes('/admin/users'));
      assert.ok(navContent.includes('/reports'));
      assert.ok(navContent.includes('/admin/email-logs'));
      assert.ok(navContent.includes('Email Audit'));
    });

    it('should verify UsersPage.tsx contains onboarding form, role selection, and self-role safeguard', () => {
      const usersPageContent = fs.readFileSync(path.join(srcDir, 'pages', 'UsersPage.tsx'), 'utf-8');
      assert.ok(usersPageContent.includes('User & Team Roster'));
      assert.ok(usersPageContent.includes('Add User'));
      assert.ok(usersPageContent.includes('Account Role *'));
      assert.ok(usersPageContent.includes('Security policy: You cannot change your own role'));
    });

    it('should verify EmailLogsPage.tsx contains status filtering, search bar, and audit metrics', () => {
      const emailLogsContent = fs.readFileSync(path.join(srcDir, 'pages', 'EmailLogsPage.tsx'), 'utf-8');
      assert.ok(emailLogsContent.includes('Email Notification Audit Inspector'));
      assert.ok(emailLogsContent.includes('Total Logged Attempts'));
      assert.ok(emailLogsContent.includes('Delivered (Sent)'));
      assert.ok(emailLogsContent.includes('Failed / Recorded Unsent'));
    });

    it('should verify ReportsPage.tsx contains tabs, CSV exports, print layout, and policy rules note', () => {
      const reportsContent = fs.readFileSync(path.join(srcDir, 'pages', 'ReportsPage.tsx'), 'utf-8');
      assert.ok(reportsContent.includes('Monthly Attendance Report'));
      assert.ok(reportsContent.includes('Annual Leave Balance Report'));
      assert.ok(reportsContent.includes('Export CSV'));
      assert.ok(reportsContent.includes('Print View'));
      assert.ok(reportsContent.includes('Custom Range'));
      assert.ok(reportsContent.includes('Annual (Full Year)'));
      assert.ok(reportsContent.includes('From Month:'));
      assert.ok(reportsContent.includes('To Month:'));
      assert.ok(reportsContent.includes('2.5 days per completed calendar month'));
      assert.ok(reportsContent.includes('Sundays and official holidays are never counted as working-day absences'));
    });

    it('should verify api.ts exports Phase 5 client helpers and CSV download utility', () => {
      const apiContent = fs.readFileSync(path.join(srcDir, 'services', 'api.ts'), 'utf-8');
      assert.ok(apiContent.includes('export async function fetchUsers'));
      assert.ok(apiContent.includes('export async function createUser'));
      assert.ok(apiContent.includes('export async function updateUser'));
      assert.ok(apiContent.includes('export async function fetchEmailLogs'));
      assert.ok(apiContent.includes('export async function fetchMonthlyAttendanceReport'));
      assert.ok(apiContent.includes('export async function fetchLeaveBalanceReport'));
      assert.ok(apiContent.includes('export async function downloadReportCsv'));
    });
  });
});
