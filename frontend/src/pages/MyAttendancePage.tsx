import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchMonthlyAttendance } from '../services/api';
import type {
  MonthlyAttendanceSummary,
  MonthlyAttendanceRecord,
} from '../services/api';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { TableSkeleton } from '../components/common/LoadingSkeleton';
import { MonthlyHealthCard } from '../components/attendance/MonthlyHealthCard';
import {
  ChevronLeft,
  ChevronRight,
  Sun,
  Sparkles,
  AlertCircle,
  Briefcase,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';

const CURRENT_DATE = new Date();
const DEFAULT_YEAR = CURRENT_DATE.getFullYear();
const DEFAULT_MONTH = CURRENT_DATE.getMonth() + 1;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MyAttendancePage: React.FC = () => {
  const { user } = useAuth();
  const userId = user?.userId;
  const [selectedYear, setSelectedYear] = useState<number>(DEFAULT_YEAR);
  const [selectedMonth, setSelectedMonth] = useState<number>(DEFAULT_MONTH);
  const [summary, setSummary] = useState<MonthlyAttendanceSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadAttendance = useCallback(async (year: number, month: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMonthlyAttendance(userId, year, month);
      setSummary(res.summary);
    } catch (err: any) {
      setError(err?.message || 'Failed to load attendance summary');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadAttendance(selectedYear, selectedMonth);
  }, [loadAttendance, selectedYear, selectedMonth]);

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const getStatusBadge = (rec: MonthlyAttendanceRecord) => {
    if (rec.isSunday) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
          <Sun className="w-3 h-3 text-amber-500" />
          Sunday
        </span>
      );
    }
    if (rec.isHoliday) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <Sparkles className="w-3 h-3 text-blue-600" />
          {rec.holidayName || 'Holiday'}
        </span>
      );
    }
    return <StatusBadge status={rec.status} size="sm" />;
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header & Month Navigation */}
      <PageHeader
        title="My Attendance"
        subtitle="Review your daily attendance status and monthly breakdown."
        actions={
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1 shadow-2xs">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-600 transition cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-xs font-bold text-slate-800 min-w-[130px] text-center">
              {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-600 transition cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        }
      />

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Advanced Monthly Health Card & Verification Scorecard */}
      <MonthlyHealthCard
        initialSummary={summary}
        userId={userId}
        userName={user?.fullName}
        userRole={user?.role}
        userEmail={user?.email}
        onMonthChange={(y, m) => {
          setSelectedYear(y);
          setSelectedMonth(m);
        }}
        showDownloadSlip={true}
      />

      {/* Monthly Statistics Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            title="Working Days"
            value={summary.totalWorkingDays}
            subtitle="Scheduled lab days"
            icon={Briefcase}
            iconColor="text-slate-700"
            iconBg="bg-slate-100"
          />

          <StatCard
            title="Present"
            value={summary.presentCount}
            subtitle="Recorded presence"
            icon={CheckCircle2}
            iconColor="text-emerald-700"
            iconBg="bg-emerald-50"
            badge={{ text: 'Recorded', variant: 'emerald' }}
          />

          <StatCard
            title="Absent"
            value={summary.absentCount}
            subtitle="Working day absences"
            icon={XCircle}
            iconColor="text-rose-700"
            iconBg="bg-rose-50"
            badge={{ text: 'Absences', variant: 'rose' }}
          />

          <StatCard
            title="Not Marked"
            value={summary.notMarkedCount}
            subtitle="Unmarked entries"
            icon={Clock}
            iconColor="text-amber-700"
            iconBg="bg-amber-50"
            badge={{ text: 'Not Marked', variant: 'amber' }}
          />

          <StatCard
            title="Sundays"
            value={summary.totalSundays}
            subtitle="Weekly off"
            icon={Sun}
            iconColor="text-amber-600"
            iconBg="bg-amber-50"
          />

          <StatCard
            title="Holidays"
            value={summary.totalHolidays}
            subtitle="Official institute"
            icon={Sparkles}
            iconColor="text-blue-600"
            iconBg="bg-blue-50"
          />
        </div>
      )}

      {/* Attendance Calendar / Daily Breakdown Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 text-sm">Daily Attendance Breakdown</h2>
          <span className="text-xs text-slate-500 font-medium">
            {summary ? `${summary.records.length} calendar days` : ''}
          </span>
        </div>

        {loading ? (
          <TableSkeleton rows={10} columns={4} />
        ) : summary && summary.records.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase bg-slate-50/50 text-[10px]">
                  <th className="py-3 px-4 font-semibold">Date</th>
                  <th className="py-3 px-4 font-semibold">Day of Week</th>
                  <th className="py-3 px-4 font-semibold">Attendance Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Classification / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.records.map((rec) => {
                  const isWeekendOrHoliday = rec.isSunday || rec.isHoliday;
                  return (
                    <tr
                      key={rec.date}
                      className={`hover:bg-slate-50/60 transition ${
                        rec.isSunday ? 'bg-slate-50/40' : rec.isHoliday ? 'bg-blue-50/20' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-medium text-slate-800">
                        {rec.date}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {rec.dayOfWeek}
                      </td>
                      <td className="py-3 px-4">
                        {getStatusBadge(rec)}
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-right text-[11px]">
                        {rec.isHoliday && (
                          <span className="font-semibold text-blue-700">
                            {rec.holidayName} (Institute Holiday)
                          </span>
                        )}
                        {rec.isSunday && 'Weekly Off (Sunday)'}
                        {!isWeekendOrHoliday && rec.status === 'Not Marked' && (
                          <span className="text-slate-500">Not Marked</span>
                        )}
                        {!isWeekendOrHoliday && rec.status !== 'Not Marked' && (
                          <span className="text-slate-400">Regular working day</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-xs text-slate-400">
            No attendance records available for this period.
          </div>
        )}
      </div>
    </div>
  );
};

export default MyAttendancePage;
