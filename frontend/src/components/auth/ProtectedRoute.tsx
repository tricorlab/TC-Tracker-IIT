import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { type UserRole } from '../../services/api';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-500 font-medium">Verifying session...</p>
      </div>
    );
  }

  // Not authenticated -> redirect to login preserving intended path (excluding /unauthorized and /login)
  if (!user) {
    const isForbiddenTarget =
      location.pathname === '/unauthorized' || location.pathname === '/login' || location.pathname === '/';
    return <Navigate to="/login" state={isForbiddenTarget ? undefined : { from: location }} replace />;
  }

  // Role authorization check
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};
