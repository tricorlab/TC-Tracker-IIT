import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  X,
  CalendarDays,
  FileText,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCheck,
  Megaphone,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  fetchHolidays,
  fetchMyLeaveRequests,
  fetchActivityLogs,
  fetchNotices,
} from '../../services/api';

export interface NotificationItem {
  id: string;
  type: 'holiday' | 'leave' | 'activity' | 'policy' | 'notice';
  title: string;
  description: string;
  link: string;
  timestamp?: string;
  read?: boolean;
}

const STORAGE_KEY = 'tc_read_notifications_v1';

function getStoredReadIds(): string[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    }
  } catch {
    // fallback
  }
  return [];
}

function saveStoredReadIds(ids: string[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    }
  } catch {
    // fallback
  }
}

export const NotificationMenu: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<string[]>(getStoredReadIds);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const notifications: NotificationItem[] = [];
    const todayStr = new Date().toISOString().slice(0, 10);
    const currentYear = new Date().getFullYear();

    try {
      // 0. Official Staff Notices & Directives (High priority)
      const noticeRes = await fetchNotices({ status: 'Active', limit: 2 });
      if (noticeRes?.data) {
        for (const n of noticeRes.data) {
          const isUrgent = n.Priority === 'Urgent';
          notifications.push({
            id: `notice-${n.NoticeID}`,
            type: 'notice',
            title: `${isUrgent ? '🚨 ' : ''}${n.Title}`,
            description: `${n.Priority} Priority • ${n.Category}: ${n.Content.slice(0, 60)}${n.Content.length > 60 ? '...' : ''}`,
            link: '/notices',
            timestamp: n.CreatedAt ? new Date(n.CreatedAt).toLocaleDateString() : 'Notice',
          });
        }
      }
    } catch {
      // Ignore notice fetch failure
    }

    try {
      // 1. Upcoming Holidays (For both Staff & Admin)
      const holidayRes = await fetchHolidays(currentYear);
      if (holidayRes?.holidays) {
        const upcoming = holidayRes.holidays
          .filter((h) => h.HolidayDate >= todayStr)
          .slice(0, 2);
        for (const h of upcoming) {
          notifications.push({
            id: `holiday-${h.HolidayID || h.HolidayDate}`,
            type: 'holiday',
            title: `Upcoming Holiday: ${h.HolidayName}`,
            description: `${h.HolidayDate}${h.Description ? ` • ${h.Description}` : ''}`,
            link: '/holidays',
            timestamp: h.HolidayDate,
          });
        }
      }
    } catch {
      // Ignore holiday fetch failure
    }

    if (user.role === 'Admin') {
      try {
        // 2. Recent Administrative Activities (Admin only)
        const logsRes = await fetchActivityLogs(5);
        const logs = logsRes?.data || logsRes?.logs || [];
        for (const log of logs.slice(0, 3)) {
          const isLeave = log.Action.includes('LEAVE');
          const isAtt = log.Action.includes('ATTENDANCE');
          notifications.push({
            id: `log-${log.LogID}`,
            type: 'activity',
            title: log.Action.replace(/_/g, ' '),
            description: `${log.PerformedBy}: ${log.Details || 'System event recorded'}`,
            link: isLeave ? '/leave/requests' : isAtt ? '/attendance/marking' : '/admin/activity-logs',
            timestamp: log.Timestamp ? new Date(log.Timestamp).toLocaleDateString() : undefined,
          });
        }
      } catch {
        // Ignore activity log failure
      }
    } else {
      try {
        // 3. Recent Staff Leave Notices (Staff only)
        const leaveRes = await fetchMyLeaveRequests();
        const reqs = leaveRes?.requests || [];
        for (const req of reqs.slice(0, 3)) {
          notifications.push({
            id: `leave-${req.LeaveRequestID}`,
            type: 'leave',
            title: `Leave Notice: ${req.LeaveType} (${req.CalculatedDays || (req as any).RequestedDays || 1}d)`,
            description: `${req.StartDate} to ${req.EndDate} • Status: ${req.Status}`,
            link: '/leave/my',
            timestamp: req.CreatedAt ? req.CreatedAt.slice(0, 10) : req.StartDate,
          });
        }
      } catch {
        // Ignore leave request failure
      }
    }

    // 4. Leave Policy Rule Reminder
    notifications.push({
      id: 'policy-accrual-monthly',
      type: 'policy',
      title: 'Policy Reminder: Monthly Accrual',
      description: 'Leave allowance of 2.5 days is credited upon completion of each calendar month.',
      link: user.role === 'Admin' ? '/admin/leave-policy' : '/leave/my',
      timestamp: 'Rule Notice',
    });

    setItems(notifications);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const unreadCount = items.filter((item) => !readIds.includes(item.id)).length;

  const handleMarkAllRead = () => {
    const allIds = items.map((i) => i.id);
    const updated = Array.from(new Set([...readIds, ...allIds]));
    setReadIds(updated);
    saveStoredReadIds(updated);
  };

  const handleItemClick = (item: NotificationItem) => {
    if (!readIds.includes(item.id)) {
      const updated = [...readIds, item.id];
      setReadIds(updated);
      saveStoredReadIds(updated);
    }
    setIsOpen(false);
    navigate(item.link);
  };

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'notice':
        return <Megaphone className="w-4 h-4 text-indigo-600" />;
      case 'holiday':
        return <Sparkles className="w-4 h-4 text-purple-600" />;
      case 'leave':
        return <FileText className="w-4 h-4 text-blue-600" />;
      case 'activity':
        return <ShieldCheck className="w-4 h-4 text-emerald-600" />;
      case 'policy':
      default:
        return <CalendarDays className="w-4 h-4 text-amber-600" />;
    }
  };

  const getBadgeBg = (type: NotificationItem['type']) => {
    switch (type) {
      case 'notice':
        return 'bg-indigo-100/80';
      case 'holiday':
        return 'bg-purple-100/80';
      case 'leave':
        return 'bg-blue-100/80';
      case 'activity':
        return 'bg-emerald-100/80';
      case 'policy':
      default:
        return 'bg-amber-100/80';
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Notification Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`p-2 rounded-xl transition cursor-pointer relative ${
          isOpen
            ? 'bg-white/20 text-white shadow-xs'
            : 'text-slate-300 hover:text-white hover:bg-white/10'
        }`}
        title="Notifications"
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={isOpen}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-blue-500 text-white font-bold text-[10px] flex items-center justify-center ring-2 ring-[#0e1d34] animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <>
          {/* Mobile Screen Dimming Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-2xs z-40 sm:hidden"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          <div className="fixed top-16 left-3 right-3 sm:absolute sm:top-full sm:left-auto sm:right-0 sm:mt-2.5 sm:w-96 max-w-md mx-auto sm:mx-0 z-50 rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
          <div className="p-3.5 px-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">Notifications</span>
              {unreadCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                  {unreadCount} unread
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-200/70 text-slate-600">
                  All caught up
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                  title="Mark all notifications as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark read</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
                aria-label="Close notifications"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List of Notification Items */}
          <div className="max-h-[60vh] sm:max-h-80 overflow-y-auto divide-y divide-slate-100 overscroll-contain">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400 animate-pulse">
                Loading notifications...
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No notifications right now.
              </div>
            ) : (
              items.map((item) => {
                const isUnread = !readIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={`w-full p-3.5 px-4 text-left hover:bg-slate-50 transition flex items-start gap-3 cursor-pointer group ${
                      isUnread ? 'bg-blue-50/30' : ''
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${getBadgeBg(
                        item.type
                      )}`}
                    >
                      {getIcon(item.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-semibold truncate ${
                          isUnread ? 'text-slate-900' : 'text-slate-700'
                        }`}>
                          {item.title}
                        </span>
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                        {item.description}
                      </p>
                      {item.timestamp && (
                        <span className="text-[10px] text-slate-400 font-medium block mt-1">
                          {item.timestamp}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 px-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-400 text-[11px]">TC Tracker Updates</span>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate(user?.role === 'Admin' ? '/admin/activity-logs' : '/leave/my');
              }}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition cursor-pointer"
            >
              <span>{user?.role === 'Admin' ? 'Audit Trail' : 'My Leave Records'}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </>
    )}
  </div>
);
};
