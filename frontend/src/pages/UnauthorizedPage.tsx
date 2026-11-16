import React, { useEffect } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ShieldX, ArrowLeft, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const UnauthorizedPage: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Staff members should never see this 403 Access Denied screen; redirect immediately to Dashboard
    if (!loading && user?.role === 'Staff') {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-500 font-medium">Verifying access...</p>
      </div>
    );
  }

  // Staff members should never see 403 page; redirect immediately to Dashboard
  if (user?.role === 'Staff') {
    return <Navigate to="/dashboard" replace />;
  }

  // Unauthenticated users should be sent to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4 shadow-sm">
        <ShieldX className="w-8 h-8" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900">403 — Access Denied</h1>
      <p className="text-sm text-slate-600 max-w-md mt-2 mb-2">
        You do not have the required permissions to access this area.
      </p>
      {user && (
        <div className="inline-block px-3 py-1 bg-slate-100 border border-slate-200 rounded-full text-xs text-slate-700 font-medium mb-6">
          Your active role: <span className="font-bold text-blue-600">{user.role}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition shadow-sm"
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Go to Dashboard</span>
        </Link>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
      </div>
    </div>
  );
};
