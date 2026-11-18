import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchMyLeaveRequests,
  fetchLeaveBalance,
  withdrawLeaveRequest,
} from '../services/api';
import type {
  LeaveRequestItem,
  LeaveBalanceItem,
} from '../services/api';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { CardSkeleton } from '../components/common/LoadingSkeleton';
import { useToast } from '../components/common/useToast';
import {
  Clock,
  PlusCircle,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  CalendarCheck2,
  Sparkles,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Award,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const YEAR_OPTIONS = Array.from(
  { length: 15 },
  (_, i) => CURRENT_YEAR - 4 + i
);

/**
 * Calculates how many leave days of a request fall within a specific month and year (or full year).
 */
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

export const MyLeavePage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [requests, setRequests] = useState<LeaveRequestItem[]>([]);
  const [balance, setBalance] = useState<LeaveBalanceItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [leaveFilter, setLeaveFilter] = useState<'year' | 'month' | 'total'>('year');
  const [filterYear, setFilterYear] = useState<number>(CURRENT_YEAR);
  const [filterMonth, setFilterMonth] = useState<number>(CURRENT_MONTH);

  // Withdrawal state
  const [selectedLeaveToWithdraw, setSelectedLeaveToWithdraw] = useState<LeaveRequestItem | null>(null);
  const [withdrawReason, setWithdrawReason] = useState<string>('');
  const [withdrawing, setWithdrawing] = useState<boolean>(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const userId = user?.userId;
  const [todayStr] = useState(() => new Date().toISOString().split('T')[0]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reqRes, balRes] = await Promise.all([
        fetchMyLeaveRequests(),
        fetchLeaveBalance(userId, CURRENT_YEAR),
      ]);
      setRequests(reqRes.requests || (reqRes as any).data || []);
      setBalance(balRes.balance || (balRes as any).data || null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load leave data');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Active requests (excluding Withdrawn / Cancelled notices)
  const activeRequests = useMemo(() => {
    return requests.filter((r) => r.Status !== 'Withdrawn' && r.Status !== 'Cancelled');
  }, [requests]);

  // Regular leaves counting against casual balance (excluding exempt special leaves)
  const regularActiveRequests = useMemo(() => {
    return activeRequests.filter(
      (r) => !(r.Remarks && r.Remarks.includes('(Exempt from Regular Balance)'))
    );
  }, [activeRequests]);

  const totalLeaveTaken = useMemo(() => {
    return Math.round(
      activeRequests.reduce((sum, r) => sum + (parseFloat(String(r.CalculatedDays || 0)) || 0), 0) * 100
    ) / 100;
  }, [activeRequests]);

  const displayedLeaveTaken = useMemo(() => {
    if (leaveFilter === 'month') {
      const sum = activeRequests.reduce(
        (acc, r) => acc + calculateLeaveDaysInPeriod(r, filterYear, filterMonth),
        0
      );
      return Math.round(sum * 100) / 100;
    }
    if (leaveFilter === 'year') {
      const yearRequests = activeRequests.reduce(
        (acc, r) => acc + calculateLeaveDaysInPeriod(r, filterYear),
        0
      );
      if (filterYear === CURRENT_YEAR) {
        return Math.max(Number(balance?.UsedLeave) || 0, Math.round(yearRequests * 100) / 100);
      }
      return Math.round(yearRequests * 100) / 100;
    }
    return totalLeaveTaken;
  }, [activeRequests, leaveFilter, filterYear, filterMonth, balance?.UsedLeave, totalLeaveTaken]);

  const effectiveCarried = Number(
    balance?.effectiveCarriedForward ??
      (balance?.isCarryForwardExpired ? 0 : balance?.CarriedForward ?? 0)
  );
  const accruedAllowance =
    Math.round(((Number(balance?.EarnedLeave) || 0) + effectiveCarried) * 100) / 100;
  const leaveTakenAnnual = Math.max(
    Number(balance?.UsedLeave) || 0,
    Math.round(regularActiveRequests.reduce((acc, r) => acc + calculateLeaveDaysInPeriod(r, CURRENT_YEAR), 0) * 100) / 100
  );
  const isExceeded = leaveTakenAnnual > accruedAllowance;
  const excessDays = Math.round((leaveTakenAnnual - accruedAllowance) * 100) / 100;
  const remainingAllowance = Math.max(0, Math.round((accruedAllowance - leaveTakenAnnual) * 100) / 100);

  const handlePrevMonth = () => {
    if (filterMonth === 1) {
      setFilterMonth(12);
      setFilterYear((y) => y - 1);
    } else {
      setFilterMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (filterMonth === 12) {
      setFilterMonth(1);
      setFilterYear((y) => y + 1);
    } else {
      setFilterMonth((m) => m + 1);
    }
  };

  // Can withdraw if upcoming and not already withdrawn/cancelled
  const canWithdraw = (r: LeaveRequestItem) => {
    if (r.Status === 'Withdrawn' || r.Status === 'Cancelled') return false;
    return Boolean(r.StartDate && r.StartDate >= todayStr);
  };

  const handleOpenWithdrawModal = (req: LeaveRequestItem) => {
    setSelectedLeaveToWithdraw(req);
    setWithdrawReason('');
    setWithdrawError(null);
  };

  const handleConfirmWithdraw = async () => {
    if (!selectedLeaveToWithdraw) return;
    setWithdrawing(true);
    setWithdrawError(null);
    try {
      const res = await withdrawLeaveRequest(
        selectedLeaveToWithdraw.LeaveRequestID,
        withdrawReason.trim() || undefined
      );
      toast.success(res.message || 'Leave request withdrawn successfully', 'Withdrawn');
      // Update local state immediately
      setRequests((prev) =>
        prev.map((r) =>
          r.LeaveRequestID === selectedLeaveToWithdraw.LeaveRequestID
            ? { ...r, Status: 'Withdrawn' }
            : r
        )
      );
      setSelectedLeaveToWithdraw(null);
      // Reload balance in background to update server state
      loadData();
    } catch (err: any) {
      const msg = err?.message || 'Failed to withdraw leave request';
      setWithdrawError(msg);
      toast.error(msg, 'Withdrawal Failed');
    } finally {
      setWithdrawing(false);
    }
  };

  const leaveFilterSubtitle =
    leaveFilter === 'month'
      ? `Month of ${MONTH_NAMES[filterMonth - 1]} ${filterYear}`
      : leaveFilter === 'total'
      ? 'All recorded leaves (all-time)'
      : `Calendar year ${filterYear}`;

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (!r.StartDate || !r.EndDate) return false;
      const s = r.StartDate.trim();
      const e = r.EndDate.trim();

      if (leaveFilter === 'month') {
        const mStr = String(filterMonth).padStart(2, '0');
        const daysInMonth = new Date(Date.UTC(filterYear, filterMonth, 0)).getUTCDate();
        const mStart = `${filterYear}-${mStr}-01`;
        const mEnd = `${filterYear}-${mStr}-${String(daysInMonth).padStart(2, '0')}`;
        return s <= mEnd && e >= mStart;
      }
      if (leaveFilter === 'year') {
        const yStart = `${filterYear}-01-01`;
        const yEnd = `${filterYear}-12-31`;
        return s <= yEnd && e >= yStart;
      }
      return true; // 'total'
    });
  }, [requests, leaveFilter, filterYear, filterMonth]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <PageHeader
        title="My Leave & Allowance"
        subtitle={
          <span>
            Calendar year{' '}
            <strong className="text-slate-700 font-semibold">{CURRENT_YEAR}</strong>
          </span>
        }
        actions={
          <Link
            to="/leave/submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-2xs transition"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Submit Leave</span>
          </Link>
        }
      />

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="font-semibold underline hover:text-rose-950 ml-4 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Prior-Year Transition Pending Banner */}
      {balance?.transitionPending && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Prior-Year Transition Pending:</strong> Prior-year carry forward transition is pending processing by the Administrator.
          </span>
        </div>
      )}

      {/* Carried Forward Expiry Notice */}
      {balance?.isCarryForwardExpired && Number(balance?.CarriedForward) > 0 && (
        <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-slate-500 shrink-0" />
          <span>Carried forward leave: Expired after March 31. Earned leave remains active.</span>
        </div>
      )}

      {/* Clear Visual Distinction: Normal vs Warning */}
      {isExceeded ? (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="font-semibold text-amber-950">
            Leave taken exceeds accrued allowance by {excessDays} {excessDays === 1 ? 'day' : 'days'}.
          </span>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold text-emerald-950">
            Leave taken is within your accrued allowance ({leaveTakenAnnual}d of {accruedAllowance}d taken in {CURRENT_YEAR}).
          </span>
        </div>
      )}

      {loading ? (
        <CardSkeleton count={3} />
      ) : (
        <>
          {/* Key Metric Cards: 3 Unified Focused Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
            {/* 1. Leave Taken (with filter: Year / Month / Total) */}
            <div className="group relative bg-white border border-slate-200/80 rounded-xl p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-150 hover:border-slate-300 hover:shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400 group-hover:text-slate-500 transition-colors">
                    Leave Taken
                  </span>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border border-slate-100 bg-slate-50 text-slate-600">
                    <CalendarCheck2 className="w-3.5 h-3.5" />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
                  <span className="text-2xl sm:text-[26px] font-bold tracking-tight text-slate-900 tabular-nums leading-tight">
                    {displayedLeaveTaken}d
                  </span>

                  {/* Segmented Filter Pills */}
                  <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg text-[10px] font-medium">
                    <button
                      type="button"
                      onClick={() => setLeaveFilter('year')}
                      className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        leaveFilter === 'year'
                          ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Year
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeaveFilter('month')}
                      className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        leaveFilter === 'month'
                          ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Month
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeaveFilter('total')}
                      className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        leaveFilter === 'total'
                          ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Total
                    </button>
                  </div>
                </div>

                {/* Sub-selector Controls for Month or Year */}
                {leaveFilter === 'month' && (
                  <div className="flex items-center justify-between gap-1 mt-2.5 p-1.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs">
                    <button
                      type="button"
                      onClick={handlePrevMonth}
                      className="p-1 rounded hover:bg-slate-200 text-slate-600 transition cursor-pointer"
                      title="Previous Month"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={filterMonth}
                        onChange={(e) => setFilterMonth(Number(e.target.value))}
                        className="px-1.5 py-0.5 rounded border border-slate-200 bg-white text-[11px] font-semibold text-slate-800 focus:outline-none cursor-pointer"
                      >
                        {MONTH_NAMES.map((m, idx) => (
                          <option key={m} value={idx + 1}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <select
                        value={filterYear}
                        onChange={(e) => setFilterYear(Number(e.target.value))}
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
                      onClick={handleNextMonth}
                      className="p-1 rounded hover:bg-slate-200 text-slate-600 transition cursor-pointer"
                      title="Next Month"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {leaveFilter === 'year' && (
                  <div className="flex items-center gap-1.5 mt-2.5 p-1.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs">
                    <span className="text-[11px] text-slate-500 font-medium pl-1">Year:</span>
                    <select
                      value={filterYear}
                      onChange={(e) => setFilterYear(Number(e.target.value))}
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
              </div>

              <p className="text-[11px] text-slate-400 mt-2.5 truncate font-normal">
                {leaveFilterSubtitle}
              </p>
            </div>

            {/* 2. Total Accrued Allowance */}
            <StatCard
              title="Accrued Allowance"
              value={`${accruedAllowance}d`}
              subtitle="2.5d / month"
              icon={Sparkles}
              iconColor="text-emerald-600"
              iconBg="bg-emerald-50"
            />

            {/* 3. Remaining Allowance */}
            <StatCard
              title="Remaining Allowance"
              value={`${remainingAllowance}d`}
              subtitle={isExceeded ? `Exceeds allowance by ${excessDays}d` : 'Remaining balance'}
              icon={isExceeded ? AlertTriangle : CheckCircle2}
              iconColor={isExceeded ? 'text-amber-600' : 'text-emerald-600'}
              iconBg={isExceeded ? 'bg-amber-50/60' : 'bg-emerald-50/60'}
              badge={{
                text: isExceeded ? 'Warning: Exceeded' : 'Normal',
                variant: isExceeded ? 'amber' : 'emerald',
              }}
            />
          </div>

          {/* Clean Leave History Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Recorded Leave History</h3>
                <p className="text-[11px] text-slate-500">
                  {leaveFilter === 'year' && `Showing notices for ${filterYear} (${filteredRequests.length} of ${requests.length} total)`}
                  {leaveFilter === 'month' && `Showing notices for ${MONTH_NAMES[filterMonth - 1]} ${filterYear} (${filteredRequests.length} of ${requests.length} total)`}
                  {leaveFilter === 'total' && `Chronological records of submitted notices (${requests.length} total)`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Segmented Filter for Table */}
                <div className="inline-flex items-center p-0.5 bg-slate-100 border border-slate-200/80 rounded-lg text-[10px] font-medium">
                  <button
                    type="button"
                    onClick={() => setLeaveFilter('year')}
                    className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                      leaveFilter === 'year'
                        ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Year
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeaveFilter('month')}
                    className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                      leaveFilter === 'month'
                        ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Month
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeaveFilter('total')}
                    className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                      leaveFilter === 'total'
                        ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Total
                  </button>
                </div>

                <Link
                  to="/leave/submit"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 ml-1"
                >
                  <span>Submit Notice</span>
                  <PlusCircle className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            <div className="overflow-x-auto">
              {filteredRequests.length > 0 ? (
                <>
                  <div className="hidden md:block">
                    <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 uppercase bg-slate-50/30 text-[10px]">
                      <th className="py-3 px-4 font-semibold">Date Range</th>
                      <th className="py-3 px-4 font-semibold text-center">Leave Days</th>
                      <th className="py-3 px-4 font-semibold">Leave Type</th>
                      <th className="py-3 px-4 font-semibold">Reason</th>
                      <th className="py-3 px-4 font-semibold">Submitted</th>
                      <th className="py-3 px-4 font-semibold text-center">Status</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRequests.map((req) => {
                      const isWithdrawn = req.Status === 'Withdrawn' || req.Status === 'Cancelled';
                      return (
                        <tr
                          key={req.LeaveRequestID}
                          className={`hover:bg-slate-50/50 transition ${isWithdrawn ? 'opacity-65 bg-slate-50/30' : ''}`}
                        >
                          <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                            <span className={isWithdrawn ? 'line-through text-slate-400' : ''}>
                              {req.StartDate} &rarr; {req.EndDate}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-slate-900">
                            <div>{req.CalculatedDays}</div>
                            {req.Remarks && req.Remarks.includes('(Exempt from Regular Balance)') && (
                              <span className="inline-block text-[9px] px-1 py-0.2 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                                Exempt
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600 text-[11px]">
                            {req.LeaveType.startsWith('Special Leave') ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                <Award className="w-3 h-3 text-purple-600" />
                                <span>{req.LeaveType}</span>
                              </span>
                            ) : (
                              req.LeaveType
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600 max-w-[200px] truncate text-[11px]">
                            {req.Reason || '-'}
                          </td>
                          <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                            {req.SubmittedAt ? new Date(req.SubmittedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <StatusBadge status={req.Status || 'Recorded'} size="sm" />
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {canWithdraw(req) ? (
                              <button
                                type="button"
                                onClick={() => handleOpenWithdrawModal(req)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer shadow-2xs"
                                title="Withdraw this upcoming leave notice"
                              >
                                <XCircle className="w-3.5 h-3.5 text-rose-500" />
                                <span>Withdraw</span>
                              </button>
                            ) : (
                              <span className="text-slate-300 text-[11px] select-none">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>

                {/* Mobile Card List View */}
                <div className="md:hidden divide-y divide-slate-100">
                  {filteredRequests.map((req) => {
                    const isWithdrawn = req.Status === 'Withdrawn' || req.Status === 'Cancelled';
                    return (
                      <div
                        key={req.LeaveRequestID}
                        className={`p-4 space-y-2.5 ${isWithdrawn ? 'opacity-65 bg-slate-50/50' : 'bg-white'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className={`font-mono text-xs font-bold text-slate-900 block ${isWithdrawn ? 'line-through text-slate-400' : ''}`}>
                              {req.StartDate} &rarr; {req.EndDate}
                            </span>
                            <div className="flex items-center gap-1.5 mt-1">
                              {req.LeaveType.startsWith('Special Leave') ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                  <Award className="w-3 h-3 text-purple-600" />
                                  <span>{req.LeaveType}</span>
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                  {req.LeaveType}
                                </span>
                              )}
                              <span className="font-bold text-xs text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                                {req.CalculatedDays} {req.CalculatedDays === 1 ? 'day' : 'days'}
                              </span>
                              {req.Remarks && req.Remarks.includes('(Exempt from Regular Balance)') && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                                  Exempt
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 flex flex-col items-end gap-1">
                            <StatusBadge status={req.Status || 'Recorded'} size="sm" />
                            <span className="text-[10px] font-mono text-slate-400">
                              {req.LeaveRequestID}
                            </span>
                          </div>
                        </div>

                        {/* Reason */}
                        {req.Reason && (
                          <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <span className="text-slate-400 font-normal">Reason: </span>
                            {req.Reason}
                          </p>
                        )}

                        {/* Mobile Actions / Submitted Date */}
                        <div className="flex items-center justify-between pt-1 text-xs">
                          <span className="text-[10px] text-slate-400">
                            Submitted: {req.SubmittedAt ? new Date(req.SubmittedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                          </span>
                          {canWithdraw(req) && (
                            <button
                              type="button"
                              onClick={() => handleOpenWithdrawModal(req)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer active:scale-95"
                            >
                              <XCircle className="w-3.5 h-3.5 text-rose-500" />
                              <span>Withdraw</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
              ) : (
                <div className="p-12 text-center text-xs text-slate-400 space-y-2">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                  <p>No leave records found for {leaveFilter === 'month' ? 'this month' : leaveFilter === 'year' ? `the year ${CURRENT_YEAR}` : 'your account'}.</p>
                  {leaveFilter !== 'total' && requests.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setLeaveFilter('total')}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                    >
                      View all {requests.length} records
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Withdraw Leave Request Confirmation Modal */}
          {selectedLeaveToWithdraw && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
              <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-slate-100 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-900">Withdraw Leave Request</h3>
                    <p className="text-xs text-slate-500">
                      Are you sure you want to withdraw this leave notice? Your leave allowance will be automatically restored.
                    </p>
                  </div>
                </div>

                {/* Details Summary */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs space-y-1.5">
                  <div className="flex justify-between text-slate-700">
                    <span className="text-slate-500">Date Range:</span>
                    <span className="font-semibold font-mono text-slate-900">
                      {selectedLeaveToWithdraw.StartDate} &rarr; {selectedLeaveToWithdraw.EndDate}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span className="text-slate-500">Duration:</span>
                    <span className="font-semibold text-slate-900">
                      {selectedLeaveToWithdraw.CalculatedDays} {Number(selectedLeaveToWithdraw.CalculatedDays) === 1 ? 'day' : 'days'}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span className="text-slate-500">Leave Type:</span>
                    <span className="font-semibold text-slate-900">{selectedLeaveToWithdraw.LeaveType}</span>
                  </div>
                  {selectedLeaveToWithdraw.Reason && (
                    <div className="flex justify-between text-slate-700 pt-1 border-t border-slate-200/50">
                      <span className="text-slate-500">Reason:</span>
                      <span className="text-slate-800 italic truncate max-w-[220px]">
                        {selectedLeaveToWithdraw.Reason}
                      </span>
                    </div>
                  )}
                </div>

                {/* Optional Reason Input */}
                <div className="space-y-1.5">
                  <label htmlFor="withdraw-reason" className="block text-xs font-semibold text-slate-700">
                    Reason for Withdrawal <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    id="withdraw-reason"
                    rows={2}
                    value={withdrawReason}
                    onChange={(e) => setWithdrawReason(e.target.value)}
                    placeholder="e.g. Travel plans changed, project schedule updated..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition"
                    disabled={withdrawing}
                  />
                </div>

                {withdrawError && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{withdrawError}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSelectedLeaveToWithdraw(null)}
                    disabled={withdrawing}
                    className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                  >
                    Keep Leave
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmWithdraw}
                    disabled={withdrawing}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {withdrawing ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Withdrawing...</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Confirm Withdrawal</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MyLeavePage;
