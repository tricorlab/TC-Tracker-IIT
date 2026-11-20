import React, { useState } from 'react';
import {
  CalendarCheck,
  LogIn,
  LogOut,
  Users,
  Settings,
  LayoutDashboard,
  Calendar,
  FileText,
  PlusCircle,
  Clock,
  History,
  Sliders,
  Mail,
  FileSpreadsheet,
  Wrench,
} from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { NotificationMenu } from './NotificationMenu';

interface NavbarProps {
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar, sidebarOpen }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  // Derive human-readable page name for breadcrumb
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/' || path === '/dashboard') return 'Dashboard';
    if (path === '/attendance/my') return 'My Attendance';
    if (path === '/attendance/marking') return 'Attendance Marking';
    if (path === '/leave/my') return 'My Leave';
    if (path === '/leave/submit') return 'Submit Leave';
    if (path === '/leave/requests') return 'Leave Records';
    if (path === '/admin/users') return 'Staff Roster';
    if (path === '/reports') return 'Reports';
    if (path === '/holidays') return 'Holidays';
    if (path === '/admin/notices' || path === '/notices') return 'Staff Notices & Announcements';
    if (path === '/admin/activity-logs') return 'Activity Logs';
    if (path === '/admin/email-logs') return 'Email Audit';
    if (path === '/admin/leave-balances') return 'Leave Balances';
    if (path === '/admin/leave-policy') return 'Leave Policy';
    if (path === '/admin/database-doctor') return 'Database Doctor';
    if (path === '/admin') return 'Settings';
    return 'Dashboard';
  };

  return (
    <header className="bg-[#0e1d34] border-b border-[#1b2d4b] sticky top-0 z-40 shadow-sm text-white w-full">
      <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Hamburger Menu Trigger (Mobile & Desktop) + Brand & Breadcrumb */}
        <div className="flex items-center gap-3">
          {/* Hamburger Menu Trigger with Native Mobile App Morphing Animation */}
          <button
            type="button"
            onClick={() => {
              if (onToggleSidebar) {
                onToggleSidebar();
              } else {
                setMobileMenuOpen(!mobileMenuOpen);
              }
            }}
            className="relative w-10 h-10 flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl border border-slate-700/80 bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white transition-all active:scale-90 cursor-pointer shrink-0"
            title={sidebarOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-label="Toggle navigation menu"
          >
            <span
              className={`w-5 h-[2px] bg-current rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] origin-center ${
                sidebarOpen ? 'rotate-45 translate-y-2' : ''
              }`}
            />
            <span
              className={`w-5 h-[2px] bg-current rounded-full transition-all duration-200 ease-out ${
                sidebarOpen ? 'opacity-0 scale-x-0' : 'opacity-100'
              }`}
            />
            <span
              className={`w-5 h-[2px] bg-current rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] origin-center ${
                sidebarOpen ? '-rotate-45 -translate-y-2' : ''
              }`}
            />
          </button>

          {/* Brand with Attendance & Leave Subtitle */}
          <Link
            to="/dashboard"
            className="flex items-center gap-2.5 text-white font-bold text-base group"
          >
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs group-hover:bg-blue-500 transition">
              <CalendarCheck className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="tracking-tight text-white font-bold text-base">TC Tracker</span>
              <span className="hidden sm:inline text-slate-500 text-sm font-light">|</span>
              <span className="hidden sm:inline text-slate-400 text-xs font-normal">Attendance &amp; Leave</span>
            </div>
          </Link>

          {/* Desktop Breadcrumb */}
          <div className="hidden xl:flex items-center gap-1.5 text-xs ml-4 pl-4 border-l border-slate-700/60">
            <span className="font-medium text-slate-400">Dashboard</span>
            <span className="text-slate-600">&gt;</span>
            <span className="font-semibold text-slate-200">{getPageTitle()}</span>
          </div>
        </div>

        {/* Right: Notification Bell / User Info / Role Badge / Logout */}
        <div className="flex items-center gap-2 sm:gap-3">
          {user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Notification Bell Menu */}
              <NotificationMenu />

              {/* User details */}
              <div className="hidden md:flex flex-col text-right">
                <span className="text-xs font-bold text-white leading-tight">
                  {user.fullName}
                </span>
                <span className="text-[11px] text-slate-400 leading-tight truncate max-w-[160px]">
                  {user.email}
                </span>
              </div>

              {/* Role Badge */}
              <span className="px-2 sm:px-3 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-[#dce7f5] text-[#1c3a64] border border-[#c4d7ed] tracking-wide shrink-0">
                {user.role}
              </span>

              {/* Logout Button */}
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl border border-white/15 bg-white/10 hover:bg-rose-500/20 hover:text-rose-200 hover:border-rose-400 text-slate-200 text-xs font-medium transition cursor-pointer active:scale-95 shrink-0"
                title="Log Out"
                aria-label="Log out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </Link>
          )}
        </div>
      </div>

      {/* Mobile Navigation Drawer Overlay */}
      {user && mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-3 shadow-xl">
          {user.role === 'Admin' ? (
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 pb-1">
                Admin Navigation
              </div>
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${isActive('/dashboard') ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
              >
                <LayoutDashboard className="w-4 h-4 text-slate-500" />
                <span>Dashboard</span>
              </Link>
              <Link
                to="/attendance/marking"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${isActive('/attendance/marking') ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
              >
                <CalendarCheck className="w-4 h-4 text-slate-500" />
                <span>Attendance</span>
              </Link>
              <Link
                to="/leave/requests"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${isActive('/leave/requests') ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
              >
                <FileText className="w-4 h-4 text-slate-500" />
                <span>Leave Requests</span>
              </Link>
              <Link
                to="/admin/users"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${isActive('/admin/users') ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
              >
                <Users className="w-4 h-4 text-slate-500" />
                <span>Staff</span>
              </Link>
              <Link
                to="/reports"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${isActive('/reports') ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-slate-500" />
                <span>Reports</span>
              </Link>
              <Link
                to="/admin/activity-logs"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${isActive('/admin/activity-logs') ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
              >
                <History className="w-4 h-4 text-slate-500" />
                <span>Activity Logs</span>
              </Link>
              <Link
                to="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${isActive('/admin') ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
              >
                <Settings className="w-4 h-4 text-slate-500" />
                <span>Settings</span>
              </Link>

              {/* Admin Tools Section */}
              <div className="pt-2 pl-3 border-t border-slate-100 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Settings & Tools</span>
                <Link
                  to="/admin/email-logs"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-50"
                >
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>Email Audit</span>
                </Link>
                <Link
                  to="/admin/database-doctor"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-50"
                >
                  <Wrench className="w-3.5 h-3.5 text-slate-400" />
                  <span>Database Doctor</span>
                </Link>
                <Link
                  to="/admin/leave-balances"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-50"
                >
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  <span>Leave Balances</span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 pb-1">
                Staff Navigation
              </div>
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${isActive('/dashboard') ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
              >
                <LayoutDashboard className="w-4 h-4 text-slate-500" />
                <span>Dashboard</span>
              </Link>
              <Link
                to="/attendance/my"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${isActive('/attendance/my') ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
              >
                <Calendar className="w-4 h-4 text-slate-500" />
                <span>My Attendance</span>
              </Link>
              <Link
                to="/leave/my"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${isActive('/leave/my') ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
              >
                <Clock className="w-4 h-4 text-slate-500" />
                <span>My Leave</span>
              </Link>
              <Link
                to="/leave/submit"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${isActive('/leave/submit') ? 'bg-emerald-50 text-emerald-700' : 'text-emerald-600 hover:bg-emerald-50/50'
                  }`}
              >
                <PlusCircle className="w-4 h-4 text-emerald-600" />
                <span>Submit Leave</span>
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
