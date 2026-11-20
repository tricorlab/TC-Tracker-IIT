import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  CalendarCheck,
  FileText,
  Users,
  CalendarDays,
  BarChart3,
  History,
  Sliders,
  FileCode,
  Mail,
  Wrench,
  Settings,
  PlusCircle,
  Clock,
  Calendar,
  ChevronDown,
  X,
  Megaphone,
} from 'lucide-react';

interface SidebarProps {
  onItemClick?: () => void;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ onItemClick, className = '' }) => {
  const { user } = useAuth();
  const location = useLocation();
  const [adminToolsOpen, setAdminToolsOpen] = React.useState<boolean>(
    location.pathname.startsWith('/admin') && location.pathname !== '/admin/users'
  );

  const isActive = (path: string) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname === path;
  };

  const navItemClass = (active: boolean) =>
    `group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${active
      ? 'bg-[#e8f0fe] text-[#1a73e8] font-bold shadow-xs'
      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
    }`;

  const iconClass = (active: boolean) =>
    `w-4 h-4 transition-colors ${active ? 'text-[#1a73e8]' : 'text-slate-400 group-hover:text-slate-700'}`;

  if (!user) {
    return (
      <aside className={`w-64 bg-white border-r border-slate-200 flex flex-col ${className}`}>
        <div className="p-6">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-slate-900 text-base leading-tight block">TC Tracker</span>
              <span className="text-[11px] text-slate-400 font-normal">Attendance &amp; Leave</span>
            </div>
          </Link>
        </div>
      </aside>
    );
  }

  return (
    <aside className={`w-full bg-white flex flex-col h-full ${className}`}>
      {/* Brand Header with Close Button */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <Link to="/dashboard" onClick={onItemClick} className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
            <CalendarCheck className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-slate-900 text-sm tracking-tight block">TC Tracker</span>
            <span className="text-[10px] text-slate-400 font-medium">Attendance &amp; Leave</span>
          </div>
        </Link>
        {onItemClick && (
          <button
            type="button"
            onClick={onItemClick}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-6">
        {/* Main Section */}
        <div>
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Menu
          </div>
          <nav className="space-y-1">
            {/* Common Dashboard */}
            <Link
              to="/dashboard"
              onClick={onItemClick}
              className={navItemClass(isActive('/dashboard'))}
            >
              <LayoutDashboard className={iconClass(isActive('/dashboard'))} />
              <span>Dashboard</span>
            </Link>

            {/* Admin Navigation */}
            {user.role === 'Admin' && (
              <>
                <Link
                  to="/attendance/marking"
                  onClick={onItemClick}
                  className={navItemClass(isActive('/attendance/marking'))}
                >
                  <CalendarCheck className={iconClass(isActive('/attendance/marking'))} />
                  <span>Attendance</span>
                </Link>

                <Link
                  to="/leave/requests"
                  onClick={onItemClick}
                  className={navItemClass(isActive('/leave/requests'))}
                >
                  <FileText className={iconClass(isActive('/leave/requests'))} />
                  <span>Leave Records</span>
                </Link>

                <Link
                  to="/admin/users"
                  onClick={onItemClick}
                  className={navItemClass(isActive('/admin/users'))}
                >
                  <Users className={iconClass(isActive('/admin/users'))} />
                  <span>Staff</span>
                </Link>

                <Link
                  to="/admin/notices"
                  onClick={onItemClick}
                  className={navItemClass(isActive('/admin/notices') || isActive('/notices'))}
                >
                  <Megaphone className={iconClass(isActive('/admin/notices') || isActive('/notices'))} />
                  <span>Notices</span>
                </Link>

                <Link
                  to="/holidays"
                  onClick={onItemClick}
                  className={navItemClass(isActive('/holidays'))}
                >
                  <CalendarDays className={iconClass(isActive('/holidays'))} />
                  <span>Holidays</span>
                </Link>

                <Link
                  to="/reports"
                  onClick={onItemClick}
                  className={navItemClass(isActive('/reports'))}
                >
                  <BarChart3 className={iconClass(isActive('/reports'))} />
                  <span>Reports</span>
                </Link>

                <Link
                  to="/admin/activity-logs"
                  onClick={onItemClick}
                  className={navItemClass(isActive('/admin/activity-logs'))}
                >
                  <History className={iconClass(isActive('/admin/activity-logs'))} />
                  <span>Activity Logs</span>
                </Link>
              </>
            )}

            {/* Staff Navigation */}
            {user.role === 'Staff' && (
              <>
                <Link
                  to="/attendance/my"
                  onClick={onItemClick}
                  className={navItemClass(isActive('/attendance/my'))}
                >
                  <Calendar className={iconClass(isActive('/attendance/my'))} />
                  <span>Attendance</span>
                </Link>

                <Link
                  to="/leave/my"
                  onClick={onItemClick}
                  className={navItemClass(isActive('/leave/my'))}
                >
                  <Clock className={iconClass(isActive('/leave/my'))} />
                  <span>My Leave</span>
                </Link>

                <Link
                  to="/leave/submit"
                  onClick={onItemClick}
                  className={navItemClass(isActive('/leave/submit'))}
                >
                  <PlusCircle className={iconClass(isActive('/leave/submit'))} />
                  <span>Submit Leave</span>
                </Link>

                <Link
                  to="/holidays"
                  onClick={onItemClick}
                  className={navItemClass(isActive('/holidays'))}
                >
                  <CalendarDays className={iconClass(isActive('/holidays'))} />
                  <span>Holidays</span>
                </Link>

                <Link
                  to="/notices"
                  onClick={onItemClick}
                  className={navItemClass(isActive('/notices'))}
                >
                  <Megaphone className={iconClass(isActive('/notices'))} />
                  <span>Notices</span>
                </Link>
              </>
            )}
          </nav>
        </div>

        {/* Administration Tools (Admin Only) */}
        {user.role === 'Admin' && (
          <div>
            <button
              type="button"
              onClick={() => setAdminToolsOpen(!adminToolsOpen)}
              className="w-full px-3 pb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition"
            >
              <span>Admin Tools</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${adminToolsOpen ? 'rotate-180' : ''
                  }`}
              />
            </button>

            {adminToolsOpen && (
              <nav className="space-y-1">
                <Link
                  to="/admin/notices"
                  onClick={onItemClick}
                  className={navItemClass(isActive('/admin/notices'))}
                >
                  <Megaphone className={iconClass(isActive('/admin/notices'))} />
                  <span>Staff Notices</span>
                </Link>

                <Link
                  to="/admin/leave-balances"
                  onClick={onItemClick}
                  className={navItemClass(isActive('/admin/leave-balances'))}
                >
                  <Sliders className={iconClass(isActive('/admin/leave-balances'))} />
                  <span>Leave Balances</span>
                </Link>

                <Link
                  to="/admin/leave-policy"
                  onClick={onItemClick}
                  className={navItemClass(isActive('/admin/leave-policy'))}
                >
                  <FileCode className={iconClass(isActive('/admin/leave-policy'))} />
                  <span>Leave Policy</span>
                </Link>

                <Link
                  to="/admin/email-logs"
                  onClick={onItemClick}
                  className={navItemClass(isActive('/admin/email-logs'))}
                >
                  <Mail className={iconClass(isActive('/admin/email-logs'))} />
                  <span>Email Audit</span>
                </Link>

                <Link
                  to="/admin/database-doctor"
                  onClick={onItemClick}
                  className={navItemClass(isActive('/admin/database-doctor'))}
                >
                  <Wrench className={iconClass(isActive('/admin/database-doctor'))} />
                  <span>Database Doctor</span>
                </Link>

                <Link
                  to="/admin"
                  onClick={onItemClick}
                  className={navItemClass(isActive('/admin'))}
                >
                  <Settings className={iconClass(isActive('/admin'))} />
                  <span>Settings</span>
                </Link>
              </nav>
            )}
          </div>
        )}
      </div>

      {/* User Footer in Sidebar */}
      <div className="p-3.5 border-t border-slate-100 bg-slate-50/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold shrink-0">
            {user.fullName ? user.fullName[0].toUpperCase() : 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold text-slate-800 truncate block">
              {user.fullName}
            </span>
            <span className="text-[11px] text-slate-500 truncate block">
              {user.email}
            </span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${user.role === 'Admin'
              ? 'bg-slate-100 text-slate-800 border-slate-300'
              : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}
          >
            {user.role}
          </span>
        </div>
      </div>
    </aside>
  );
};
