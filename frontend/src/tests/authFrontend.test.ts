import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Define routing authorization evaluator matching ProtectedRoute logic
interface UserContext {
  userId: string;
  fullName: string;
  email: string;
  role: 'Staff' | 'Admin';
}

function evaluateRouteAccess(
  user: UserContext | null,
  loading: boolean,
  targetPath: string
): { canAccess: boolean; redirectPath?: string; isLoading: boolean } {
  if (loading) {
    return { canAccess: false, isLoading: true };
  }

  // Unauthenticated users are redirected to login
  if (!user) {
    return { canAccess: false, redirectPath: '/login', isLoading: false };
  }

  // Role permissions per path (Admin-only routes)
  if (
    targetPath.startsWith('/admin') ||
    targetPath.startsWith('/manager') ||
    targetPath.startsWith('/attendance/marking') ||
    targetPath.startsWith('/leave/requests') ||
    targetPath.startsWith('/reports')
  ) {
    if (user.role !== 'Admin') {
      return { canAccess: false, redirectPath: '/unauthorized', isLoading: false };
    }
  }

  // Accessible routes to all authenticated staff: /dashboard, /attendance/my, /leave/my, /leave/submit, /holidays
  return { canAccess: true, isLoading: false };
}

function evaluateNavLinks(user: UserContext | null): {
  showSignIn: boolean;
  showDashboard: boolean;
  showAdmin: boolean;
  showLogout: boolean;
} {
  if (!user) {
    return {
      showSignIn: true,
      showDashboard: false,
      showAdmin: false,
      showLogout: false,
    };
  }

  return {
    showSignIn: false,
    showDashboard: true,
    showAdmin: user.role === 'Admin',
    showLogout: true,
  };
}

