import React, { useState, useEffect } from 'react';
import {
  fetchAllLeaveBalances,
  adjustLeaveBalance,
  previewYearTransition,
  executeYearTransition,
} from '../services/api';
import type {
  LeaveBalanceItem,
  YearTransitionPreviewResponse,
} from '../services/api';
import { AllocateSpecialLeaveModal } from '../components/leave/AllocateSpecialLeaveModal';
import {
  Sliders,
  Calendar,
  AlertCircle,
  CheckCircle2,
  X,
  Edit3,
  ArrowRightLeft,
  ShieldAlert,
  CheckSquare,
  Square,
  AlertTriangle,
  Award,
} from 'lucide-react';

const CURRENT_YEAR = new Date().getFullYear();

export const LeaveManagementPage: React.FC = () => {
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [balances, setBalances] = useState<LeaveBalanceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Adjustment Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedBalance, setSelectedBalance] = useState<LeaveBalanceItem | null>(null);
  const [earnedInput, setEarnedInput] = useState<string>('0');
  const [carriedInput, setCarriedInput] = useState<string>('0');
  const [usedInput, setUsedInput] = useState<string>('0');
  const [reasonInput, setReasonInput] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Year Transition Modal State
  const [isTransitionModalOpen, setIsTransitionModalOpen] = useState<boolean>(false);
  const [transSourceYear, setTransSourceYear] = useState<number>(CURRENT_YEAR - 1);
  const [transDestYear, setTransDestYear] = useState<number>(CURRENT_YEAR);
  const [transPreview, setTransPreview] = useState<YearTransitionPreviewResponse['data'] | null>(null);
  const [transLoading, setTransLoading] = useState<boolean>(false);
  const [transConfirm, setTransConfirm] = useState<boolean>(false);
  const [transSubmitting, setTransSubmitting] = useState<boolean>(false);
  const [transError, setTransError] = useState<string | null>(null);
  const [transSuccess, setTransSuccess] = useState<string | null>(null);

  // Special Leave Allocation Modal State
  const [isSpecialLeaveModalOpen, setIsSpecialLeaveModalOpen] = useState<boolean>(false);
  const [specialTargetUserId, setSpecialTargetUserId] = useState<string | undefined>(undefined);

  const loadBalances = async (year: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAllLeaveBalances(year);
      setBalances(res.balances || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch leave balances');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBalances(selectedYear);
  }, [selectedYear]);

  const openAdjustModal = (b: LeaveBalanceItem) => {
    setSelectedBalance(b);
    setEarnedInput(String(b.EarnedLeave));
    setCarriedInput(String(b.CarriedForward));
    setUsedInput(String(b.UsedLeave));
    setReasonInput('');
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBalance) return;
    if (!reasonInput.trim()) {
      setModalError('A clear audit reason is required for any manual balance adjustment.');
      return;
    }

    setSubmitting(true);
    setModalError(null);

    try {
      await adjustLeaveBalance({
        userId: selectedBalance.UserID,
        calendarYear: selectedBalance.CalendarYear,
        earnedLeave: parseFloat(earnedInput),
        carriedForward: parseFloat(carriedInput),
        usedLeave: parseFloat(usedInput),
        reason: reasonInput.trim(),
      });

      setSuccess(`Leave balance for user ${selectedBalance.UserID} updated successfully.`);
      setIsModalOpen(false);
      await loadBalances(selectedYear);
    } catch (err: any) {
      setModalError(err?.message || 'Failed to adjust balance');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Year Transition Modal and fetch preview
  const openTransitionModal = async () => {
    setIsTransitionModalOpen(true);
    setTransConfirm(false);
    setTransError(null);
    setTransSuccess(null);
    await fetchPreview(transSourceYear, transDestYear);
  };

  const fetchPreview = async (src: number, dst: number) => {
    setTransLoading(true);
    setTransError(null);
    try {
      const res = await previewYearTransition(src, dst);
      setTransPreview(res.data);
    } catch (err: any) {
      setTransError(err?.message || 'Failed to fetch year transition preview');
      setTransPreview(null);
    } finally {
      setTransLoading(false);
    }
  };

  const handleSourceYearChange = async (src: number) => {
    setTransSourceYear(src);
    const dst = src + 1;
    setTransDestYear(dst);
    await fetchPreview(src, dst);
  };

  const handleExecuteTransition = async () => {
    if (!transConfirm) {
      setTransError('Please confirm the checkbox before executing the year transition.');
      return;
    }

    setTransSubmitting(true);
    setTransError(null);
    try {
      const res = await executeYearTransition({
        sourceYear: transSourceYear,
        destinationYear: transDestYear,
        confirm: true,
      });

      setTransSuccess(
        `Year transition successfully executed! Carried Forward: ${res.data.totalCarried} days across ${res.data.processedCount} employee(s). Permanently Lapsed: ${res.data.totalLapsed} days.`
      );
      setSuccess(`Year transition from ${transSourceYear} to ${transDestYear} completed successfully.`);
      await loadBalances(selectedYear);
      // Refresh preview to show updated status
      await fetchPreview(transSourceYear, transDestYear);
    } catch (err: any) {
      setTransError(err?.message || 'Failed to execute year transition');
    } finally {
      setTransSubmitting(false);
    }
  };

  // Live calculation of preview available balance in modal
  const previewAvailable =
    parseFloat(earnedInput || '0') +
    parseFloat(carriedInput || '0') -
    parseFloat(usedInput || '0');

  const hasPendingTransition = balances.some((b) => b.transitionPending);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 flex items-center gap-2.5">
            <Sliders className="w-7 h-7 text-amber-600" />
            <span>Staff Leave Balances & Allowance</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Yearly leave balances and year-end transitions.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Allocate Special Leave Button */}
          <button
            type="button"
            onClick={() => {
              setSpecialTargetUserId(undefined);
              setIsSpecialLeaveModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-sm transition cursor-pointer"
          >
            <Award className="w-4 h-4 text-purple-200" />
            <span>Allocate Special Leave</span>
          </button>

          {/* Year-End Transition Button */}
          <button
            type="button"
            onClick={openTransitionModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition cursor-pointer"
          >
            <ArrowRightLeft className="w-4 h-4 text-amber-400" />
            <span>Execute Year Transition</span>
          </button>

          {/* Year Filter */}
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-2 shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="text-sm font-semibold text-slate-800 bg-transparent focus:outline-none"
            >
              {Array.from({ length: 15 }, (_, i) => CURRENT_YEAR - 4 + i).map((y) => (
                <option key={y} value={y}>
                  Calendar Year {y}{y === CURRENT_YEAR ? ' (Current)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Transition Due Banner */}
      {hasPendingTransition && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Prior-Year Transition Pending:</span> Unused leave from {selectedYear - 1} has not yet been carried forward into {selectedYear}. Use the <strong>Execute Year Transition</strong> button above to review eligible balances and carry forward 50%.
          </div>
        </div>
      )}

      {/* Notifications */}
      {success && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
          <button type="button" onClick={() => setSuccess(null)} className="text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Balances Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 text-base">Employee Balances ({selectedYear})</h2>
          <span className="text-xs text-slate-500 font-medium">{balances.length} employee record(s)</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading balances...</div>
        ) : balances.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase bg-slate-50/50">
                  <th className="py-3 px-4">User ID</th>
                  <th className="py-3 px-4">Year</th>
                  <th className="py-3 px-4 text-right">Earned</th>
                  <th className="py-3 px-4 text-right">Carried Forward</th>
                  <th className="py-3 px-4 text-right">Used</th>
                  <th className="py-3 px-4 text-right">Available</th>
                  <th className="py-3 px-4">Last Updated</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {balances.map((b) => (
                  <tr key={b.LeaveBalanceID} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800 text-xs">
                      {b.UserID}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600">
                      {b.CalendarYear}
                    </td>
                    <td className="py-3 px-4 font-mono text-right font-medium text-slate-700">
                      {Number(b.EarnedLeave).toFixed(1)}
                    </td>
                    <td className="py-3 px-4 font-mono text-right font-medium text-slate-700">
                      <div>{Number(b.CarriedForward).toFixed(1)}</div>
                      {b.isCarryForwardExpired && Number(b.CarriedForward) > 0 && (
                        <span className="text-[10px] font-semibold text-rose-600 block">
                          Expired (Apr 1)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-right font-medium text-slate-700">
                      {Number(b.UsedLeave).toFixed(1)}
                    </td>
                    <td className="py-3 px-4 font-mono text-right font-bold text-blue-700">
                      {Number(b.AvailableLeave).toFixed(1)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-400">
                      {b.UpdatedAt ? new Date(b.UpdatedAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => openAdjustModal(b)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-semibold transition cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Adjust</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 text-sm">
            No leave balances initialized for year {selectedYear}.
          </div>
        )}
      </div>

      {/* Adjust Modal */}
      {isModalOpen && selectedBalance && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Adjust Leave Balance</h3>
                <p className="text-xs text-slate-500 font-mono">
                  User: {selectedBalance.UserID} | Year: {selectedBalance.CalendarYear}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">
                    Earned
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={earnedInput}
                    onChange={(e) => setEarnedInput(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">
                    Carried
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={carriedInput}
                    onChange={(e) => setCarriedInput(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">
                    Used
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={usedInput}
                    onChange={(e) => setUsedInput(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Calculated Available Preview */}
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between text-xs">
                <span className="font-semibold text-blue-900">Computed Available Balance:</span>
                <span className="font-extrabold text-blue-700 text-sm font-mono">
                  {previewAvailable.toFixed(1)} days
                </span>
              </div>

              {/* Mandatory Reason */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Audit Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder="Mandatory explanation for this manual adjustment..."
                  required
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-amber-500/20 transition cursor-pointer"
                >
                  {submitting ? 'Saving Adjustment...' : 'Apply Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Year-End Transition Modal */}
      {isTransitionModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-amber-600" />
                  <span>Execute Year-End Carry Forward Transition</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Confirmed policy: Exactly 50% carries forward into destination year; remaining 50% permanently lapses.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTransitionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Year Selectors */}
              <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">Source Year:</span>
                  <select
                    value={transSourceYear}
                    onChange={(e) => handleSourceYearChange(Number(e.target.value))}
                    disabled={transLoading || transSubmitting}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-mono font-bold text-slate-800 text-xs"
                  >
                    {[CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR].map((y) => (
                      <option key={y} value={y}>
                        {y} (Dec 31)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">Destination Year:</span>
                  <span className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-100 font-mono font-bold text-slate-800 text-xs">
                    {transDestYear} (Jan 1)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => fetchPreview(transSourceYear, transDestYear)}
                  disabled={transLoading || transSubmitting}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold ml-auto"
                >
                  {transLoading ? 'Refreshing...' : 'Refresh Preview'}
                </button>
              </div>

              {/* Status / Error Alerts */}
              {transError && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Error:</span> {transError}
                  </div>
                </div>
              )}

              {transSuccess && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Completed:</span> {transSuccess}
                  </div>
                </div>
              )}

              {/* Already Executed Warning */}
              {transPreview?.isAlreadyExecuted && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Transition Already Executed:</span> The transition from {transSourceYear} to {transDestYear} has already been recorded in the audit log on{' '}
                    <strong>
                      {transPreview.alreadyExecutedDetails?.executedAt
                        ? new Date(transPreview.alreadyExecutedDetails.executedAt).toLocaleString()
                        : 'Unknown Date'}
                    </strong>{' '}
                    by <strong>{transPreview.alreadyExecutedDetails?.executedBy || 'Administrator'}</strong>.
                    <div className="text-[11px] text-amber-700 mt-1">
                      Duplicate execution is blocked to safeguard historical leave records.
                    </div>
                  </div>
                </div>
              )}

              {/* Summary Cards */}
              {transPreview && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Eligible Employees
                    </span>
                    <span className="text-2xl font-black text-slate-800">
                      {transPreview.eligibleCount}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                    <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                      Total 50% Carried Forward
                    </span>
                    <span className="text-2xl font-black text-emerald-700">
                      {transPreview.totalCarried.toFixed(2)} <span className="text-xs font-normal">days</span>
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
                    <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block">
                      Total 50% Permanently Lapsed
                    </span>
                    <span className="text-2xl font-black text-rose-700">
                      {transPreview.totalLapsed.toFixed(2)} <span className="text-xs font-normal">days</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
                  Employee Breakdown Preview ({transSourceYear} &rarr; {transDestYear})
                </div>
                {transLoading ? (
                  <div className="p-8 text-center text-slate-500 text-xs">Computing transition preview...</div>
                ) : transPreview && transPreview.records.length > 0 ? (
                  <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-500 uppercase font-semibold">
                        <tr>
                          <th className="py-2 px-3">Employee</th>
                          <th className="py-2 px-3 text-right">Earned ({transSourceYear})</th>
                          <th className="py-2 px-3 text-right">Used ({transSourceYear})</th>
                          <th className="py-2 px-3 text-right">Eligible Unused</th>
                          <th className="py-2 px-3 text-right text-emerald-700">50% Carried</th>
                          <th className="py-2 px-3 text-right text-rose-700">50% Lapsed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {transPreview.records.map((r) => (
                          <tr key={r.userId} className="hover:bg-slate-50 font-mono">
                            <td className="py-2 px-3 font-sans font-medium text-slate-800">
                              {r.fullName}{' '}
                              <span className="text-[11px] text-slate-400 font-mono">({r.userId})</span>
                            </td>
                            <td className="py-2 px-3 text-right">{r.sourceEarned.toFixed(1)}</td>
                            <td className="py-2 px-3 text-right">{r.sourceUsed.toFixed(1)}</td>
                            <td className="py-2 px-3 text-right font-bold text-slate-800">
                              {r.eligibleUnused.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-emerald-700">
                              +{r.carryForwardAmount.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-rose-600">
                              -{r.lapsedAmount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500 text-xs">No active staff records found.</div>
                )}
              </div>

              {/* Excluded / Ineligible Records Table */}
              {transPreview && transPreview.excludedRecords && transPreview.excludedRecords.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <div className="p-3 bg-amber-50/70 border-b border-amber-200 text-xs font-bold text-amber-900 flex items-center justify-between">
                    <span>Excluded / Ineligible Records ({transPreview.excludedRecords.length})</span>
                    <span className="text-[11px] font-normal text-amber-700">Not eligible for carry-forward</span>
                  </div>
                  <div className="overflow-x-auto max-h-48">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-500 uppercase font-semibold">
                        <tr>
                          <th className="py-2 px-3">User</th>
                          <th className="py-2 px-3">Role</th>
                          <th className="py-2 px-3">Status</th>
                          <th className="py-2 px-3">Reason / Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {transPreview.excludedRecords.map((ex) => (
                          <tr key={ex.userId} className="hover:bg-slate-50 font-mono">
                            <td className="py-2 px-3 font-sans font-medium text-slate-800">
                              {ex.fullName} <span className="text-[11px] text-slate-400 font-mono">({ex.userId})</span>
                            </td>
                            <td className="py-2 px-3 font-sans">{ex.role}</td>
                            <td className="py-2 px-3 font-sans">
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                                {ex.status}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-sans text-slate-500 text-[11px]">
                              {ex.remarks || 'Ineligible'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Confirmation Checkbox */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => setTransConfirm(!transConfirm)}
                    className="mt-0.5 text-purple-600 focus:outline-none"
                  >
                    {transConfirm ? (
                      <CheckSquare className="w-4 h-4 text-purple-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                  <span className="text-slate-700 font-medium leading-relaxed">
                    I confirm execution of the year-end carry forward transition from{' '}
                    <strong>{transSourceYear}</strong> to <strong>{transDestYear}</strong>. I understand that exactly{' '}
                    <strong>50%</strong> of eligible unused balance will be carried forward and the remaining{' '}
                    <strong>50%</strong> will permanently lapse. This action cannot be undone.
                  </span>
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsTransitionModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleExecuteTransition}
                disabled={
                  !transConfirm ||
                  transSubmitting ||
                  transLoading ||
                  transPreview?.isAlreadyExecuted ||
                  !transPreview ||
                  transPreview.records.length === 0
                }
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-bold shadow-md shadow-purple-500/20 transition cursor-pointer flex items-center gap-1.5"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>{transSubmitting ? 'Executing Transition...' : 'Execute Transition'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Modal */}
      {isModalOpen && selectedBalance && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Adjust Leave Balance</h3>
                <p className="text-xs text-slate-500 font-mono">
                  User: {selectedBalance.UserID} | Year: {selectedBalance.CalendarYear}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">
                    Earned
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={earnedInput}
                    onChange={(e) => setEarnedInput(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">
                    Carried
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={carriedInput}
                    onChange={(e) => setCarriedInput(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">
                    Used
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={usedInput}
                    onChange={(e) => setUsedInput(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Calculated Available Preview */}
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between text-xs">
                <span className="font-semibold text-blue-900">Computed Available Balance:</span>
                <span className="font-extrabold text-blue-700 text-sm font-mono">
                  {previewAvailable.toFixed(1)} days
                </span>
              </div>

              {/* Mandatory Reason */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Audit Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder="Mandatory explanation for this manual adjustment..."
                  required
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-amber-500/20 transition cursor-pointer"
                >
                  {submitting ? 'Saving Adjustment...' : 'Apply Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Allocate Special Leave Modal */}
      <AllocateSpecialLeaveModal
        isOpen={isSpecialLeaveModalOpen}
        onClose={() => setIsSpecialLeaveModalOpen(false)}
        initialUserId={specialTargetUserId}
        onSuccess={(count) => {
          setSuccess(`Special leave successfully allocated for ${count} employee(s).`);
          loadBalances(selectedYear);
        }}
      />
    </div>
  );
};
