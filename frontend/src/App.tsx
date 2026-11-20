import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';
import { DashboardPage } from './pages/DashboardPage';
import { MyAttendancePage } from './pages/MyAttendancePage';
import { MyLeavePage } from './pages/MyLeavePage';
import { SubmitLeavePage } from './pages/SubmitLeavePage';
import { AttendanceMarkingPage } from './pages/AttendanceMarkingPage';
import { LeaveRequestsPage } from './pages/LeaveRequestsPage';
import { HolidaysPage } from './pages/HolidaysPage';
import { ManagerPortalPage } from './pages/ManagerPortalPage';
import { AdminPanelPage } from './pages/AdminPanelPage';
import { LeaveManagementPage } from './pages/LeaveManagementPage';
import { LeavePolicyPage } from './pages/LeavePolicyPage';
import { ActivityLogsPage } from './pages/ActivityLogsPage';
import { UsersPage } from './pages/UsersPage';
import { EmailLogsPage } from './pages/EmailLogsPage';
import { ReportsPage } from './pages/ReportsPage';
import { DatabaseDoctorPage } from './pages/DatabaseDoctorPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { NoticesPage } from './pages/NoticesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { ForceChangePasswordModal } from './components/auth/ForceChangePasswordModal';
import { ToastProvider } from './components/common/ToastContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <ForceChangePasswordModal />
            <Routes>
          {/* Public Authentication Pages */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          {/* Application Layout Routes */}
          <Route path="/" element={<AppLayout />}>
            <Route index element={<HomePage />} />

            {/* Authenticated Dashboard (Staff, Admin) */}
            <Route
              path="dashboard"
              element={
                <ProtectedRoute allowedRoles={['Staff', 'Admin']}>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />

            {/* Staff Self-Service Routes */}
            <Route
              path="attendance/my"
              element={
                <ProtectedRoute allowedRoles={['Staff', 'Admin']}>
                  <MyAttendancePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="leave/my"
              element={
                <ProtectedRoute allowedRoles={['Staff', 'Admin']}>
                  <MyLeavePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="leave/submit"
              element={
                <ProtectedRoute allowedRoles={['Staff', 'Admin']}>
                  <SubmitLeavePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="holidays"
              element={
                <ProtectedRoute allowedRoles={['Staff', 'Admin']}>
                  <HolidaysPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="notices"
              element={
                <ProtectedRoute allowedRoles={['Staff', 'Admin']}>
                  <NoticesPage />
                </ProtectedRoute>
              }
            />

            {/* Operations Routes (Admin) */}
            <Route
              path="manager"
              element={
                <ProtectedRoute allowedRoles={['Admin']}>
                  <ManagerPortalPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="attendance/marking"
              element={
                <ProtectedRoute allowedRoles={['Admin']}>
                  <AttendanceMarkingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="leave/requests"
              element={
                <ProtectedRoute allowedRoles={['Admin']}>
                  <LeaveRequestsPage />
                </ProtectedRoute>
              }
            />

            {/* User Management & Roster (Admin) */}
            <Route
              path="admin/users"
              element={
                <ProtectedRoute allowedRoles={['Admin']}>
                  <UsersPage />
                </ProtectedRoute>
              }
            />

            {/* Attendance & Leave Reports (Admin) */}
            <Route
              path="reports"
              element={
                <ProtectedRoute allowedRoles={['Admin']}>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />

            {/* Administrator Routes */}
            <Route
              path="admin"
              element={
                <ProtectedRoute allowedRoles={['Admin']}>
                  <AdminPanelPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/notices"
              element={
                <ProtectedRoute allowedRoles={['Admin']}>
                  <NoticesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/leave-balances"
              element={
                <ProtectedRoute allowedRoles={['Admin']}>
                  <LeaveManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/leave-policy"
              element={
                <ProtectedRoute allowedRoles={['Admin']}>
                  <LeavePolicyPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/activity-logs"
              element={
                <ProtectedRoute allowedRoles={['Admin']}>
                  <ActivityLogsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/email-logs"
              element={
                <ProtectedRoute allowedRoles={['Admin']}>
                  <EmailLogsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/database-doctor"
              element={
                <ProtectedRoute allowedRoles={['Admin']}>
                  <DatabaseDoctorPage />
                </ProtectedRoute>
              }
            />

            {/* Fallback 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;
