import React, { useState, useEffect, useMemo } from 'react';
import {
  fetchUsers,
  previewLeaveCalculation,
  allocateSpecialLeave,
} from '../../services/api';
import type { UserItem, LeaveCalculationResult } from '../../services/api';
import {
  X,
  Award,
  Users,
  AlertTriangle,
  ShieldCheck,
  Search,
  CheckSquare,
  Square,
  Clock,
  Sparkles,
} from 'lucide-react';

interface AllocateSpecialLeaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
  initialUserId?: string;
}

const CRITICAL_SECTION_PRESETS = [
  'Academic / Exam Critical Duty',
  'Emergency IT / Systems Outage',
  'Critical Laboratory Operations',
  'Medical Emergency / Quarantine',
  'Bereavement / Compassionate Grounds',
  'Disaster / Exceptional Duty',
  'Custom',
] as const;

export const AllocateSpecialLeaveModal: React.FC<AllocateSpecialLeaveModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialUserId,
}) => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [userSearch, setUserSearch] = useState<string>('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // Form State
  const [sectionPreset, setSectionPreset] = useState<string>(CRITICAL_SECTION_PRESETS[0]);
  const [customSection, setCustomSection] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [exemptFromBalance, setExemptFromBalance] = useState<boolean>(true);
  const [autoMarkPresent, setAutoMarkPresent] = useState<boolean>(true);

  // Live calculation
  const [calculation, setCalculation] = useState<LeaveCalculationResult | null>(null);
  const [calcLoading, setCalcLoading] = useState<boolean>(false);

  // Submission state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load active staff members
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoadingUsers(true);
    fetchUsers()
      .then((res) => {
        if (!isMounted) return;
        const all = res.data || (res as any).users || [];
        // Only active staff & admins
        const active = all.filter((u: UserItem) => {
          const activeStr = String(u.IsActive).toLowerCase();
          return activeStr === 'true' || activeStr === '1';
        });
        setUsers(active);
        if (initialUserId) {
          setSelectedUserIds([initialUserId]);
        }
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Failed to load staff roster');
      })
      .finally(() => {
        if (isMounted) setLoadingUsers(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, initialUserId]);

  // Live calculation effect whenever startDate or endDate changes
  useEffect(() => {
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

    let cancelled = false;
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

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const q = userSearch.toLowerCase().trim();
    return users.filter(
      (u) =>
        u.FullName.toLowerCase().includes(q) ||
        u.Email.toLowerCase().includes(q) ||
        u.UserID.toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredUsers.map((u) => u.UserID);
    const areAllSelected = allFilteredIds.every((id) => selectedUserIds.includes(id));
    if (areAllSelected) {
      setSelectedUserIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      setSelectedUserIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  const criticalSectionName =
    sectionPreset === 'Custom' ? customSection.trim() : sectionPreset;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selectedUserIds.length === 0) {
      setError('Please select at least one staff member to allocate special leave.');
      return;
    }
    if (!criticalSectionName) {
      setError('Please specify the critical section or grounds.');
      return;
    }
    if (!startDate || !endDate) {
      setError('Start date and end date are required.');
      return;
    }
    if (startDate > endDate) {
      setError('Start date cannot be after end date.');
      return;
    }
    if (!reason.trim()) {
      setError('A justification reason is mandatory for administrative audit logs.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await allocateSpecialLeave({
        userIds: selectedUserIds,
        criticalSection: criticalSectionName,
        startDate,
        endDate,
        reason: reason.trim(),
        exemptFromBalance,
        autoMarkPresent,
        remarks: remarks.trim() || undefined,
      });

      onSuccess(res.data?.allocatedCount || selectedUserIds.length);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to allocate special leave.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-purple-50 via-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-600/20">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Allocate Special Leave
              </h2>
              <p className="text-xs text-slate-500">
                Administrative leave grant based on critical section criteria.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Staff Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-purple-600" />
                <span>Target Employees</span>
                <span className="text-purple-600">({selectedUserIds.length} selected)</span>
              </label>
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="text-[11px] text-purple-700 hover:text-purple-900 font-semibold"
              >
                {filteredUsers.length > 0 &&
                filteredUsers.every((u) => selectedUserIds.includes(u.UserID))
                  ? 'Deselect All'
                  : 'Select All Filtered'}
              </button>
            </div>

            {/* Staff Search Filter */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search staff by name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              />
            </div>

            {/* Staff Checklist Box */}
            <div className="border border-slate-200 rounded-xl max-h-36 overflow-y-auto divide-y divide-slate-100 bg-slate-50/50">
              {loadingUsers ? (
                <div className="p-4 text-center text-slate-400">Loading active roster...</div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-4 text-center text-slate-400">No matching employees found</div>
              ) : (
                filteredUsers.map((u) => {
                  const isChecked = selectedUserIds.includes(u.UserID);
                  return (
                    <label
                      key={u.UserID}
                      onClick={() => toggleUserSelection(u.UserID)}
                      className={`px-3 py-2 flex items-center justify-between cursor-pointer transition select-none ${
                        isChecked ? 'bg-purple-50/80' : 'hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-purple-600 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300 shrink-0" />
                        )}
                        <div>
                          <span className="font-semibold text-slate-800">{u.FullName}</span>
                          <span className="text-[11px] text-slate-400 ml-2 font-mono">
                            {u.Email || u.UserID}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/60 text-slate-600 font-medium">
                        {u.Role}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Section 2: Critical Section Grounds */}
          <div className="space-y-2">
            <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              <span>Critical Section / Category</span>
              <span className="text-rose-500">*</span>
            </label>
            <select
              value={sectionPreset}
              onChange={(e) => setSectionPreset(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
            >
              {CRITICAL_SECTION_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            {sectionPreset === 'Custom' && (
              <input
                type="text"
                placeholder="Enter specific critical section or reason name..."
                value={customSection}
                onChange={(e) => setCustomSection(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-purple-300 bg-purple-50/30 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 animate-in fade-in"
              />
            )}
          </div>

          {/* Section 3: Date Range & Live Day Calculation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                Start Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                End Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              />
            </div>
          </div>

          {/* Calculation Preview Badge */}
          {calcLoading && (
            <div className="p-3 rounded-xl bg-purple-50/60 border border-purple-200 text-purple-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-600 animate-spin" />
              <span>Calculating working days and excluded holidays...</span>
            </div>
          )}
          {!calcLoading && calculation && (
            <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-600" />
                <span className="font-semibold text-purple-950">
                  Calculated Duration: {calculation.calculatedDays} {calculation.calculatedDays === 1 ? 'day' : 'days'}
                </span>
              </div>
              <span className="text-[11px] text-purple-700 font-mono">
                {calculation.totalCalendarDays} calendar d &bull; {calculation.workingDays} working d
              </span>
            </div>
          )}

          {/* Section 4: Exemption Toggle */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-start gap-3">
            <input
              type="checkbox"
              id="exemptFromBalance"
              checked={exemptFromBalance}
              onChange={(e) => setExemptFromBalance(e.target.checked)}
              className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
            />
            <label htmlFor="exemptFromBalance" className="cursor-pointer select-none">
              <span className="font-bold text-slate-800 block">
                Exempt from Regular Casual Leave Balance (Recommended)
              </span>
              <span className="text-slate-500 block text-[11px] mt-0.5">
                When checked, these granted days will NOT reduce or count against the employee's regular earned/casual leave allowance.
              </span>
            </label>
          </div>

          {/* Section 5: Auto-mark Attendance Present Toggle */}
          <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 flex items-start gap-3">
            <input
              type="checkbox"
              id="autoMarkPresent"
              checked={autoMarkPresent}
              onChange={(e) => setAutoMarkPresent(e.target.checked)}
              className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
            />
            <label htmlFor="autoMarkPresent" className="cursor-pointer select-none">
              <span className="font-bold text-emerald-950 block">
                Automatically Mark as "Present" in Attendance (Recommended)
              </span>
              <span className="text-emerald-800 block text-[11px] mt-0.5">
                When checked, working days within this date range will be automatically recorded as Present (Sundays and official Institute Holidays are safely preserved as non-working days).
              </span>
            </label>
          </div>

          {/* Section 5: Mandatory Justification */}
          <div className="space-y-1">
            <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
              Audit Justification / Administrative Grounds <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide a clear administrative justification for this critical section grant (recorded in ActivityLogs)..."
              required
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
            />
          </div>

          {/* Section 6: Optional Remarks / Order Ref */}
          <div className="space-y-1">
            <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
              Optional Remarks / Circular Ref #
            </label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Approved under Office Order #2026/EXAM-14"
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
            />
          </div>

          {/* Modal Actions */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || selectedUserIds.length === 0}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-md shadow-purple-600/20 transition disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <span>Allocating Leave...</span>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 text-purple-200" />
                  <span>
                    Allocate to {selectedUserIds.length} Employee{selectedUserIds.length === 1 ? '' : 's'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
