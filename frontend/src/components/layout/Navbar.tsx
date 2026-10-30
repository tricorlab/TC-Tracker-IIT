import React from 'react';
import { CalendarCheck, ShieldCheck, LogIn } from 'lucide-react';
import { Link } from 'react-router-dom';

export const Navbar: React.FC = () => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-3 text-slate-900 font-bold text-xl hover:opacity-90 transition-opacity">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="leading-tight text-lg">TC Tracker</span>
            <span className="text-xs text-slate-500 font-normal">Attendance & Leave Management</span>
          </div>
        </Link>

        {/* Phase Badge & Action Placeholder */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>Phase 1: Foundation</span>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition shadow-sm"
            onClick={() => alert('Google OAuth Sign-In workflow is scheduled for Phase 2.')}
          >
            <LogIn className="w-4 h-4" />
            <span>Sign In</span>
          </button>
        </div>
      </div>
    </header>
  );
};
