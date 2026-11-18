import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  fetchDailyAttendance,
  markDailyAttendance,
} from '../services/api';
import type { DailyAttendanceResponse } from '../services/api';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { SearchInput } from '../components/common/SearchInput';
import { useToast } from '../components/common/useToast';
import { TableSkeleton } from '../components/common/LoadingSkeleton';
import {
  Calendar,
  Save,
  AlertCircle,
  Check,
  Sparkles,
  Sun,
  RotateCcw,
  XCircle,
} from 'lucide-react';

const getTodayDateStr = () => new Date().toLocaleDateString('en-CA');

export const AttendanceMarkingPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const dateParam = searchParams.get('date');
  const initialDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : getTodayDateStr();
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [data, setData] = useState<DailyAttendanceResponse | null>(null);
  const [markedMap, setMarkedMap] = useState<Record<string, 'Present' | 'Absent' | 'Not Marked'>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [prevDateParam, setPrevDateParam] = useState(dateParam);
  if (dateParam !== prevDateParam) {
    setPrevDateParam(dateParam);
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam !== selectedDate) {
      setSelectedDate(dateParam);
    }
  }

  const loadAttendance = React.useCallback(async (date: string) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetchDailyAttendance(date);
      setData(res);
      const initialMap: Record<string, 'Present' | 'Absent' | 'Not Marked'> = {};
      res.staffAttendance.forEach((item) => {
        initialMap[item.userId] = item.status;
      });
      setMarkedMap(initialMap);
    } catch (err: any) {
      const msg = err?.message || 'Failed to load daily attendance';
      setFeedback({ type: 'error', text: msg });
      toast.error(msg, 'Loading Error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAttendance(selectedDate);
  }, [selectedDate, loadAttendance]);

  const handleStatusChange = (userId: string, status: 'Present' | 'Absent' | 'Not Marked') => {
    setMarkedMap((prev) => ({
      ...prev,
      [userId]: status,
    }));
  };

  const handleMarkAll = (status: 'Present' | 'Absent') => {
    if (!data) return;
    const updated: Record<string, 'Present' | 'Absent' | 'Not Marked'> = {};
    data.staffAttendance.forEach((item) => {
      updated[item.userId] = status;
    });
    setMarkedMap(updated);
  };

  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    setFeedback(null);

    try {
      const entries: Array<{ userId: string; status: 'Present' | 'Absent' | 'Not Marked' }> = [];
      Object.entries(markedMap).forEach(([userId, status]) => {
        const originalStatus = data.staffAttendance.find((s) => s.userId === userId)?.status || 'Not Marked';
        if (status === 'Present' || status === 'Absent') {
          entries.push({ userId, status });
        } else if (status === 'Not Marked' && originalStatus !== 'Not Marked') {
          entries.push({ userId, status: 'Not Marked' });
        }
      });

      if (entries.length === 0) {
        const msg = 'No attendance changes to save. Please mark or adjust employee status before saving.';
        setFeedback({ type: 'error', text: msg });
        toast.warning(msg, 'No Changes Marked');
        setSaving(false);
        return;
      }

      const res = await markDailyAttendance(selectedDate, entries);
      const successMsg = `Attendance saved successfully for ${res.savedCount} employee(s) on ${selectedDate}.`;
      setFeedback({ type: 'success', text: successMsg });
      toast.success(successMsg, 'Attendance Recorded');
      await loadAttendance(selectedDate);
    } catch (err: any) {
      const msg = err?.message || 'Failed to save attendance records';
      setFeedback({ type: 'error', text: msg });
      toast.error(msg, 'Save Error');
    } finally {
      setSaving(false);
    }
  };

  // Filter staff by search query
  const staffAttendance = data?.staffAttendance;
  const filteredStaff = useMemo(() => {
    if (!staffAttendance) return [];
    if (!searchQuery.trim()) return staffAttendance;
    const q = searchQuery.toLowerCase().trim();
    return staffAttendance.filter(
      (item) =>
        item.fullName.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q) ||
        item.userId.toLowerCase().includes(q) ||
        item.role.toLowerCase().includes(q)
    );
  }, [staffAttendance, searchQuery]);

  // Compute live counts
  const presentCount = Object.values(markedMap).filter((s) => s === 'Present').length;
  const absentCount = Object.values(markedMap).filter((s) => s === 'Absent').length;
  const notMarkedCount = Object.values(markedMap).filter((s) => s === 'Not Marked').length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <PageHeader
        title="Attendance Marking"
        subtitle="Record daily staff attendance."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider hidden sm:inline">
                Date:
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={() => setSelectedDate(getTodayDateStr())}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition shadow-2xs cursor-pointer"
            >
              Today
            </button>

            <button
              type="button"
              onClick={() => loadAttendance(selectedDate)}
              disabled={loading}
              className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition shadow-2xs disabled:opacity-50 cursor-pointer"
              title="Reload server records"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold shadow-2xs transition cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Records'}</span>
            </button>
          </div>
        }
      />

      {/* Calendar Notice Banner */}
      {data?.isSunday && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2.5">
          <Sun className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Sunday (Weekly Off)</span>
        </div>
      )}

      {data?.isHoliday && (
        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            Institute Holiday: <strong>{data.holidayName}</strong>
          </span>
        </div>
      )}

      {/* Notification Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Summary & Quick Batch Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full md:w-auto text-xs">
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Total Staff</span>
            <span className="text-lg font-bold text-slate-800">{data?.totalStaff || 0}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-100">
            <span className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wider block">Present</span>
            <span className="text-lg font-bold text-emerald-700">{presentCount}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-rose-50/50 border border-rose-100">
            <span className="text-[10px] text-rose-700 font-semibold uppercase tracking-wider block">Absent</span>
            <span className="text-lg font-bold text-rose-700">{absentCount}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-50/50 border border-amber-100">
            <span className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider block">Not Marked</span>
            <span className="text-lg font-bold text-amber-700">{notMarkedCount}</span>
          </div>
        </div>

        {/* Quick Batch Marking Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-stretch md:self-auto justify-end">
          <button
            type="button"
            onClick={() => handleMarkAll('Present')}
            className="px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold transition cursor-pointer"
          >
            Mark All Present
          </button>
          <button
            type="button"
            onClick={() => handleMarkAll('Absent')}
            className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-semibold transition cursor-pointer"
          >
            Mark All Absent
          </button>
        </div>
      </div>

      {/* Staff Attendance Roster Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900 text-sm">Employee Attendance Roster</h2>
            <p className="text-[11px] text-slate-500">
              Showing {filteredStaff.length} of {data?.totalStaff || 0} active staff for {selectedDate}
            </p>
          </div>
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search staff by name or email..."
            className="w-full sm:w-64"
          />
        </div>

        {loading ? (
          <TableSkeleton rows={8} columns={5} />
        ) : filteredStaff.length > 0 ? (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase bg-slate-50/50 text-[10px]">
                    <th className="py-3 px-4 font-semibold">Employee</th>
                    <th className="py-3 px-4 font-semibold">Role</th>
                    <th className="py-3 px-4 font-semibold text-center">Status Action</th>
                    <th className="py-3 px-4 font-semibold text-center">Current Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Last Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStaff.map((item) => {
                    const currentStatus = markedMap[item.userId] || 'Not Marked';
                    return (
                      <tr key={item.userId} className="hover:bg-slate-50/60 transition">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{item.fullName}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{item.email}</div>
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={item.role || 'Staff'} size="sm" />
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Present Toggle */}
                            <button
                              type="button"
                              onClick={() => handleStatusChange(item.userId, 'Present')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                                currentStatus === 'Present'
                                  ? 'bg-emerald-600 text-white shadow-2xs'
                                  : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Present</span>
                            </button>

                            {/* Absent Toggle */}
                            <button
                              type="button"
                              onClick={() => handleStatusChange(item.userId, 'Absent')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                                currentStatus === 'Absent'
                                  ? 'bg-rose-600 text-white shadow-2xs'
                                  : 'bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700'
                              }`}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Absent</span>
                            </button>

                            {/* Clear / Not Marked Reset */}
                            <button
                              type="button"
                              onClick={() => handleStatusChange(item.userId, 'Not Marked')}
                              className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                                currentStatus === 'Not Marked'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                              }`}
                              title="Reset to Not Marked"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <StatusBadge status={currentStatus} size="sm" />
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-right text-[11px] whitespace-nowrap">
                          {item.updatedAt ? new Date(item.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredStaff.map((item) => {
                const currentStatus = markedMap[item.userId] || 'Not Marked';
                return (
                  <div
                    key={item.userId}
                    className={`p-3.5 transition-colors ${
                      currentStatus === 'Present'
                        ? 'bg-emerald-50/25'
                        : currentStatus === 'Absent'
                        ? 'bg-rose-50/25'
                        : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-sm truncate">
                          {item.fullName}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono truncate">
                          {item.email}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <StatusBadge status={item.role || 'Staff'} size="sm" />
                        <StatusBadge status={currentStatus} size="sm" />
                      </div>
                    </div>

                    {/* Touch Action Buttons */}
                    <div className="grid grid-cols-5 gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => handleStatusChange(item.userId, 'Present')}
                        className={`col-span-2 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer shadow-2xs ${
                          currentStatus === 'Present'
                            ? 'bg-emerald-600 text-white shadow-emerald-600/20'
                            : 'bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200'
                        }`}
                      >
                        <Check className="w-4 h-4" />
                        <span>Present</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStatusChange(item.userId, 'Absent')}
                        className={`col-span-2 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer shadow-2xs ${
                          currentStatus === 'Absent'
                            ? 'bg-rose-600 text-white shadow-rose-600/20'
                            : 'bg-slate-100 text-slate-700 hover:bg-rose-50 hover:text-rose-700 border border-slate-200'
                        }`}
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Absent</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStatusChange(item.userId, 'Not Marked')}
                        className={`col-span-1 py-2 rounded-xl text-xs font-medium transition flex items-center justify-center cursor-pointer border ${
                          currentStatus === 'Not Marked'
                            ? 'bg-amber-100 text-amber-800 border-amber-200'
                            : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 border-slate-200'
                        }`}
                        title="Reset to Not Marked"
                        aria-label="Reset status"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="p-12 text-center text-xs text-slate-400">
            {searchQuery ? 'No staff match the search query.' : 'No active staff members found.'}
          </div>
        )}
      </div>

      {/* Mobile Sticky Floating Save Bar */}
      <div className="md:hidden fixed bottom-16 left-0 right-0 z-30 px-4 py-2.5 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
            <Check className="w-3 h-3" />
            {presentCount}
          </span>
          <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
            <XCircle className="w-3 h-3" />
            {absentCount}
          </span>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold shadow-md transition active:scale-95 cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? 'Saving...' : 'Save Records'}</span>
        </button>
      </div>
    </div>
  );
};

export default AttendanceMarkingPage;
