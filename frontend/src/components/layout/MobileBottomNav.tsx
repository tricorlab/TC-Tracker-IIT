import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  CalendarCheck,
  FileText,
  Users,
  Clock,
  PlusCircle,
  Menu,
} from 'lucide-react';

interface MobileBottomNavProps {
  onOpenSidebar: () => void;
  sidebarOpen?: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  onOpenSidebar,
  sidebarOpen,
}) => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return null;

  const isAdmin = user.role === 'Admin';
  const currentPath = location.pathname;

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return currentPath === '/' || currentPath === '/dashboard';
    }
    return currentPath === path || currentPath.startsWith(`${path}/`);
  };

  const navItems = isAdmin
    ? [
        { label: 'Home', path: '/dashboard', icon: LayoutDashboard },
        { label: 'Marking', path: '/attendance/marking', icon: CalendarCheck },
        { label: 'Leaves', path: '/leave/requests', icon: FileText },
        { label: 'Staff', path: '/admin/users', icon: Users },
      ]
    : [
        { label: 'Home', path: '/dashboard', icon: LayoutDashboard },
        { label: 'Attendance', path: '/attendance/my', icon: CalendarCheck },
        { label: 'Apply', path: '/leave/submit', icon: PlusCircle, isHighlight: true },
        { label: 'My Leaves', path: '/leave/my', icon: Clock },
      ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom,0px)]"
      aria-label="Mobile Navigation Bar"
    >
      <div className="grid grid-cols-5 h-16 items-center px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          if (item.isHighlight) {
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex flex-col items-center justify-center -mt-3.5 group cursor-pointer"
                title={item.label}
              >
                <div
                  className={`w-11 h-11 rounded-full flex items-center justify-center shadow-md transition-all duration-200 active:scale-90 ${
                    active
                      ? 'bg-blue-600 text-white shadow-blue-500/30 ring-4 ring-blue-100'
                      : 'bg-blue-600 text-white shadow-blue-500/20 hover:bg-blue-700'
                  }`}
                >
                  <Icon className="w-5 h-5 stroke-[2.2]" />
                </div>
                <span className="text-[10px] font-bold text-blue-600 mt-1">
                  {item.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center h-full py-1 px-1 transition-colors relative cursor-pointer active:scale-95 ${
                active ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {active && (
                <span className="absolute top-0 w-8 h-0.5 bg-blue-600 rounded-full" />
              )}
              <Icon className={`w-5 h-5 transition-transform ${active ? 'scale-110 stroke-[2.2]' : 'stroke-[1.8]'}`} />
              <span className={`text-[10px] mt-1 tracking-tight truncate max-w-full ${active ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* More / Menu Drawer Trigger */}
        <button
          type="button"
          onClick={onOpenSidebar}
          className={`flex flex-col items-center justify-center h-full py-1 px-1 transition-colors relative cursor-pointer active:scale-95 ${
            sidebarOpen ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Open More Menu"
        >
          {sidebarOpen && (
            <span className="absolute top-0 w-8 h-0.5 bg-blue-600 rounded-full" />
          )}
          <div className="relative">
            <Menu className={`w-5 h-5 ${sidebarOpen ? 'stroke-[2.2]' : 'stroke-[1.8]'}`} />
          </div>
          <span className={`text-[10px] mt-1 tracking-tight ${sidebarOpen ? 'font-bold' : 'font-medium'}`}>
            Menu
          </span>
        </button>
      </div>
    </nav>
  );
};