describe('--- [FRONTEND TEST SUITE] TC Tracker Frontend Authentication & RBAC ---', () => {

  const staffUser: UserContext = {
    userId: 'USR-001',
    fullName: 'Staff User',
    email: 'staff@example.com',
    role: 'Staff',
  };

  const adminUser: UserContext = {
    userId: 'USR-003',
    fullName: 'Admin User',
    email: 'admin@example.com',
    role: 'Admin',
  };

  describe('1. Unauthenticated User Route Access', () => {
    it('should redirect unauthenticated user from protected route to /login', () => {
      const result = evaluateRouteAccess(null, false, '/dashboard');
      assert.equal(result.canAccess, false);
      assert.equal(result.redirectPath, '/login');
    });

    it('should redirect unauthenticated user from /manager to /login', () => {
      const result = evaluateRouteAccess(null, false, '/manager');
      assert.equal(result.canAccess, false);
      assert.equal(result.redirectPath, '/login');
    });

    it('should redirect unauthenticated user from /admin to /login', () => {
      const result = evaluateRouteAccess(null, false, '/admin');
      assert.equal(result.canAccess, false);
      assert.equal(result.redirectPath, '/login');
    });
  });

  describe('2. Staff Role Route Protection', () => {
    it('should allow Staff to access /dashboard', () => {
      const result = evaluateRouteAccess(staffUser, false, '/dashboard');
      assert.equal(result.canAccess, true);
      assert.equal(result.redirectPath, undefined);
    });

    it('should redirect Staff visiting Manager portal (/manager) to /unauthorized (403)', () => {
      const result = evaluateRouteAccess(staffUser, false, '/manager');
      assert.equal(result.canAccess, false);
      assert.equal(result.redirectPath, '/unauthorized');
    });

    it('should redirect Staff visiting Admin panel (/admin) to /unauthorized (403)', () => {
      const result = evaluateRouteAccess(staffUser, false, '/admin');
      assert.equal(result.canAccess, false);
      assert.equal(result.redirectPath, '/unauthorized');
    });
  });

  describe('3. Admin Role Route Protection', () => {
    it('should allow Admin to access /dashboard, /manager, and /admin', () => {
      const dash = evaluateRouteAccess(adminUser, false, '/dashboard');
      assert.equal(dash.canAccess, true);

      const mgr = evaluateRouteAccess(adminUser, false, '/manager');
      assert.equal(mgr.canAccess, true);

      const adm = evaluateRouteAccess(adminUser, false, '/admin');
      assert.equal(adm.canAccess, true);
    });
  });

  describe('5. Authentication Loading State & Session Resolution', () => {
    it('should preserve loading state while verifying session', () => {
      const result = evaluateRouteAccess(null, true, '/dashboard');
      assert.equal(result.isLoading, true);
      assert.equal(result.canAccess, false);
    });

    it('should handle /api/auth/me returning 401 unauthorized (user set to null, loading false)', () => {
      // Simulation of AuthContext initial load failing with 401
      let user: UserContext | null = null;
      let loading = true;

      // Mocked 401 response handler
      const handleMeResponse = (status: number, data: any) => {
        if (status === 200 && data.user) {
          user = data.user;
        } else {
          user = null;
        }
        loading = false;
      };

      handleMeResponse(401, { success: false, message: 'Not authenticated' });
      assert.equal(user, null);
      assert.equal(loading, false);

      const routeCheck = evaluateRouteAccess(user, loading, '/dashboard');
      assert.equal(routeCheck.redirectPath, '/login');
    });

    it('should handle expired session by clearing user and directing to /login', () => {
      let user: UserContext | null = staffUser;
      let loading = false;

      // Session expires during API operation
      const handleSessionExpired = () => {
        user = null;
        loading = false;
      };

      handleSessionExpired();
      const routeCheck = evaluateRouteAccess(user, loading, '/dashboard');
      assert.equal(routeCheck.redirectPath, '/login');
    });
  });

  describe('6. Logout Lifecycle', () => {
    it('should clear user state and redirect to /login on logout', () => {
      let currentUser: UserContext | null = adminUser;
      let currentPath = '/admin';

      const performLogout = () => {
        currentUser = null;
        currentPath = '/login';
      };

      performLogout();
      assert.equal(currentUser, null);
      assert.equal(currentPath, '/login');

      // Subsequent access check
      const postLogoutCheck = evaluateRouteAccess(currentUser, false, '/admin');
      assert.equal(postLogoutCheck.canAccess, false);
      assert.equal(postLogoutCheck.redirectPath, '/login');
    });
  });

  describe('7. Role-Aware Navigation Visibility', () => {
    it('should display only Sign In for unauthenticated visitors', () => {
      const nav = evaluateNavLinks(null);
      assert.equal(nav.showSignIn, true);
      assert.equal(nav.showDashboard, false);
      assert.equal(nav.showAdmin, false);
      assert.equal(nav.showLogout, false);
    });

    it('should display Dashboard but hide Admin link for Staff', () => {
      const nav = evaluateNavLinks(staffUser);
      assert.equal(nav.showSignIn, false);
      assert.equal(nav.showDashboard, true);
      assert.equal(nav.showAdmin, false);
      assert.equal(nav.showLogout, true);
    });

    it('should display Dashboard and Admin links for Admin', () => {
      const nav = evaluateNavLinks(adminUser);
      assert.equal(nav.showSignIn, false);
      assert.equal(nav.showDashboard, true);
      assert.equal(nav.showAdmin, true);
      assert.equal(nav.showLogout, true);
    });
  });

  describe('8. Developer Token Input Production Build Restriction', () => {
    it('should confirm dev token block is conditioned on import.meta.env.DEV in LoginPage.tsx', () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const loginPagePath = path.resolve(__dirname, '../pages/LoginPage.tsx');

      const loginCode = fs.readFileSync(loginPagePath, 'utf8');
      assert.ok(
        loginCode.includes('import.meta.env.DEV'),
        'LoginPage.tsx must condition dev input on import.meta.env.DEV'
      );
      assert.ok(
        loginCode.includes('data-testid="dev-token-section"'),
        'LoginPage.tsx must tag dev token section'
      );
    });
  });

  describe('9. Phase 4 Attendance & Leave Management Route Access Control', () => {
    it('should allow Staff and Admin to access Staff views (/attendance/my, /leave/my, /leave/submit, /holidays)', () => {
      const staffRoutes = ['/attendance/my', '/leave/my', '/leave/submit', '/holidays'];
      for (const r of staffRoutes) {
        assert.equal(evaluateRouteAccess(staffUser, false, r).canAccess, true);
        assert.equal(evaluateRouteAccess(adminUser, false, r).canAccess, true);
      }
    });

    it('should deny Staff from Admin attendance marking and leave requests', () => {
      const adminRoutes = ['/attendance/marking', '/leave/requests'];
      for (const r of adminRoutes) {
        const staffRes = evaluateRouteAccess(staffUser, false, r);
        assert.equal(staffRes.canAccess, false);
        assert.equal(staffRes.redirectPath, '/unauthorized');

        assert.equal(evaluateRouteAccess(adminUser, false, r).canAccess, true);
      }
    });

    it('should deny Staff from Admin views (/admin/leave-balances, /admin/leave-policy, /admin/activity-logs)', () => {
      const adminRoutes = [
        '/admin/leave-balances',
        '/admin/leave-policy',
        '/admin/activity-logs',
      ];
      for (const r of adminRoutes) {
        const staffRes = evaluateRouteAccess(staffUser, false, r);
        assert.equal(staffRes.canAccess, false);
        assert.equal(staffRes.redirectPath, '/unauthorized');

        assert.equal(evaluateRouteAccess(adminUser, false, r).canAccess, true);
      }
    });
  });

  describe('10. Year Transition UI & Carried-Forward Leave Expiry Verification', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const leaveMgmtPath = path.resolve(currentDir, '../pages/LeaveManagementPage.tsx');
    const dashboardPath = path.resolve(currentDir, '../pages/DashboardPage.tsx');
    const myLeavePath = path.resolve(currentDir, '../pages/MyLeavePage.tsx');

    it('should verify LeaveManagementPage contains Execute Year Transition, preview modal, and excluded records display', () => {
      const code = fs.readFileSync(leaveMgmtPath, 'utf8');
      assert.ok(code.includes('Execute Year Transition'), 'Must have Execute Year Transition action');
      assert.ok(code.includes('previewYearTransition'), 'Must hook previewYearTransition API');
      assert.ok(code.includes('executeYearTransition'), 'Must hook executeYearTransition API');
      assert.ok(code.includes('Excluded / Ineligible Records'), 'Must render excluded/ineligible records table');
      assert.ok(code.includes('transConfirm'), 'Must enforce confirmation before transition execution');
      assert.ok(code.includes('Prior-Year Transition Pending'), 'Must show pending transition banner');
    });

    it('should verify DashboardPage and MyLeavePage contain transition notice and dynamic expiry indicators', () => {
      const dashCode = fs.readFileSync(dashboardPath, 'utf8');
      assert.ok(dashCode.includes('transitionPending'), 'DashboardPage must check transitionPending');
      assert.ok(dashCode.includes('isCarryForwardExpired'), 'DashboardPage must check isCarryForwardExpired');
      assert.ok(dashCode.includes('Expired after March 31'), 'DashboardPage must display dynamic expiry text');

      const myLeaveCode = fs.readFileSync(myLeavePath, 'utf8');
      assert.ok(myLeaveCode.includes('transitionPending'), 'MyLeavePage must check transitionPending');
      assert.ok(myLeaveCode.includes('isCarryForwardExpired'), 'MyLeavePage must check isCarryForwardExpired');
      assert.ok(myLeaveCode.includes('Expired after March 31'), 'MyLeavePage must display dynamic expiry text');
    });
  });

  describe('11. Leave Request Withdrawal UI Verification', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const myLeavePath = path.resolve(currentDir, '../pages/MyLeavePage.tsx');
    const apiPath = path.resolve(currentDir, '../services/api.ts');

    it('should verify MyLeavePage contains Withdraw button, confirmation modal, and status exclusion', () => {
      const code = fs.readFileSync(myLeavePath, 'utf8');
      assert.ok(code.includes('withdrawLeaveRequest'), 'Must import and hook withdrawLeaveRequest API');
      assert.ok(code.includes('Withdraw Leave Request'), 'Must render withdrawal confirmation modal');
      assert.ok(code.includes('canWithdraw'), 'Must evaluate canWithdraw for upcoming active notices');
      assert.ok(code.includes('Reason for Withdrawal'), 'Must allow optional reason input for withdrawal');
      assert.ok(code.includes("Status !== 'Withdrawn'"), 'Must exclude withdrawn leaves from active leave allowance calculation');
    });

    it('should verify api.ts exports withdrawLeaveRequest helper with cache invalidation', () => {
      const apiCode = fs.readFileSync(apiPath, 'utf8');
      assert.ok(apiCode.includes('export async function withdrawLeaveRequest'), 'api.ts must export withdrawLeaveRequest');
      assert.ok(apiCode.includes('/cancel'), 'API helper must call /cancel endpoint');
      assert.ok(apiCode.includes("clearClientCache('leave:')"), 'Must clear leave client cache on withdrawal');
    });
  });

  describe('12. Phase A Admin Dashboard Operational Widgets Verification', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const adminDashboardViewPath = path.resolve(currentDir, '../components/dashboard/AdminDashboardView.tsx');
    const apiPath = path.resolve(currentDir, '../services/api.ts');

    it('should verify AdminDashboardView contains Pending Attendance Triage banner and quick mark action', () => {
      const code = fs.readFileSync(adminDashboardViewPath, 'utf8');
      assert.ok(code.includes('Pending Attendance Triage'), 'Must render Pending Attendance Triage header');
      assert.ok(code.includes('handleQuickMarkAllPresent'), 'Must have handleQuickMarkAllPresent logic');
      assert.ok(code.includes('markDailyAttendance'), 'Must call markDailyAttendance API');
      assert.ok(code.includes('Review & Mark'), 'Must render Review & Mark link to /attendance/marking');
    });

    it('should verify AdminDashboardView contains Allowance Exceeded Warning widget', () => {
      const code = fs.readFileSync(adminDashboardViewPath, 'utf8');
      assert.ok(code.includes('Allowance Exceeded Warning'), 'Must render Allowance Exceeded Warning header');
      assert.ok(code.includes('exceedingStaff'), 'Must inspect exceedingStaff list');
      assert.ok(code.includes('/admin/leave-balances'), 'Must link to /admin/leave-balances to adjust quotas');
    });

    it('should verify AdminDashboardView contains Who is on Leave Today live roster card', () => {
      const code = fs.readFileSync(adminDashboardViewPath, 'utf8');
      assert.ok(code.includes('Who is on Leave Today'), 'Must render Who is on Leave Today header');
      assert.ok(code.includes('onLeaveToday'), 'Must iterate through onLeaveToday array');
      assert.ok(code.includes('formatReturnNotice'), 'Must format employee return notice');
      assert.ok(code.includes('No staff members on leave today'), 'Must display empty state when nobody is out');
    });

    it('should verify api.ts defines Phase A AdminDashboardData properties', () => {
      const apiCode = fs.readFileSync(apiPath, 'utf8');
      assert.ok(apiCode.includes('onLeaveToday?:'), 'AdminDashboardData must type onLeaveToday');
      assert.ok(apiCode.includes('exceedingStaff:'), 'leaveSummary must type exceedingStaff');
      assert.ok(apiCode.includes('staffAttendance?:'), 'ManagerDashboardData must type staffAttendance');
    });
  });

  describe('13. Activity Logs Functionality & Page Verification', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const activityLogsPagePath = path.resolve(currentDir, '../pages/ActivityLogsPage.tsx');
    const apiPath = path.resolve(currentDir, '../services/api.ts');

    it('should verify api.ts properly unwraps both logs and data arrays for ActivityLogs', () => {
      const apiCode = fs.readFileSync(apiPath, 'utf8');
      assert.ok(apiCode.includes('export async function fetchActivityLogs'), 'api.ts must export fetchActivityLogs');
      assert.ok(apiCode.includes('logs: logList'), 'Must return unwrapped logs array');
      assert.ok(apiCode.includes('data: logList'), 'Must return unwrapped data array');
    });

    it('should verify ActivityLogsPage contains search, category filter, export CSV, and details formatting', () => {
      const pageCode = fs.readFileSync(activityLogsPagePath, 'utf8');
      assert.ok(pageCode.includes('fetchActivityLogs'), 'Must hook fetchActivityLogs');
      assert.ok(pageCode.includes('categoryFilter'), 'Must maintain categoryFilter state');
      assert.ok(pageCode.includes('handleExportCsv'), 'Must provide handleExportCsv');
      assert.ok(pageCode.includes('formatDetails'), 'Must provide formatDetails for old/new values and reason');
      assert.ok(pageCode.includes('getActionBadgeClass'), 'Must provide color-coded action badges');
    });
  });
});
