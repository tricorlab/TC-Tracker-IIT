import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchStaffDashboard, fetchMyLeaveRequests, fetchNotices } from '../services/api';
import type { StaffDashboardData, LeaveRequestItem, NoticeItem } from '../services/api';
import { AdminDashboardView } from '../components/dashboard/AdminDashboardView';
import { MonthlyHealthCard } from '../components/attendance/MonthlyHealthCard';
import {
  CalendarCheck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  PlusCircle,
  RefreshCw,
  Sun,
  Coffee,
  Moon,
  AlertCircle,
  XCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Megaphone,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const CURRENT_DATE = new Date();
const YEAR_OPTIONS = Array.from(
  { length: 15 },
  (_, i) => CURRENT_DATE.getFullYear() - 4 + i
);

function calculateLeaveDaysInPeriod(
  request: { StartDate: string; EndDate: string; CalculatedDays?: number | string },
  targetYear: number,
  targetMonth?: number
): number {
  if (!request.StartDate || !request.EndDate) return 0;
  const start = request.StartDate.trim();
  const end = request.EndDate.trim();

  let periodStart: string;
  let periodEnd: string;

  if (targetMonth !== undefined) {
    const monthStr = String(targetMonth).padStart(2, '0');
    const daysInMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
    periodStart = `${targetYear}-${monthStr}-01`;
    periodEnd = `${targetYear}-${monthStr}-${String(daysInMonth).padStart(2, '0')}`;
  } else {
    periodStart = `${targetYear}-01-01`;
    periodEnd = `${targetYear}-12-31`;
  }

  if (start > periodEnd || end < periodStart) {
    return 0;
  }

  const calcDays = parseFloat(String(request.CalculatedDays || 0)) || 0;
  if (start >= periodStart && end <= periodEnd) {
    return calcDays;
  }

  const overlapStart = start < periodStart ? periodStart : start;
  const overlapEnd = end > periodEnd ? periodEnd : end;

  const [sY, sM, sD] = start.split('-').map(Number);
  const [eY, eM, eD] = end.split('-').map(Number);
  const totalCalDays = Math.max(1, Math.round((Date.UTC(eY, eM - 1, eD) - Date.UTC(sY, sM - 1, sD)) / 86400000) + 1);

  const [osY, osM, osD] = overlapStart.split('-').map(Number);
  const [oeY, oeM, oeD] = overlapEnd.split('-').map(Number);
  const overlapCalDays = Math.max(0, Math.round((Date.UTC(oeY, oeM - 1, oeD) - Date.UTC(osY, osM - 1, osD)) / 86400000) + 1);

  if (calcDays === totalCalDays) {
    return overlapCalDays;
  }
  return Math.round(calcDays * (overlapCalDays / totalCalDays) * 100) / 100;
}

// Time-of-day greeting helper
function getGreeting(name?: string): { greeting: string; icon: React.FC<{ className?: string }> } {
  const hour = new Date().getHours();
  const firstName = name ? name.split(' ')[0] : 'there';
  if (hour >= 5 && hour < 12) {
    return { greeting: `Good morning, ${firstName}`, icon: Sun };
  } else if (hour >= 12 && hour < 17) {
    return { greeting: `Good afternoon, ${firstName}`, icon: Coffee };
  } else {
    return { greeting: `Good evening, ${firstName}`, icon: Moon };
  }
}

// Format date for table display: "Fri, Oct 31, 2026"
function formatDisplayDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.trim();
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  } catch {
    // fallback
  }
  return dateStr;
}

// Format leave period: "Oct 10 - Oct 11, 2026"
function formatLeavePeriod(startDate: string, endDate: string): string {
  try {
    const sp = startDate.split('-');
    const ep = endDate.split('-');
    if (sp.length === 3 && ep.length === 3) {
      const sDate = new Date(parseInt(sp[0], 10), parseInt(sp[1], 10) - 1, parseInt(sp[2], 10));
      const eDate = new Date(parseInt(ep[0], 10), parseInt(ep[1], 10) - 1, parseInt(ep[2], 10));
      const sMonth = sDate.toLocaleDateString('en-US', { month: 'short' });
      const eMonth = eDate.toLocaleDateString('en-US', { month: 'short' });
      if (sMonth === eMonth && sp[0] === ep[0]) {
        return `${sMonth} ${sDate.getDate()} - ${eDate.getDate()}, ${sp[0]}`;
      }
      return `${sMonth} ${sDate.getDate()} - ${eMonth} ${eDate.getDate()}, ${ep[0]}`;
    }
  } catch {
    // fallback
  }
  return `${startDate} - ${endDate}`;
}

