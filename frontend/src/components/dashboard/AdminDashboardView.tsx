import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdminDashboard, markDailyAttendance } from '../../services/api';
import type { AdminDashboardData } from '../../services/api';
import { useToast } from '../common/useToast';
import {
  RotateCcw,
  AlertCircle,
  Sparkles,
  Sun,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CalendarCheck,
  ArrowRight,
  Check,
  CalendarDays,
} from 'lucide-react';

// Mini SVG Donut for Present Today Card
const MiniDonut: React.FC<{ percent: number; color?: string; size?: number }> = ({
  percent,
  color = '#10b981',
  size = 38,
}) => {
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const validPercent = Math.min(100, Math.max(0, percent));
  const strokeDashoffset = circumference - (validPercent / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e2e8f0" strokeWidth={strokeWidth} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        fill="none"
        className="transition-all duration-700 ease-out"
      />
    </svg>
  );
};

// Amber Sparkline Wave for Not Marked Card
const AmberSparkline: React.FC = () => {
  return (
    <div className="w-14 h-7 overflow-hidden">
      <svg viewBox="0 0 60 28" className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="amberWaveGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d="M0,22 C15,22 25,18 40,12 C48,8 54,6 60,4 L60,28 L0,28 Z" fill="url(#amberWaveGrad)" />
        <path d="M0,22 C15,22 25,18 40,12 C48,8 54,6 60,4" stroke="#f59e0b" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
};

export const AdminDashboardView: React.FC = () => {
  const toast = useToast();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [quickMarking, setQuickMarking] = useState<boolean>(false);
  const [fallbackTodayStr] = useState(() => new Date().toISOString().slice(0, 10));

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminDashboard();
      setData(res.dashboard);
    } catch (err: any) {
      setError(err?.message || 'Failed to load admin dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatReturnNotice = (endDateStr: string, todayStr: string): string => {
    if (!endDateStr) return '';
    if (endDateStr === todayStr) {
      return 'Returns tomorrow';
    }
    try {
      const end = new Date(endDateStr + 'T00:00:00');
      return `Returns after ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    } catch {
      return `Until ${endDateStr}`;
    }
  };

  const handleQuickMarkAllPresent = async () => {
    if (!data?.staffAttendance || data.staffAttendance.length === 0) return;
    const unmarked = data.staffAttendance.filter((s) => s.status === 'Not Marked');
    if (unmarked.length === 0) {
      toast.info('No staff members are currently pending attendance marking.');
      return;
    }

    const targetDate = data.selectedDate || new Date().toISOString().slice(0, 10);
    const confirmed = window.confirm(
      `Mark all ${unmarked.length} remaining unmarked staff members as "Present" for ${targetDate}?`
    );
    if (!confirmed) return;

    setQuickMarking(true);
    try {
      await markDailyAttendance(
        targetDate,
        unmarked.map((s) => ({ userId: s.userId, status: 'Present' }))
      );
      toast.success(`Successfully marked ${unmarked.length} staff members as Present!`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to mark attendance');
    } finally {
      setQuickMarking(false);
    }
  };

  const attendanceSummary = data?.attendanceSummary || {
    totalStaff: data?.totalActiveStaff ?? data?.totalStaff ?? 0,
    presentCount: data?.presentCount ?? 0,
    absentCount: data?.absentCount ?? 0,
    notMarkedCount: data?.notMarkedCount ?? 0,
    isSunday: false,
    isHoliday: false,
    holidayName: undefined,
  };

  const totalStaff = attendanceSummary.totalStaff || 1;
  const presentPercent = Math.round((attendanceSummary.presentCount / totalStaff) * 100);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* 1. Breadcrumb & Header Row (matching graphical mockup) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
        <div>
          <div className="text-xs text-slate-400 font-medium mb-1">
            Dashboard
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Admin Dashboard
            </h1>
          </div>
        </div>

        {/* Access validation pills & Action Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Access Validated Pills */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Access Validated</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Role: Admin</span>
          </span>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 text-xs font-medium transition cursor-pointer shadow-2xs hover:bg-slate-50 disabled:opacity-50"
            title="Refresh dashboard"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          <Link
            to="/attendance/marking"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#0e1d34] hover:bg-[#162744] text-white text-xs sm:text-sm font-semibold transition active:scale-95 shadow-sm text-center"
          >
            <CalendarCheck className="w-4 h-4 text-white" />
            <span>Mark Attendance</span>
          </Link>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="font-medium underline hover:text-rose-950 ml-4 cursor-pointer text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {/* Special Day Notifications */}
      {attendanceSummary.isSunday && (
        <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5">
          <Sun className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Sunday (Weekly Off)</span>
        </div>
      )}

      {attendanceSummary.isHoliday && (
        <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-900 text-xs flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            Institute Holiday: <strong>{attendanceSummary.holidayName}</strong>
          </span>
        </div>
      )}

      {loading ? (
        <div className="space-y-5 animate-pulse">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-36 bg-slate-200/70 rounded-2xl" />
            ))}
          </div>
          <div className="h-28 bg-slate-200/70 rounded-2xl" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="h-64 bg-slate-200/70 rounded-2xl" />
            <div className="h-64 bg-slate-200/70 rounded-2xl" />
          </div>
        </div>
      ) : (
        <>
          {/* Widget 1: Today's Pending Attendance Triage Banner */}
          {!attendanceSummary.isSunday && !attendanceSummary.isHoliday && attendanceSummary.notMarkedCount > 0 && (
            <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/90 border border-amber-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-amber-950">Pending Attendance Triage</h3>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-200 text-amber-900">
                      {attendanceSummary.notMarkedCount} Pending
                    </span>
                  </div>
                  <p className="text-xs text-amber-800 mt-1">
                    {attendanceSummary.notMarkedCount} staff member{attendanceSummary.notMarkedCount > 1 ? 's have' : ' has'} not been marked for today ({data?.selectedDate || 'today'}).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 sm:self-center shrink-0">
                <button
                  type="button"
                  onClick={handleQuickMarkAllPresent}
                  disabled={quickMarking}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-semibold transition disabled:opacity-60 cursor-pointer shadow-2xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{quickMarking ? 'Marking...' : 'Mark All Present'}</span>
                </button>
                <Link
                  to={`/attendance/marking${data?.selectedDate ? `?date=${data.selectedDate}` : ''}`}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 text-xs font-semibold transition shadow-2xs"
                >
                  <span>Review & Mark</span>
                  <ArrowRight className="w-3.5 h-3.5 text-amber-700" />
                </Link>
              </div>
            </div>
          )}

          {/* Widget 2: Allowance Exceeded Warning Banner */}
          {data?.leaveSummary?.exceedingStaff && data.leaveSummary.exceedingStaff.length > 0 && (
            <div className="p-4 sm:p-5 rounded-2xl bg-rose-50/90 border border-rose-200/90 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-rose-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-rose-950 flex items-center gap-2">
                      <span>Allowance Exceeded Warning</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-200 text-rose-900">
                        {data.leaveSummary.exceedingStaff.length} Staff
                      </span>
                    </h3>
                    <p className="text-xs text-rose-800">
                      Staff members who have consumed more leave days than their accrued annual allowance.
                    </p>
                  </div>
                </div>

                <Link
                  to="/admin/leave-balances"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white hover:bg-rose-100 text-rose-900 border border-rose-200 text-xs font-semibold transition shrink-0 self-start sm:self-center shadow-2xs"
                >
                  <span>Adjust Quotas</span>
                  <ArrowRight className="w-3.5 h-3.5 text-rose-700" />
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 mt-3">
                {data.leaveSummary.exceedingStaff.map((staff) => (
                  <div
                    key={staff.userId}
                    className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-rose-200/80 shadow-2xs"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-semibold text-slate-900 text-xs block truncate">
                        {staff.fullName}
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        {staff.leaveTaken} taken / {staff.accruedAllowance} accrued
                      </span>
                    </div>
                    <span className="shrink-0 font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md text-[11px] border border-rose-200">
                      +{staff.excessDays}d
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Staff Metrics (4 Graphical Cards) */}
          <div>
            <h2 className="text-sm font-bold text-slate-800 mb-3 tracking-tight">Staff Metrics</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {/* 1. Present Today */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <MiniDonut percent={presentPercent} color="#10b981" />
                </div>

                <div className="mt-3">
                  <span className="text-xs font-semibold text-slate-500 block">
                    Present Today
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                      {attendanceSummary.presentCount}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                      <span className="w-1 h-1 rounded-full bg-emerald-500" />
                      <span>Active</span>
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 mt-3 pt-2.5 border-t border-slate-100">
                  Staff marked personnel
                </p>
              </div>

              {/* 2. Absent Today */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-rose-100/70 text-rose-600 flex items-center justify-center">
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </div>
                </div>

                <div className="mt-3">
                  <span className="text-xs font-semibold text-slate-500 block">
                    Absent Today
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                      {attendanceSummary.absentCount}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/80">
                      <span className="w-1 h-1 rounded-full bg-rose-500" />
                      <span>Absences</span>
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 mt-3 pt-2.5 border-t border-slate-100">
                  Excludes Sundays &amp; holidays
                </p>
              </div>

              {/* 3. Not Marked */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                  <AmberSparkline />
                </div>

                <div className="mt-3">
                  <span className="text-xs font-semibold text-slate-500 block">
                    Not Marked
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                      {attendanceSummary.notMarkedCount}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/80">
                      <span className="w-1 h-1 rounded-full bg-amber-500" />
                      <span>Pending</span>
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 mt-3 pt-2.5 border-t border-slate-100">
                  Awaiting daily attendance
                </p>
              </div>

              {/* 4. Total Staff */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="flex items-center -space-x-1.5">
                    <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                      A
                    </div>
                    <div className="w-6 h-6 rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                      B
                    </div>
                    <div className="w-6 h-6 rounded-full bg-slate-600 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                      +
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <span className="text-xs font-semibold text-slate-500 block">
                    Total Staff
                  </span>
                  <div className="mt-1">
                    <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                      {attendanceSummary.totalStaff}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 mt-3 pt-2.5 border-t border-slate-100">
                  Registered active personnel
                </p>
              </div>
            </div>
          </div>

          {/* Widget 3: Who is on Leave Today (Live Roster Card) */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center">
                  <CalendarDays className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <span>Who is on Leave Today</span>
                    {data?.onLeaveToday && data.onLeaveToday.length > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                        {data.onLeaveToday.length} Out Today
                      </span>
                    )}
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Active leave roster for {data?.selectedDate || 'today'}
                  </span>
                </div>
              </div>

              <Link
                to="/leave/requests"
                className="text-xs font-semibold text-[#1a73e8] hover:text-[#1557b0] transition flex items-center gap-1"
              >
                <span>Leave Records</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {data?.onLeaveToday && data.onLeaveToday.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.onLeaveToday.map((person, idx) => {
                  const todayStr = data?.selectedDate || fallbackTodayStr;
                  const returnNote = formatReturnNotice(person.endDate, todayStr);
                  return (
                    <div
                      key={`${person.userId}-${idx}`}
                      className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                              {(person.fullName || person.userId).slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs font-bold text-slate-900 truncate">
                                {person.fullName}
                              </h4>
                              <p className="text-[11px] text-slate-400 truncate">
                                {person.role || 'Staff'} • {person.email || person.userId}
                              </p>
                            </div>
                          </div>
                          <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                            {person.leaveType}
                          </span>
                        </div>

                        {person.reason && (
                          <p className="mt-2 text-[11px] text-slate-600 italic bg-white p-2 rounded-lg border border-slate-100 line-clamp-2">
                            "{person.reason}"
                          </p>
                        )}
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 font-medium">
                          {person.startDate} &rarr; {person.endDate} ({person.calculatedDays}d)
                        </span>
                        {returnNote && (
                          <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/70 text-[10px]">
                            {returnNote}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-500 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5 opacity-80" />
                <p className="font-semibold text-slate-700">No staff members on leave today</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  All active staff are scheduled to be available.
                </p>
              </div>
            )}
          </div>

          {/* Section: Two Clean Graphical Tables: Recent Leave Notices & Recent Activity Trail */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
            {/* Left: Recent Leave Notices */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Recent Leave Notices
                </h3>
                <Link
                  to="/leave/requests"
                  className="text-xs font-semibold text-[#1a73e8] hover:text-[#1557b0] transition"
                >
                  View All &gt;
                </Link>
              </div>

              <div className="flex-1 overflow-x-auto">
                {data?.recentRequests && data.recentRequests.length > 0 ? (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px]">
                        <th className="py-2.5 px-3">Staff</th>
                        <th className="py-2.5 px-3">Leave Period</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/70">
                      {data.recentRequests.slice(0, 5).map((req: any, idx: number) => {
                        const isWithdrawn = req.Status === 'Withdrawn' || (req as any).status === 'Withdrawn';
                        return (
                          <tr key={req.RequestID || idx} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-3 font-semibold text-slate-900 whitespace-nowrap">
                              {req.FullName || req.UserID}
                            </td>
                            <td className="py-3 px-3 text-slate-600 whitespace-nowrap font-medium">
                              {req.StartDate} &rarr; {req.EndDate}
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
                    No leave requests recorded.
                  </div>
                )}
              </div>
            </div>

            {/* Right: Recent Activity Trail with Connected Dot Trail */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Recent Activity Trail
                </h3>
                <Link
                  to="/admin/activity-logs"
                  className="text-xs font-semibold text-[#1a73e8] hover:text-[#1557b0] transition"
                >
                  View All &gt;
                </Link>
              </div>

              <div className="flex-1">
                {data?.recentActivityLogs && data.recentActivityLogs.length > 0 ? (
                  <div className="space-y-3 pt-1">
                    {data.recentActivityLogs.slice(0, 4).map((log, idx) => (
                      <div key={log.LogID || idx} className="flex items-center gap-3 text-xs">
                        {/* Time */}
                        <span className="text-slate-400 font-mono text-[11px] w-14 shrink-0">
                          {log.Timestamp
                            ? new Date(log.Timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </span>

                        {/* Connected Dot indicator */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              idx === 0
                                ? 'bg-emerald-500 ring-2 ring-emerald-200'
                                : idx === 1
                                ? 'bg-blue-500'
                                : 'bg-slate-400'
                            }`}
                          />
                        </div>

                        {/* Activity Description */}
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-slate-800">
                            {log.Action}
                          </span>
                          <span className="text-slate-500 text-[11px] ml-1.5 truncate">
                            ({log.PerformedBy})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-10 text-center text-xs text-slate-400">
                    No recent activity recorded.
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
