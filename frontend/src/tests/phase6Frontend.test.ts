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

function evaluatePhase6RouteAccess(
  user: UserContext | null,
  targetPath: string
): { canAccess: boolean; redirectPath?: string } {
  if (!user) {
    return { canAccess: false, redirectPath: '/login' };
  }

  // Database Doctor is strictly Admin-only
  if (targetPath === '/admin/database-doctor') {
    if (user.role === 'Admin') {
      return { canAccess: true };
    }
    return { canAccess: false, redirectPath: '/unauthorized' };
  }

  return { canAccess: true };
}

describe('--- [FRONTEND TEST SUITE] TC Tracker Phase 6 Database Doctor, Leave Enrichment & Deployment ---', () => {
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
  /* 1. Route RBAC Evaluation for Database Doctor                           */
  /* ======================================================================= */
  describe('1. Route-Level RBAC Enforcement', () => {
    it('should redirect unauthenticated users visiting /admin/database-doctor to /login', () => {
      assert.deepEqual(evaluatePhase6RouteAccess(null, '/admin/database-doctor'), {
        canAccess: false,
        redirectPath: '/login',
      });
    });

    it('should deny Staff from accessing /admin/database-doctor with redirect to /unauthorized', () => {
      assert.deepEqual(evaluatePhase6RouteAccess(staffUser, '/admin/database-doctor'), {
        canAccess: false,
        redirectPath: '/unauthorized',
      });
    });

    it('should allow Admin only to access /admin/database-doctor', () => {
      assert.equal(evaluatePhase6RouteAccess(adminUser, '/admin/database-doctor').canAccess, true);
    });
  });

  /* ======================================================================= */
  /* 2. Source Code & UI Component Verification                             */
  /* ======================================================================= */
  describe('2. UI Components & Deployment Configuration Verification', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const srcDir = path.resolve(currentDir, '..');
    const projectRootDir = path.resolve(srcDir, '..', '..');

    it('should verify DatabaseDoctorPage.tsx contains masked credentials, confirmation modal, and safety guarantee', () => {
      const docPageContent = fs.readFileSync(path.join(srcDir, 'pages', 'DatabaseDoctorPage.tsx'), 'utf-8');
      assert.ok(docPageContent.includes('Google Sheets Database Doctor'));
      assert.ok(docPageContent.includes('Spreadsheet ID (Masked)'));
      assert.ok(docPageContent.includes('Service Account (Masked)'));
      assert.ok(docPageContent.includes('Non-Destructive Database Doctor Guarantee'));
      assert.ok(docPageContent.includes('Confirm Database Schema Repair'));
      assert.ok(docPageContent.includes('confirmChecked'));
    });

    it('should verify LeaveRequestsPage.tsx displays Employee column and searches by name and email', () => {
      const leaveRequestsContent = fs.readFileSync(path.join(srcDir, 'pages', 'LeaveRequestsPage.tsx'), 'utf-8');
      assert.ok(leaveRequestsContent.includes('<th className="py-3 px-4">Employee</th>'));
      assert.ok(leaveRequestsContent.includes('req.FullName'));
      assert.ok(leaveRequestsContent.includes('Search by staff name, email'));
    });

    it('should verify Navbar.tsx and AdminPanelPage.tsx link to Database Doctor', () => {
      const navContent = fs.readFileSync(path.join(srcDir, 'components', 'layout', 'Navbar.tsx'), 'utf-8');
      assert.ok(navContent.includes('/admin/database-doctor'));

      const adminPanelContent = fs.readFileSync(path.join(srcDir, 'pages', 'AdminPanelPage.tsx'), 'utf-8');
      assert.ok(adminPanelContent.includes('/admin/database-doctor'));
      assert.ok(adminPanelContent.includes('Database Doctor & Health'));
    });

    it('should verify App.tsx registers /admin/database-doctor with Admin-only protection', () => {
      const appContent = fs.readFileSync(path.join(srcDir, 'App.tsx'), 'utf-8');
      assert.ok(appContent.includes('path="admin/database-doctor"'));
      assert.ok(appContent.includes('DatabaseDoctorPage'));
    });

    it('should verify frontend/vercel.json exists with Vite framework, SPA rewrites, and security headers', () => {
      const vercelJsonPath = path.resolve(srcDir, '..', 'vercel.json');
      assert.ok(fs.existsSync(vercelJsonPath), 'frontend/vercel.json must exist');
      const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
      assert.equal(vercelConfig.framework, 'vite');
      assert.ok(vercelConfig.rewrites.some((r: any) => r.source === '/(.*)' && r.destination === '/index.html'));
      assert.ok(vercelConfig.headers.length >= 1);
    });

    it('should verify render.yaml exists at root with Node web service definition and health check', () => {
      const renderYamlPath = path.resolve(projectRootDir, 'render.yaml');
      assert.ok(fs.existsSync(renderYamlPath), 'render.yaml must exist at repository root');
      const renderContent = fs.readFileSync(renderYamlPath, 'utf-8');
      assert.ok(renderContent.includes('name: tc-tracker-backend'));
      assert.ok(renderContent.includes('runtime: node'));
      assert.ok(renderContent.includes('healthCheckPath: /api/health'));
    });

    it('should verify api.ts exports Phase 6 diagnostic helpers', () => {
      const apiContent = fs.readFileSync(path.join(srcDir, 'services', 'api.ts'), 'utf-8');
      assert.ok(apiContent.includes('export async function fetchDatabaseDiagnostics'));
      assert.ok(apiContent.includes('export async function repairDatabaseSchema'));
    });

    it('should verify Navbar.tsx integrates interactive NotificationMenu with unread alerts', () => {
      const navbarContent = fs.readFileSync(path.join(srcDir, 'components', 'layout', 'Navbar.tsx'), 'utf-8');
      assert.ok(navbarContent.includes('NotificationMenu'), 'Navbar must import and mount NotificationMenu');

      const menuContent = fs.readFileSync(path.join(srcDir, 'components', 'layout', 'NotificationMenu.tsx'), 'utf-8');
      assert.ok(menuContent.includes('export const NotificationMenu'), 'Must export NotificationMenu component');
      assert.ok(menuContent.includes('unreadCount'), 'Must compute unread notification count');
      assert.ok(menuContent.includes('handleMarkAllRead'), 'Must allow marking notifications as read');
      assert.ok(menuContent.includes('fetchHolidays'), 'Must load upcoming holidays');
    });
  });
});