// Graphical SVG Donut Chart Component
const DonutChart: React.FC<{ used: number; total: number; size?: number }> = ({ used, total, size = 68 }) => {
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={percentage > 80 ? '#f59e0b' : '#0284c7'}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold text-slate-700">{Math.round(percentage)}%</span>
      </div>
    </div>
  );
};

// Graphical SVG Accrual Wave Sparkline Component
const AccrualWave: React.FC = () => {
  return (
    <div className="w-full h-9 overflow-hidden">
      <svg viewBox="0 0 160 36" className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="accrualWaveGradStaff" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path
          d="M0,28 C30,28 50,22 80,18 C110,14 130,12 160,6 L160,36 L0,36 Z"
          fill="url(#accrualWaveGradStaff)"
        />
        <path
          d="M0,28 C30,28 50,22 80,18 C110,14 130,12 160,6"
          stroke="#10b981"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

// Graphical SVG Remaining Wave Sparkline Component
const RemainingWave: React.FC<{ isExceeded?: boolean }> = ({ isExceeded }) => {
  const strokeColor = isExceeded ? '#e11d48' : '#0284c7';
  const gradId = isExceeded ? 'remainingRoseGradStaff' : 'remainingSkyGradStaff';
  return (
    <div className="w-full h-9 overflow-hidden">
      <svg viewBox="0 0 160 36" className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path
          d="M0,12 C35,10 65,16 95,20 C125,24 140,26 160,28 L160,36 L0,36 Z"
          fill={`url(#${gradId})`}
        />
        <path
          d="M0,12 C35,10 65,16 95,20 C125,24 140,26 160,28"
          stroke={strokeColor}
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

export const StaffDashboardView: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<StaffDashboardData | null>(null);
  const [allRequests, setAllRequests] = useState<LeaveRequestItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [leaveFilter, setLeaveFilter] = useState<'year' | 'month' | 'total'>('year');
  const [leaveFilterYear, setLeaveFilterYear] = useState<number>(CURRENT_DATE.getFullYear());
  const [leaveFilterMonth, setLeaveFilterMonth] = useState<number>(CURRENT_DATE.getMonth() + 1);
  const [latestNotice, setLatestNotice] = useState<NoticeItem | null>(null);

  const loadDashboard = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [res, reqRes, noticeRes] = await Promise.all([
        fetchStaffDashboard(),
        fetchMyLeaveRequests(),
        fetchNotices({ status: 'Active', limit: 1 }).catch(() => null),
      ]);
      setData(res.dashboard);
      setAllRequests(reqRes.requests || (reqRes as any).data || []);
      if (noticeRes?.data && noticeRes.data.length > 0) {
        setLatestNotice(noticeRes.data[0]);
      } else {
        setLatestNotice(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handlePrevLeaveMonth = () => {
    if (leaveFilterMonth === 1) {
      setLeaveFilterMonth(12);
      setLeaveFilterYear((y) => y - 1);
    } else {
      setLeaveFilterMonth((m) => m - 1);
    }
  };

  const handleNextLeaveMonth = () => {
    if (leaveFilterMonth === 12) {
      setLeaveFilterMonth(1);
      setLeaveFilterYear((y) => y + 1);
    } else {
      setLeaveFilterMonth((m) => m + 1);
    }
  };

  // Determine today's date and attendance status
  const todayStr = CURRENT_DATE.toISOString().slice(0, 10);
  const isSundayToday = CURRENT_DATE.getDay() === 0;

  const todayRecord = (data as any)?.recentAttendance?.find(
    (att: any) =>
      att.AttendanceDate === todayStr ||
      att.Date === todayStr ||
      att.date === todayStr ||
      att.attendanceDate === todayStr
  );

  const rawTodayStatus = todayRecord ? (todayRecord.Status || todayRecord.status) : undefined;
  const todayStatus: 'Present' | 'Absent' | 'Not Marked' =
    rawTodayStatus === 'Present'
      ? 'Present'
      : rawTodayStatus === 'Absent'
      ? 'Absent'
      : 'Not Marked';

  const accruedAllowance = data?.leaveSummary?.accruedAllowance ?? 0;
  const leaveTakenYear = data?.leaveSummary?.leaveTaken ?? 0;
  const leaveTakenMonth = data?.monthlyAttendance?.leaveCount ?? 0;
  const leaveTakenTotal = (data?.leaveSummary as any)?.leaveTakenAllTime ?? leaveTakenYear;
  const isExceeded = data?.leaveSummary?.isExceeded ?? false;
  const excessDays = data?.leaveSummary?.excessDays ?? 0;
  const remainingAllowance =
    data?.leaveSummary?.remainingAllowance ??
    Math.max(0, Math.round((accruedAllowance - leaveTakenYear) * 100) / 100);

  const activeRequests = useMemo(() => {
    return allRequests.filter(
      (r) => r.Status !== 'Withdrawn' && r.Status !== 'Cancelled'
    );
  }, [allRequests]);

  const displayedLeaveTaken = useMemo(() => {
    if (leaveFilter === 'month') {
      if (activeRequests.length > 0) {
        const sum = activeRequests.reduce(
          (acc, r) => acc + calculateLeaveDaysInPeriod(r, leaveFilterYear, leaveFilterMonth),
          0
        );
        return Math.round(sum * 100) / 100;
      }
      if (
        leaveFilterYear === CURRENT_DATE.getFullYear() &&
        leaveFilterMonth === CURRENT_DATE.getMonth() + 1
      ) {
        return leaveTakenMonth;
      }
      return 0;
    }
    if (leaveFilter === 'year') {
      if (activeRequests.length > 0) {
        const sum = activeRequests.reduce(
          (acc, r) => acc + calculateLeaveDaysInPeriod(r, leaveFilterYear),
          0
        );
        if (leaveFilterYear === CURRENT_DATE.getFullYear()) {
          return Math.max(leaveTakenYear, Math.round(sum * 100) / 100);
        }
        return Math.round(sum * 100) / 100;
      }
      return leaveFilterYear === CURRENT_DATE.getFullYear() ? leaveTakenYear : 0;
    }
    return leaveTakenTotal;
  }, [
    activeRequests,
    leaveFilter,
    leaveFilterYear,
    leaveFilterMonth,
    leaveTakenMonth,
    leaveTakenYear,
    leaveTakenTotal,
  ]);

  const filteredLeaveRecords = useMemo(() => {
    const list = allRequests.length > 0 ? allRequests : (data?.recentRequests || []);
    if (leaveFilter === 'month') {
      const mStr = String(leaveFilterMonth).padStart(2, '0');
      const daysInMonth = new Date(Date.UTC(leaveFilterYear, leaveFilterMonth, 0)).getUTCDate();
      const mStart = `${leaveFilterYear}-${mStr}-01`;
      const mEnd = `${leaveFilterYear}-${mStr}-${String(daysInMonth).padStart(2, '0')}`;
      return list.filter(
        (r) => r.StartDate && r.EndDate && r.StartDate.trim() <= mEnd && r.EndDate.trim() >= mStart
      );
    }
    if (leaveFilter === 'year') {
      const yStart = `${leaveFilterYear}-01-01`;
      const yEnd = `${leaveFilterYear}-12-31`;
      return list.filter(
        (r) => r.StartDate && r.EndDate && r.StartDate.trim() <= yEnd && r.EndDate.trim() >= yStart
      );
    }
    return list;
  }, [allRequests, data?.recentRequests, leaveFilter, leaveFilterMonth, leaveFilterYear]);

  const greetingInfo = getGreeting(user?.fullName);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* 1. Breadcrumb & Top Greeting Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
        <div>
          <div className="text-xs text-slate-400 font-medium mb-1">
            Dashboard &gt; Dashboard
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            {greetingInfo.greeting}
          </h1>
        </div>

        {/* Action Button: Submit Leave */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => loadDashboard(true)}
            disabled={refreshing || loading}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 text-xs font-medium transition cursor-pointer shadow-2xs hover:bg-slate-50 disabled:opacity-50"
            title="Refresh dashboard"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
          </button>
          <Link
            to="/leave/submit"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs sm:text-sm font-semibold transition active:scale-95 shadow-sm text-center"
          >
            <PlusCircle className="w-4 h-4 text-white" />
            <span>Submit Leave</span>
          </Link>
        </div>
      </div>

      {/* Latest Official Staff Notice Banner */}
      {latestNotice && (
        <div
          className={`p-4 rounded-2xl border transition shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
            latestNotice.Priority === 'Urgent'
              ? 'bg-rose-50/90 border-rose-200 text-rose-950'
              : latestNotice.Priority === 'High'
              ? 'bg-amber-50/90 border-amber-200 text-amber-950'
              : 'bg-gradient-to-r from-blue-50/90 to-indigo-50/70 border-blue-200/90 text-blue-950'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-2xs ${
                latestNotice.Priority === 'Urgent'
                  ? 'bg-rose-100 text-rose-700'
                  : latestNotice.Priority === 'High'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-blue-600 text-white'
              }`}
            >
              <Megaphone className="w-4 h-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    latestNotice.Priority === 'Urgent'
                      ? 'bg-rose-200/90 text-rose-900'
                      : latestNotice.Priority === 'High'
                      ? 'bg-amber-200/90 text-amber-900'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {latestNotice.Priority} Notice
                </span>
                <span className="text-[11px] font-semibold text-slate-500">
                  {latestNotice.Category}
                </span>
                <span className="text-[11px] text-slate-400">&bull;</span>
                <span className="text-[11px] text-slate-500">
                  By {latestNotice.CreatorName || 'Administration'}
                </span>
              </div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-1">
                {latestNotice.Title}
              </h4>
              <p className="text-xs text-slate-600 line-clamp-1 mt-0.5">
                {latestNotice.Content}
              </p>
            </div>
          </div>
          <Link
            to="/notices"
            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold transition shadow-2xs self-end sm:self-center cursor-pointer"
          >
            <span>Read Notice</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* 2. Prior-Year Transition Pending Notice removed per user request: data?.balance?.transitionPending */}

      {/* Carried Forward Expiry Notice (required test condition) */}
      {data?.balance?.isCarryForwardExpired && Number(data.balance.CarriedForward) > 0 && (
        <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs sm:text-sm flex items-start gap-3 shadow-2xs animate-fade-in">
          <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-950">Carried-Forward Leave Status</p>
            <p className="text-amber-800 text-xs mt-0.5">
              Carried forward leave: Expired after March 31. Earned leave remains active.
            </p>
          </div>
        </div>
      )}

      {/* Excess Leave Warning Banner */}
      {isExceeded && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs sm:text-sm flex items-start gap-3 shadow-2xs animate-fade-in">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-950">Annual Allowance Exceeded</p>
            <p className="text-amber-800 text-xs mt-0.5">
              Leave taken exceeds accrued allowance by <strong>{excessDays} {excessDays === 1 ? 'day' : 'days'}</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadDashboard()}
            className="font-medium underline hover:text-rose-950 ml-4 cursor-pointer text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        /* Shimmer Loading Skeleton */
        <div className="space-y-5 animate-pulse">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-44 bg-slate-200/70 rounded-2xl" />
            ))}
          </div>
          <div className="h-24 bg-slate-200/70 rounded-2xl" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="h-64 bg-slate-200/70 rounded-2xl" />
            <div className="h-64 bg-slate-200/70 rounded-2xl" />
          </div>
        </div>
      ) : !data ? (
        <div className="py-16 text-center rounded-2xl bg-white border border-slate-200/80 p-8 shadow-xs">
          <CalendarCheck className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <h3 className="text-sm font-semibold text-slate-800">No Dashboard Records</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            No attendance or leave history was found for your account.
          </p>
        </div>
      ) : (
        <>
          {/* 3. Graphical Cards: 4 Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Card 1: Today's Attendance */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <span className="text-xs font-semibold text-slate-500 block">
                  Today's Attendance
                </span>
                <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {isSundayToday ? 'Sunday (Off)' : todayStatus}
                </div>

                {/* Calendar punch icon graphic */}
                <div className="my-3 flex items-center justify-start">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-2xs ${
                      isSundayToday
                        ? 'bg-blue-50/80 text-blue-600 border-blue-200/70'
                        : todayStatus === 'Present'
                        ? 'bg-emerald-50/80 text-emerald-600 border-emerald-200/70'
                        : todayStatus === 'Absent'
                        ? 'bg-rose-50/80 text-rose-600 border-rose-200/70'
                        : 'bg-amber-50/80 text-amber-600 border-amber-200/70'
                    }`}
                  >
                    {isSundayToday ? (
                      <Sun className="w-6 h-6" />
                    ) : todayStatus === 'Present' ? (
                      <CheckCircle2 className="w-6 h-6" />
                    ) : todayStatus === 'Absent' ? (
                      <XCircle className="w-6 h-6" />
                    ) : (
                      <Calendar className="w-6 h-6" />
                    )}
                  </div>
                </div>
              </div>

              {/* Card Footer: Date & Pill */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">
                  {CURRENT_DATE.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
                    isSundayToday
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : todayStatus === 'Present'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : todayStatus === 'Absent'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isSundayToday
                        ? 'bg-blue-500'
                        : todayStatus === 'Present'
                        ? 'bg-emerald-500'
                        : todayStatus === 'Absent'
                        ? 'bg-rose-500'
                        : 'bg-amber-500'
                    }`}
                  />
                  <span>
                    {isSundayToday
                      ? 'Weekend'
                      : todayStatus === 'Present'
                      ? 'Present'
                      : todayStatus === 'Absent'
                      ? 'Absent'
                      : 'Not Marked'}
                  </span>
                </span>
              </div>
            </div>

            {/* Card 2: Leave Taken with Graphical Donut Chart */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-500">
                    Leave Taken
                  </span>
                  {/* Segmented Filter Pills */}
                  <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg text-[10px] font-medium border border-slate-200/60">
                    <button
                      type="button"
                      onClick={() => setLeaveFilter('year')}
                      className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                        leaveFilter === 'year'
                          ? 'bg-white text-slate-900 font-bold shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Year
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeaveFilter('month')}
                      className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                        leaveFilter === 'month'
                          ? 'bg-white text-slate-900 font-bold shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Month
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeaveFilter('total')}
                      className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                        leaveFilter === 'total'
                          ? 'bg-white text-slate-900 font-bold shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Total
                    </button>
                  </div>
                </div>

                {/* Sub-selector for Month / Year */}
                {leaveFilter === 'month' && (
                  <div className="flex items-center justify-between gap-1 my-1.5 p-1 bg-slate-50 border border-slate-200/80 rounded-lg text-xs">
                    <button
                      type="button"
                      onClick={handlePrevLeaveMonth}
                      className="p-1 rounded hover:bg-slate-200 text-slate-600 transition cursor-pointer"
                      title="Previous Month"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={leaveFilterMonth}
                        onChange={(e) => setLeaveFilterMonth(Number(e.target.value))}
                        className="px-1.5 py-0.5 rounded border border-slate-200 bg-white text-[11px] font-semibold text-slate-800 focus:outline-none cursor-pointer"
                      >
                        {MONTH_NAMES.map((m, idx) => (
                          <option key={m} value={idx + 1}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <select
                        value={leaveFilterYear}
                        onChange={(e) => setLeaveFilterYear(Number(e.target.value))}
                        className="px-1.5 py-0.5 rounded border border-slate-200 bg-white text-[11px] font-semibold text-slate-800 focus:outline-none cursor-pointer"
                      >
                        {YEAR_OPTIONS.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={handleNextLeaveMonth}
                      className="p-1 rounded hover:bg-slate-200 text-slate-600 transition cursor-pointer"
                      title="Next Month"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {leaveFilter === 'year' && (
                  <div className="flex items-center gap-1.5 my-1.5 p-1 bg-slate-50 border border-slate-200/80 rounded-lg text-xs">
                    <span className="text-[11px] text-slate-500 font-medium pl-1">Year:</span>
                    <select
                      value={leaveFilterYear}
                      onChange={(e) => setLeaveFilterYear(Number(e.target.value))}
                      className="px-2 py-0.5 rounded border border-slate-200 bg-white text-[11px] font-semibold text-slate-800 focus:outline-none cursor-pointer"
                    >
                      {YEAR_OPTIONS.map((y) => (
                        <option key={y} value={y}>
                          Calendar Year {y}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Big number and Donut Chart side by side */}
                <div className="flex items-center justify-between mt-2">
                  <div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                      {displayedLeaveTaken} days
                    </div>
                    <span className="text-xs text-slate-400 block mt-0.5">
                      {leaveFilter === 'month'
                        ? `${MONTH_NAMES[leaveFilterMonth - 1]} ${leaveFilterYear}`
                        : leaveFilter === 'year'
                        ? `Calendar year ${leaveFilterYear}`
                        : 'All-time total'}
                    </span>
                  </div>

                  {/* Circular Donut Graphic */}
                  <DonutChart used={displayedLeaveTaken} total={accruedAllowance} size={66} />
                </div>
              </div>

              {/* Card Footer: Legend Dots */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>
                    {leaveFilter === 'month' ? 'Month' : leaveFilter === 'total' ? 'Total' : 'Year'} Used:{' '}
                    <strong>{displayedLeaveTaken}d</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#0284c7]" />
                  <span>
                    Annual Left: <strong>{remainingAllowance}d</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Card 3: Accrued Leaves with Graphical Sparkline Wave */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-500">
                    Accrued Leaves
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                    +2.5 d/mo
                  </span>
                </div>

                <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {accruedAllowance} days
                </div>

                <span className="text-xs text-slate-400 block mt-0.5">
                  Earned annual quota
                </span>
              </div>

              {/* Upward Accrual Sparkline Wave Graphic */}
              <div className="mt-2 pt-1">
                <AccrualWave />
              </div>

              {/* Card Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Rate: <strong>2.5 d/mo</strong></span>
                <span className="text-emerald-600 font-semibold">Active</span>
              </div>
            </div>

            {/* Card 4: Remaining Leaves with Graphical Wave */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-500">
                    Remaining Leaves
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                      isExceeded
                        ? 'bg-rose-50 text-rose-700 border-rose-200/80'
                        : 'bg-sky-50 text-sky-700 border-sky-200/80'
                    }`}
                  >
                    {isExceeded ? 'Exceeded' : 'Available'}
                  </span>
                </div>

                <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {remainingAllowance} days
                </div>

                <span className="text-xs text-slate-400 block mt-0.5">
                  {isExceeded
                    ? `Exceeds quota by ${excessDays} ${excessDays === 1 ? 'day' : 'days'}`
                    : 'Balance available to take'}
                </span>
              </div>

              {/* Balance Wave Sparkline Graphic */}
              <div className="mt-2 pt-1">
                <RemainingWave isExceeded={isExceeded} />
              </div>

              {/* Card Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Used: <strong>{leaveTakenYear}d</strong> of {accruedAllowance}d
                </span>
                <span
                  className={`font-semibold ${
                    isExceeded ? 'text-rose-600' : 'text-sky-600'
                  }`}
                >
                  {isExceeded
                    ? `-${excessDays}d`
                    : `${accruedAllowance > 0 ? Math.round((remainingAllowance / accruedAllowance) * 100) : 0}% left`}
                </span>
              </div>
            </div>
          </div>

          {/* 4. Month Attendance Health Bar with Graphical Target Marker & Verification Ribbon */}
          <MonthlyHealthCard
            initialSummary={data?.monthlyAttendance}
            userId={user?.userId}
            userName={user?.fullName}
            userRole={user?.role}
            userEmail={user?.email}
            showDownloadSlip={true}
          />

          {/* 5. Two Side-by-Side White Cards: Recent Attendance & Recent Leave Records */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
            {/* Card A: Recent Attendance */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Recent Attendance
                </h3>
                <Link
                  to="/attendance/my"
                  className="text-xs font-semibold text-[#1a73e8] hover:text-[#1557b0] transition"
                >
                  View All &gt;
                </Link>
              </div>

              <div className="flex-1 overflow-x-auto">
                {data.recentAttendance && data.recentAttendance.length > 0 ? (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px]">
                        <th className="py-2.5 px-3 font-semibold">Date</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/70">
                      {data.recentAttendance.slice(0, 6).map((att: any, idx: number) => {
                        const attDate = att.AttendanceDate || att.Date || att.date || att.attendanceDate;
                        const attStatus = att.Status || att.status;
                        const isPresent = attStatus === 'Present';
                        const isAbsent = attStatus === 'Absent';
                        return (
                          <tr key={att.AttendanceID || idx} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-3 font-medium text-slate-800 whitespace-nowrap">
                              {formatDisplayDate(attDate)}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <span
                                className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold border ${
                                  isPresent
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                                    : isAbsent
                                    ? 'bg-rose-50 text-rose-700 border-rose-200/80'
                                    : 'bg-slate-100 text-slate-700 border-slate-200/80'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isPresent ? 'bg-emerald-500' : isAbsent ? 'bg-rose-500' : 'bg-slate-400'
                                  }`}
                                />
                                <span>{attStatus}</span>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-10 text-center text-xs text-slate-400">
                    No recent attendance recorded.
                  </div>
                )}
              </div>
            </div>

            {/* Card B: Recent Leave Records */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                    Leave Records
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    {leaveFilter === 'month'
                      ? `Notices for ${MONTH_NAMES[leaveFilterMonth - 1]} ${leaveFilterYear}`
                      : leaveFilter === 'year'
                      ? `Notices for year ${leaveFilterYear}`
                      : 'All recorded notices'}
                  </span>
                </div>
                <Link
                  to="/leave/my"
                  className="text-xs font-semibold text-[#1a73e8] hover:text-[#1557b0] transition"
                >
                  View All &gt;
                </Link>
              </div>

              <div className="flex-1 overflow-x-auto">
                {filteredLeaveRecords && filteredLeaveRecords.length > 0 ? (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px]">
                        <th className="py-2.5 px-3 font-semibold">Leave Period</th>
                        <th className="py-2.5 px-3 font-semibold">Type</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/70">
                      {filteredLeaveRecords.slice(0, 6).map((req) => {
                        const isWithdrawn = req.Status === 'Withdrawn' || req.Status === 'Cancelled';
                        return (
                          <tr key={req.LeaveRequestID} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-3 font-medium text-slate-800 whitespace-nowrap">
                              {formatLeavePeriod(req.StartDate, req.EndDate)}
                            </td>
                            <td className="py-3 px-3 text-slate-600 font-medium">
                              {req.LeaveType}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <span
                                className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold border ${
                                  isWithdrawn
                                    ? 'bg-rose-50 text-rose-700 border-rose-200/80'
                                    : 'bg-blue-50 text-blue-700 border-blue-200/80'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isWithdrawn ? 'bg-rose-500' : 'bg-blue-500'
                                  }`}
                                />
                                <span>{isWithdrawn ? 'Withdrawn' : 'Recorded'}</span>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-10 text-center text-xs text-slate-400">
                    No leave requests recorded for this period.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 6. Upcoming Holidays */}
          {data.upcomingHolidays && data.upcomingHolidays.length > 0 && (
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-slate-600" />
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                    Upcoming Official Holidays
                  </h3>
                </div>
                <Link
                  to="/holidays"
                  className="text-xs font-semibold text-[#1a73e8] hover:text-[#1557b0] transition"
                >
                  View All &gt;
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {data.upcomingHolidays.slice(0, 4).map((h) => (
                  <div
                    key={h.HolidayID}
                    className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/60 flex flex-col justify-between hover:border-slate-300 transition-colors"
                  >
                    <div>
                      <span className="text-xs font-bold text-slate-800 block truncate">
                        {h.HolidayName}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono mt-1 block">
                        {h.HolidayDate}
                      </span>
                    </div>
                    {h.Description && (
                      <p className="text-[10px] text-slate-400 mt-2 truncate font-normal">
                        {h.Description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();

  // Admin users are served the Admin Dashboard View
  if (user?.role === 'Admin') {
    return <AdminDashboardView />;
  }

  // Default to Staff Dashboard view
  return <StaffDashboardView />;
};

export default DashboardPage;
