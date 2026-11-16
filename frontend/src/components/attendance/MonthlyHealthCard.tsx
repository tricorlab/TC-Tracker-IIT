import React, { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Sun,
  Sparkles,
  Clock,
  AlertTriangle,
  Printer,
  X,
  ExternalLink,
  Calendar,
  Check,
  FileText,
} from 'lucide-react';
import { fetchMonthlyAttendance } from '../../services/api';
import type {
  MonthlyAttendanceSummary,
  MonthlyAttendanceRecord,
} from '../../services/api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface MonthlyHealthCardProps {
  initialSummary?: MonthlyAttendanceSummary | null;
  userId?: string;
  userName?: string;
  userRole?: string;
  userEmail?: string;
  onMonthChange?: (year: number, month: number) => void;
  showDownloadSlip?: boolean;
}

export const MonthlyHealthCard: React.FC<MonthlyHealthCardProps> = ({
  initialSummary,
  userId,
  userName = 'Staff Member',
  userRole = 'Staff',
  userEmail = '',
  onMonthChange,
  showDownloadSlip = true,
}) => {
  const [currentDate] = useState(() => new Date());
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  const [selectedYear, setSelectedYear] = useState<number>(
    initialSummary?.year ?? currentYear
  );
  const [selectedMonth, setSelectedMonth] = useState<number>(
    initialSummary?.month ?? currentMonth
  );
  const [summary, setSummary] = useState<MonthlyAttendanceSummary | null>(
    initialSummary || null
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Verification UI state
  const [selectedRecord, setSelectedRecord] = useState<MonthlyAttendanceRecord | null>(null);
  const [showSlipModal, setShowSlipModal] = useState<boolean>(false);
  const [slipGeneratedOn, setSlipGeneratedOn] = useState<string>(() => new Date().toLocaleString('en-US'));

  // Sync with initialSummary when prop changes and matches current selected period
  const [prevInitialSummary, setPrevInitialSummary] = useState(initialSummary);
  if (initialSummary !== prevInitialSummary) {
    setPrevInitialSummary(initialSummary);
    if (
      initialSummary &&
      initialSummary.year === selectedYear &&
      initialSummary.month === selectedMonth
    ) {
      setSummary(initialSummary);
    }
  }

  // Load monthly summary when year or month changes
  const loadMonthData = useCallback(
    async (y: number, m: number) => {
      // If initialSummary already matches, avoid duplicate API call
      if (
        initialSummary &&
        initialSummary.year === y &&
        initialSummary.month === m
      ) {
        setSummary(initialSummary);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await fetchMonthlyAttendance(userId, y, m);
        if (res?.summary) {
          setSummary(res.summary);
        }
      } catch (err: any) {
        setError(err?.message || 'Unable to load attendance for this month');
      } finally {
        setLoading(false);
      }
    },
    [userId, initialSummary]
  );

  const handlePrevMonth = () => {
    let nextY = selectedYear;
    let nextM = selectedMonth - 1;
    if (nextM < 1) {
      nextM = 12;
      nextY -= 1;
    }
    setSelectedYear(nextY);
    setSelectedMonth(nextM);
    setSelectedRecord(null);
    loadMonthData(nextY, nextM);
    if (onMonthChange) onMonthChange(nextY, nextM);
  };

  const handleNextMonth = () => {
    let nextY = selectedYear;
    let nextM = selectedMonth + 1;
    if (nextM > 12) {
      nextM = 1;
      nextY += 1;
    }
    setSelectedYear(nextY);
    setSelectedMonth(nextM);
    setSelectedRecord(null);
    loadMonthData(nextY, nextM);
    if (onMonthChange) onMonthChange(nextY, nextM);
  };

  const handleResetToCurrent = () => {
    setSelectedYear(currentYear);
    setSelectedMonth(currentMonth);
    setSelectedRecord(null);
    loadMonthData(currentYear, currentMonth);
    if (onMonthChange) onMonthChange(currentYear, currentMonth);
  };

  // Metrics derivation
  const monthName = MONTH_NAMES[selectedMonth - 1];
  const isCurrentMonth = selectedYear === currentYear && selectedMonth === currentMonth;

  const totalCalendarDays = summary?.totalCalendarDays ?? 0;
  const totalWorkingDays = summary?.totalWorkingDays ?? 0;
  const presentCount = summary?.presentCount ?? 0;
  const absentCount = summary?.absentCount ?? 0;
  const notMarkedCount = summary?.notMarkedCount ?? 0;
  const totalSundays = summary?.totalSundays ?? 0;
  const totalHolidays = summary?.totalHolidays ?? 0;
  const specialLeaveCount = summary?.specialLeaveCount ?? 0;

  // Rate calculation
  const recordedDays = presentCount + absentCount;
  const attendanceRate = useMemo(() => {
    if (summary?.attendanceRate !== undefined) return summary.attendanceRate;
    if (totalWorkingDays > 0) {
      return Math.min(100, Math.round((presentCount / totalWorkingDays) * 100));
    }
    if (recordedDays > 0) {
      return Math.min(100, Math.round((presentCount / recordedDays) * 100));
    }
    return 100;
  }, [summary, totalWorkingDays, presentCount, recordedDays]);

  // Segment percentages for multi-segment health gauge
  const presentPct = totalWorkingDays > 0 ? (presentCount / totalWorkingDays) * 100 : 0;
  const absentPct = totalWorkingDays > 0 ? (absentCount / totalWorkingDays) * 100 : 0;
  const pendingPct = totalWorkingDays > 0 ? (notMarkedCount / totalWorkingDays) * 100 : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all">
      {/* 1. Header with Month Navigator */}
      <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-50/60 via-white to-blue-50/20">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
              <span>{monthName} Attendance Health</span>
              <span className="text-xs font-normal text-slate-400">({selectedYear})</span>
            </h3>
            {!isCurrentMonth && (
              <button
                type="button"
                onClick={handleResetToCurrent}
                className="text-[11px] font-semibold text-[#1a73e8] hover:underline cursor-pointer ml-1"
                title="Jump to current month"
              >
                Back to Current
              </button>
            )}
          </div>
        </div>

        {/* Right Header: Month Stepper & Slip Button */}
        <div className="flex items-center gap-2">
          {showDownloadSlip && (
            <button
              type="button"
              onClick={() => {
                setSlipGeneratedOn(new Date().toLocaleString('en-US'));
                setShowSlipModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition shadow-2xs cursor-pointer"
              title="Print or save formal monthly verification statement"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span>Verify Slip</span>
            </button>
          )}

          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={handlePrevMonth}
              disabled={loading}
              className="p-1 rounded hover:bg-slate-100 text-slate-600 transition cursor-pointer disabled:opacity-50"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2.5 text-xs font-bold text-slate-800 min-w-[100px] text-center select-none">
              {monthName.slice(0, 3)} {selectedYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              disabled={loading}
              className="p-1 rounded hover:bg-slate-100 text-slate-600 transition cursor-pointer disabled:opacity-50"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="m-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Main Health Gauge & Key Performance Metrics */}
      <div className="p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left Column: Progress Bar with Target Needle */}
          <div className="flex-1">
            <div className="mb-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {attendanceRate}%
              </span>
            </div>

            {/* Visual Gauge Bar */}
            <div className="relative pt-6 pb-2 w-full">
              {/* Target Needle Pin positioned at 80% */}
              <div
                className="absolute top-0 left-[80%] -translate-x-1/2 flex flex-col items-center pointer-events-none"
                title="Target benchmark: 80%"
              >
                <span className="text-[10px] font-bold text-slate-700 bg-white border border-slate-300 px-1.5 py-0.2 rounded shadow-2xs leading-tight">
                  Target
                </span>
                <div className="w-0.5 h-2.5 bg-slate-700" />
              </div>

              {/* Multi-Segment Track */}
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden flex shadow-inner">
                {/* Present Segment */}
                <div
                  className="bg-emerald-500 h-full transition-all duration-700 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, presentPct))}%` }}
                  title={`Present: ${presentCount} days (${Math.round(presentPct)}%)`}
                />
                {/* Absent Segment */}
                <div
                  className="bg-rose-500 h-full transition-all duration-700 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, absentPct))}%` }}
                  title={`Absent: ${absentCount} days (${Math.round(absentPct)}%)`}
                />
                {/* Pending / Not Marked Segment */}
                <div
                  className="bg-amber-300 h-full transition-all duration-700 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, pendingPct))}%` }}
                  title={`Not Marked: ${notMarkedCount} days (${Math.round(pendingPct)}%)`}
                />
              </div>
            </div>

            {/* Gauge Legend */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-1">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>Present ({presentCount}d)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span>Absent ({absentCount}d)</span>
              </span>
              {notMarkedCount > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-300" />
                  <span>Not Marked ({notMarkedCount}d)</span>
                </span>
              )}
              {specialLeaveCount > 0 && (
                <span className="inline-flex items-center gap-1.5 font-semibold text-purple-700">
                  <Sparkles className="w-3 h-3 text-purple-600" />
                  <span>{specialLeaveCount}d Special Leave Credited</span>
                </span>
              )}
            </div>
          </div>

          {/* Right Column: Metric Quick Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100">
            <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100">
              <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">
                Working Days
              </span>
              <span className="text-lg font-extrabold text-slate-900 mt-0.5 block">
                {totalWorkingDays} d
              </span>
              <span className="text-[10px] text-slate-400 block">Excl. off-days</span>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-100">
              <span className="text-[11px] font-semibold text-emerald-800 block uppercase tracking-wider">
                Present
              </span>
              <span className="text-lg font-extrabold text-emerald-900 mt-0.5 block">
                {presentCount} d
              </span>
              <span className="text-[10px] text-emerald-700 block">
                {specialLeaveCount > 0 ? `Incl. ${specialLeaveCount}d SPL` : 'Recorded lab'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-100">
              <span className="text-[11px] font-semibold text-rose-800 block uppercase tracking-wider">
                Absent
              </span>
              <span className="text-lg font-extrabold text-rose-900 mt-0.5 block">
                {absentCount} d
              </span>
              <span className="text-[10px] text-rose-700 block">Working absences</span>
            </div>

            <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100">
              <span className="text-[11px] font-semibold text-blue-800 block uppercase tracking-wider">
                Excluded Off
              </span>
              <span className="text-lg font-extrabold text-blue-900 mt-0.5 block">
                {totalSundays + totalHolidays} d
              </span>
              <span className="text-[10px] text-blue-700 block">
                {totalSundays} Sun &bull; {totalHolidays} Hol
              </span>
            </div>
          </div>
        </div>

        {/* 3. Daily Attendance Punch Log Ribbon */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>Daily Attendance Punch Log</span>
            </span>
          </div>

          {/* Micro Ribbon Grid */}
          <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-16 lg:grid-cols-31 gap-1.5">
            {summary?.records && summary.records.length > 0 ? (
              summary.records.map((rec) => {
                const dayNum = parseInt(rec.date.slice(8, 10), 10);
                const dayLetter = rec.dayOfWeek.slice(0, 2);
                const isSelected = selectedRecord?.date === rec.date;

                // Color badge logic
                let chipBg = 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100';
                let indicatorDot = 'bg-slate-400';

                if (rec.isSunday) {
                  chipBg = 'bg-slate-100/70 border-slate-200 text-slate-500 hover:bg-slate-200/80';
                  indicatorDot = 'bg-amber-400';
                } else if (rec.isHoliday) {
                  chipBg = 'bg-blue-50 border-blue-200 text-blue-700 font-semibold hover:bg-blue-100';
                  indicatorDot = 'bg-blue-600';
                } else if (rec.isSpecialLeave) {
                  chipBg = 'bg-purple-50 border-purple-200 text-purple-800 font-semibold hover:bg-purple-100';
                  indicatorDot = 'bg-purple-600';
                } else if (rec.status === 'Present') {
                  chipBg = 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold hover:bg-emerald-100';
                  indicatorDot = 'bg-emerald-500';
                } else if (rec.status === 'Absent') {
                  chipBg = 'bg-rose-50 border-rose-200 text-rose-800 font-semibold hover:bg-rose-100';
                  indicatorDot = 'bg-rose-500';
                } else {
                  // Not marked
                  chipBg = 'bg-amber-50/50 border-dashed border-amber-200 text-amber-800 hover:bg-amber-100/60';
                  indicatorDot = 'bg-amber-400';
                }

                if (isSelected) {
                  chipBg += ' ring-2 ring-[#1a73e8] shadow-sm';
                }

                return (
                  <button
                    key={rec.date}
                    type="button"
                    onClick={() => setSelectedRecord(rec)}
                    className={`flex flex-col items-center justify-center p-1.5 rounded-lg border text-center transition-all cursor-pointer ${chipBg}`}
                    title={`${rec.date} (${rec.dayOfWeek}): ${
                      rec.isHoliday
                        ? rec.holidayName
                        : rec.isSunday
                        ? 'Sunday'
                        : rec.isSpecialLeave
                        ? `Present (Special Leave)`
                        : rec.status
                    }`}
                  >
                    <span className="text-[10px] uppercase font-medium opacity-60 leading-none">
                      {dayLetter}
                    </span>
                    <span className="text-xs font-bold leading-tight mt-0.5">
                      {dayNum}
                    </span>
                    <span className={`w-1.5 h-1.5 rounded-full mt-1 ${indicatorDot}`} />
                  </button>
                );
              })
            ) : (
              <div className="col-span-full py-4 text-center text-xs text-slate-400">
                No daily records available for this month.
              </div>
            )}
          </div>

          {/* 5. Click-to-Inspect Inspection Detail Card */}
          {selectedRecord && (
            <div className="mt-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                    selectedRecord.isHoliday
                      ? 'bg-blue-100 text-blue-700 border-blue-200'
                      : selectedRecord.isSunday
                      ? 'bg-amber-100 text-amber-700 border-amber-200'
                      : selectedRecord.isSpecialLeave
                      ? 'bg-purple-100 text-purple-700 border-purple-200'
                      : selectedRecord.status === 'Present'
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                      : selectedRecord.status === 'Absent'
                      ? 'bg-rose-100 text-rose-700 border-rose-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {selectedRecord.isHoliday ? (
                    <Sparkles className="w-5 h-5" />
                  ) : selectedRecord.isSunday ? (
                    <Sun className="w-5 h-5" />
                  ) : selectedRecord.isSpecialLeave ? (
                    <Sparkles className="w-5 h-5" />
                  ) : selectedRecord.status === 'Present' ? (
                    <Check className="w-5 h-5" />
                  ) : selectedRecord.status === 'Absent' ? (
                    <X className="w-5 h-5" />
                  ) : (
                    <Clock className="w-5 h-5" />
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-xs sm:text-sm">
                      {selectedRecord.date} ({selectedRecord.dayOfWeek})
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        selectedRecord.isHoliday
                          ? 'bg-blue-100 text-blue-800 border-blue-200'
                          : selectedRecord.isSunday
                          ? 'bg-slate-200 text-slate-700 border-slate-300'
                          : selectedRecord.isSpecialLeave
                          ? 'bg-purple-100 text-purple-800 border-purple-200'
                          : selectedRecord.status === 'Present'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : selectedRecord.status === 'Absent'
                          ? 'bg-rose-100 text-rose-800 border-rose-200'
                          : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}
                    >
                      {selectedRecord.isHoliday
                        ? `Holiday: ${selectedRecord.holidayName}`
                        : selectedRecord.isSunday
                        ? 'Sunday (Weekly Off)'
                        : selectedRecord.isSpecialLeave
                        ? 'Present (Special Leave Credited)'
                        : selectedRecord.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 mt-1">
                    {selectedRecord.isHoliday && (
                      <span>
                        Official institute holiday. <strong>Excluded from working days</strong> (0
                        penalty).
                      </span>
                    )}
                    {selectedRecord.isSunday && (
                      <span>
                        Standard weekly off. <strong>Excluded from working days</strong> (0 penalty).
                      </span>
                    )}
                    {selectedRecord.isSpecialLeave && (
                      <span>
                        Credited as <strong>Present</strong> via administrative Critical Section
                        Special Leave {selectedRecord.leaveRequestId ? `(${selectedRecord.leaveRequestId})` : ''}.
                      </span>
                    )}
                    {!selectedRecord.isHoliday &&
                      !selectedRecord.isSunday &&
                      !selectedRecord.isSpecialLeave &&
                      selectedRecord.status === 'Present' && (
                        <span>
                          Regular lab attendance verified.{' '}
                          {selectedRecord.markedBy && `Marked by ${selectedRecord.markedBy}.`}
                        </span>
                      )}
                    {!selectedRecord.isHoliday &&
                      !selectedRecord.isSunday &&
                      selectedRecord.status === 'Absent' && (
                        <span>
                          Recorded as an absence on a scheduled working day.{' '}
                          {selectedRecord.isLeave && selectedRecord.leaveType && (
                            <span className="font-semibold text-rose-700">
                              (Covered by {selectedRecord.leaveType} {selectedRecord.leaveRequestId})
                            </span>
                          )}
                        </span>
                      )}
                    {!selectedRecord.isHoliday &&
                      !selectedRecord.isSunday &&
                      selectedRecord.status === 'Not Marked' && (
                        <span>
                          Daily attendance has not yet been submitted by administration for this
                          date.
                        </span>
                      )}
                  </p>
                </div>
              </div>

              {/* Action / Dismiss */}
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                {selectedRecord.status === 'Absent' && (
                  <Link
                    to="/leave/submit"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1a73e8] hover:underline"
                  >
                    <span>Submit Leave Notice</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedRecord(null)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                  title="Close inspection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 6. Printable Official Monthly Attendance Verification Statement Modal */}
      {showSlipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 shadow-2xl p-6 sm:p-8">
            {/* Modal Controls (Hidden in Print) */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 print:hidden">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Official Staff Verification Slip
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#1a73e8] hover:bg-[#1557b0] transition shadow-xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Slip</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSlipModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Formal Institutional Slip Content */}
            <div className="mt-4 print:mt-0 space-y-6 text-slate-800">
              {/* Slip Header */}
              <div className="text-center pb-4 border-b-2 border-slate-800">
                <h2 className="text-lg sm:text-xl font-extrabold uppercase tracking-tight text-slate-900">
                  TC Tracker &bull; Attendance Verification Statement
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Institutional Monthly Attendance & Leave Audit Record
                </p>
                <div className="inline-block mt-2 px-3 py-0.5 rounded-full bg-slate-100 text-slate-800 font-mono text-xs font-bold">
                  Period: {monthName} {selectedYear}
                </div>
              </div>

              {/* Employee Information Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 block">Staff Name:</span>
                  <span className="font-bold text-slate-900 text-sm">{userName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">User ID:</span>
                  <span className="font-mono font-bold text-slate-900">{userId || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Role / Designation:</span>
                  <span className="font-semibold text-slate-800">{userRole}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Email Address:</span>
                  <span className="font-medium text-slate-700">{userEmail || 'N/A'}</span>
                </div>
              </div>

              {/* Verification Arithmetic Box */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                  Monthly Verification Metrics
                </h4>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-lg border border-slate-200 bg-white">
                    <span className="text-[10px] text-slate-500 block">Calendar Days</span>
                    <span className="font-bold text-slate-900 text-base">{totalCalendarDays}</span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-slate-200 bg-white">
                    <span className="text-[10px] text-slate-500 block">Working Days</span>
                    <span className="font-bold text-slate-900 text-base">{totalWorkingDays}</span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/50">
                    <span className="text-[10px] text-emerald-800 block">Present Days</span>
                    <span className="font-bold text-emerald-900 text-base">{presentCount}</span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-rose-200 bg-rose-50/50">
                    <span className="text-[10px] text-rose-800 block">Absent Days</span>
                    <span className="font-bold text-rose-900 text-base">{absentCount}</span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-blue-200 bg-blue-50/50">
                    <span className="text-[10px] text-blue-800 block">Holidays</span>
                    <span className="font-bold text-blue-900 text-base">{totalHolidays}</span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/50">
                    <span className="text-[10px] text-amber-800 block">Sundays</span>
                    <span className="font-bold text-amber-900 text-base">{totalSundays}</span>
                  </div>
                </div>

                <div className="mt-3 p-3 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">
                    Calculated Monthly Attendance Health Score:
                  </span>
                  <span className="font-extrabold text-base text-[#1a73e8]">
                    {attendanceRate}%
                  </span>
                </div>
              </div>

              {/* Complete Daily Punch Audit Table */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                  Daily Record Breakdown
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-1.5 px-3">Date</th>
                        <th className="py-1.5 px-3">Day</th>
                        <th className="py-1.5 px-3">Classification</th>
                        <th className="py-1.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {summary?.records && summary.records.length > 0 ? (
                        summary.records.map((rec) => (
                          <tr key={rec.date} className="hover:bg-slate-50/50">
                            <td className="py-1.5 px-3 font-mono font-medium">{rec.date}</td>
                            <td className="py-1.5 px-3 text-slate-600">{rec.dayOfWeek}</td>
                            <td className="py-1.5 px-3 text-slate-600">
                              {rec.isHoliday
                                ? `Official Holiday (${rec.holidayName})`
                                : rec.isSunday
                                ? 'Weekly Off (Sunday)'
                                : rec.isSpecialLeave
                                ? 'Special Leave (Credited Present)'
                                : 'Regular Working Day'}
                            </td>
                            <td className="py-1.5 px-3 text-right font-semibold">
                              <span
                                className={
                                  rec.status === 'Present'
                                    ? 'text-emerald-700'
                                    : rec.status === 'Absent'
                                    ? 'text-rose-700'
                                    : 'text-slate-500'
                                }
                              >
                                {rec.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-400">
                            No records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Formal Disclaimer & Certification Footer */}
              <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
                <p>
                  System-generated certificate via TC Tracker.
                  <br />
                  Generated on: {slipGeneratedOn}
                </p>
                <div className="text-right">
                  <div className="border-b border-slate-400 w-40 pb-1 mb-1 font-mono text-[10px] text-slate-600">
                    DIGITALLY VERIFIED
                  </div>
                  <span>Institutional Administration</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthlyHealthCard;
