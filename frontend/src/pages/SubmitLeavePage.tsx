import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  previewLeaveCalculation,
  submitLeaveRequest,
  fetchLeaveBalance,
  fetchMyLeaveRequests,
} from '../services/api';
import type {
  LeaveCalculationResult,
  LeaveBalanceItem,
} from '../services/api';
import { PageHeader } from '../components/common/PageHeader';
import { useToast } from '../components/common/useToast';
import {
  PlusCircle,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

const CURRENT_YEAR = new Date().getFullYear();

export const SubmitLeavePage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();

  // Form State
  const [leaveType, setLeaveType] = useState<string>('Casual');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');

  // Balance and Calculation State
  const [balance, setBalance] = useState<LeaveBalanceItem | null>(null);
  const [calculation, setCalculation] = useState<LeaveCalculationResult | null>(null);
  const [calcLoading, setCalcLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ message: string; warning?: string } | null>(null);

  const [leaveTaken, setLeaveTaken] = useState<number>(0);

  // Load active leave balance and user leave requests
  useEffect(() => {
    async function loadData() {
      try {
        const [balRes, reqRes] = await Promise.all([
          fetchLeaveBalance(user?.userId, CURRENT_YEAR),
          fetchMyLeaveRequests(),
        ]);
        setBalance(balRes.balance);
        const reqs = reqRes.requests || (reqRes as any).data || [];
        const yearPrefix = `${CURRENT_YEAR}-`;
        const taken = reqs
          .filter(
            (r) =>
              r.Status !== 'Withdrawn' &&
              r.Status !== 'Cancelled' &&
              !(r.Remarks && r.Remarks.includes('(Exempt from Regular Balance)')) &&
              ((r.StartDate && r.StartDate.startsWith(yearPrefix)) || (r.EndDate && r.EndDate.startsWith(yearPrefix)))
          )
          .reduce((sum, r) => sum + (Number(r.CalculatedDays) || 0), 0);
        setLeaveTaken(taken);
      } catch (err: any) {
        console.error('Failed to load user balance or requests:', err.message);
      }
    }
    loadData();
  }, [user?.userId]);

  // Live calculation effect whenever startDate or endDate changes
  useEffect(() => {
    let cancelled = false;

    if (!startDate || !endDate) {
      setCalculation(null);
      return;
    }

    if (startDate > endDate) {
      setCalculation(null);
      setError('Start date cannot be after end date.');
      return;
    }

    setError(null);
    setCalcLoading(true);

    previewLeaveCalculation(startDate, endDate)
      .then((res) => {
        if (!cancelled) {
          setCalculation(res.calculation);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCalculation(null);
          setError(err.message || 'Error calculating leave days');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCalcLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate || !reason.trim()) {
      setError('Start date, end date, and reason are required.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessInfo(null);

    try {
      const res = await submitLeaveRequest({
        leaveType,
        startDate,
        endDate,
        reason: reason.trim(),
        remarks: remarks.trim() || undefined,
      });

      setSuccessInfo({
        message: res.message || 'Leave request successfully submitted!',
        warning: res.warning,
      });

      if (res.warning) {
        toast.warning(res.warning, 'Leave Recorded with Notice');
      } else {
        toast.success('Your leave notice has been recorded.', 'Leave Submitted');
      }

      // Clear form inputs
      setStartDate('');
      setEndDate('');
      setReason('');
      setRemarks('');
      setCalculation(null);
    } catch (err: any) {
      const msg = err?.message || 'Failed to submit leave request';
      setError(msg);
      toast.error(msg, 'Submission Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const effectiveCarried = Number(
    balance?.effectiveCarriedForward ??
      (balance?.isCarryForwardExpired ? 0 : balance?.CarriedForward ?? 0)
  );
  const accruedAllowance = Math.round(((Number(balance?.EarnedLeave) || 0) + effectiveCarried) * 100) / 100;
  const totalTaken = Math.max(Number(balance?.UsedLeave) || 0, leaveTaken);
  const remainingAllowance = Math.max(0, Math.round((accruedAllowance - totalTaken) * 100) / 100);

  const isExcess =
    calculation &&
    calculation.calculatedDays > remainingAllowance;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Page Header */}
      <PageHeader
        title="Submit Leave Request"
        subtitle="Submit a leave notice."
        actions={
          <Link
            to="/leave/my"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition shadow-2xs"
          >
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>View Leave History</span>
          </Link>
        }
      />

      {/* Available Balance / Remaining Allowance Header Card */}
      {balance && (
        <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Remaining Allowance
              </span>
              <span className="text-xl font-bold text-slate-900">
                {remainingAllowance.toFixed(1)} days remaining
              </span>
              <span className="text-xs text-slate-400 block">
                {accruedAllowance.toFixed(1)}d accrued allowance &bull; 2.5d / month
              </span>
            </div>
          </div>
          <Link
            to="/leave/my"
            className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline flex items-center gap-1"
          >
            <span>View Leave History</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Success Notification */}
      {successInfo && (
        <div className="space-y-3">
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-semibold text-emerald-950">{successInfo.message}</span>
            </div>
            <Link
              to="/leave/my"
              className="font-bold text-emerald-800 underline hover:text-emerald-950 whitespace-nowrap text-xs"
            >
              View in My Leave &rarr;
            </Link>
          </div>

          {successInfo.warning && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="font-semibold text-amber-950">{successInfo.warning}</span>
            </div>
          )}
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Leave Request Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 sm:p-7 shadow-2xs space-y-5">
        {/* Leave Type */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
            Leave Type <span className="text-rose-500">*</span>
          </label>
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition shadow-2xs"
          >
            <option value="Casual">Casual Leave</option>
            <option value="Maternity/Paternity">Maternity / Paternity Leave</option>
            <option value="Other">Other Leave</option>
          </select>
        </div>

        {/* Date Range Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Start Date <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              End Date <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs"
            />
          </div>
        </div>

        {/* Live Calculation Preview Box */}
        {calcLoading && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center animate-pulse">
            Calculating leave days based on institute calendar...
          </div>
        )}

        {calculation && !calcLoading && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>Leave Days Calculation Preview</span>
              </span>
              <span className="text-xs font-extrabold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
                {calculation.calculatedDays} {calculation.calculatedDays === 1 ? 'day' : 'days'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px]">Total Span</span>
                <span className="font-bold text-slate-800">{calculation.totalCalendarDays} days</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px]">Sundays</span>
                <span className="font-bold text-slate-800">
                  {calculation.sundaysCount} {calculation.isContinuousSevenDaysOrMore ? '(Counted)' : '(Excluded)'}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px]">Holidays</span>
                <span className="font-bold text-slate-800">
                  {calculation.holidaysCount} {calculation.isContinuousSevenDaysOrMore ? '(Counted)' : '(Excluded)'}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px]">Calculated</span>
                <span className="font-bold text-blue-600">{calculation.calculatedDays} days</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed bg-white p-2.5 rounded-lg border border-slate-200">
              <strong className="text-slate-800">Policy Rule: </strong>
              {calculation.ruleApplied}
            </p>

            {/* Excluded Non-Working Days Breakdown */}
            {!calculation.isContinuousSevenDaysOrMore && calculation.excludedDates && calculation.excludedDates.length > 0 && (
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Excluded Non-Working Days (Not Deducted From Leave Allowance)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {calculation.excludedDates.map((item: string) => (
                    <span
                      key={item}
                      className="px-2.5 py-1 rounded-md bg-slate-50 text-slate-700 text-[11px] font-semibold border border-slate-200 flex items-center gap-1"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Excess Balance Warning Banner */}
            {isExcess && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="font-semibold text-amber-950">
                  Requested {calculation.calculatedDays} days exceeds remaining allowance ({remainingAllowance.toFixed(1)} days).
                </span>
              </div>
            )}
          </div>
        )}

        {/* Reason Field */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
            Reason for Leave <span className="text-rose-500">*</span>
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Brief explanation for leave request..."
            required
            className="w-full px-3.5 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs"
          />
        </div>

        {/* Remarks Field (Optional) */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
            Remarks <span className="text-slate-400 font-normal">(Optional)</span>
          </label>
          <input
            type="text"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Additional details, handover contact, etc."
            className="w-full px-3.5 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs"
          />
        </div>

        {/* Submission Button */}
        <button
          type="submit"
          disabled={submitting || calcLoading || !startDate || !endDate}
          className="w-full h-11 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95"
        >
          {submitting ? (
            <span>Submitting Request...</span>
          ) : (
            <>
              <PlusCircle className="w-4 h-4" />
              <span>Submit Leave Request</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default SubmitLeavePage;
