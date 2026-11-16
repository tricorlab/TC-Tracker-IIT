import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchMonthlyAttendanceReport,
  fetchLeaveBalanceReport,
  downloadReportCsv,
  fetchMonthlyAttendance,
} from '../services/api';
import type {
  MonthlyAttendanceReportData,
  AnnualLeaveBalanceReportData,
  MonthlyAttendanceSummary,
} from '../services/api';
import { useToast } from '../components/common/ToastContext';
import {
  FileSpreadsheet,
  Download,
  Printer,
  Calendar,
  AlertCircle,
  Sparkles,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  CalendarDays,
} from 'lucide-react';

const CURRENT_DATE = new Date();
const DEFAULT_CURRENT_YEAR = CURRENT_DATE.getFullYear();
const DEFAULT_CURRENT_MONTH = CURRENT_DATE.getMonth() + 1;
const GENERATED_DATE_STRING = CURRENT_DATE.toLocaleDateString();

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const YEAR_OPTIONS = Array.from(
  { length: 15 },
  (_, i) => DEFAULT_CURRENT_YEAR - 4 + i
);

const fmtNum = (val: any, decimals = 2): string => {
  const num = typeof val === 'number' ? val : parseFloat(String(val || 0));
  return isNaN(num) ? '0.00' : num.toFixed(decimals);
};

export const ReportsPage: React.FC = () => {
  const toast = useToast();
  // Active Tab: 'attendance' | 'balances'
  const [activeTab, setActiveTab] = useState<'attendance' | 'balances'>('attendance');

  // Attendance Report State: supports Monthly, Multi-Month (2-3 months), and Annual
  const [attPeriodType, setAttPeriodType] = useState<'monthly' | 'multi' | 'annual'>('monthly');
  const [attYear, setAttYear] = useState<number>(DEFAULT_CURRENT_YEAR);
  const [attMonth, setAttMonth] = useState<number>(DEFAULT_CURRENT_MONTH);
  const [attStartMonth, setAttStartMonth] = useState<number>(Math.max(1, DEFAULT_CURRENT_MONTH - 2));
  const [attEndMonth, setAttEndMonth] = useState<number>(DEFAULT_CURRENT_MONTH);
  const [attReport, setAttReport] = useState<MonthlyAttendanceReportData | null>(null);
  const [attLoading, setAttLoading] = useState<boolean>(false);
  const [attError, setAttError] = useState<string | null>(null);

  // Leave Balance Report State
  const [balYear, setBalYear] = useState<number>(DEFAULT_CURRENT_YEAR);
  const [balReport, setBalReport] = useState<AnnualLeaveBalanceReportData | null>(null);
  const [balLoading, setBalLoading] = useState<boolean>(false);
  const [balError, setBalError] = useState<string | null>(null);

  const [downloading, setDownloading] = useState<boolean>(false);

  // Staff-Wise Dossier Modal State
  const [selectedStaff, setSelectedStaff] = useState<MonthlyAttendanceReportData['employeeSummaries'][0] | null>(null);
  const [dossierYear, setDossierYear] = useState<number>(DEFAULT_CURRENT_YEAR);
  const [dossierMonth, setDossierMonth] = useState<number>(DEFAULT_CURRENT_MONTH);
  const [dossierSummary, setDossierSummary] = useState<MonthlyAttendanceSummary | null>(null);
  const [dossierLoading, setDossierLoading] = useState<boolean>(false);
  const [dossierError, setDossierError] = useState<string | null>(null);

  const loadStaffDossier = useCallback(async (userId: string, year: number, month: number) => {
    setDossierLoading(true);
    setDossierError(null);
    try {
      const res = await fetchMonthlyAttendance(userId, year, month);
      setDossierSummary(res.summary);
    } catch (err: any) {
      setDossierError(err?.message || 'Failed to load staff attendance.');
    } finally {
      setDossierLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedStaff) {
      loadStaffDossier(selectedStaff.userId, dossierYear, dossierMonth);
    }
  }, [selectedStaff, dossierYear, dossierMonth, loadStaffDossier]);

  const handleOpenStaffDossier = (staff: MonthlyAttendanceReportData['employeeSummaries'][0]) => {
    setSelectedStaff(staff);
    setDossierYear(attYear);
    setDossierMonth(attPeriodType === 'monthly' ? attMonth : DEFAULT_CURRENT_MONTH);
  };

  const handleSwitchStaff = (userId: string) => {
    const match = attReport?.employeeSummaries.find((s) => s.userId === userId);
    if (match) setSelectedStaff(match);
  };

  const handleDossierPrevMonth = () => {
    if (dossierMonth === 1) {
      setDossierMonth(12);
      setDossierYear((y) => y - 1);
    } else {
      setDossierMonth((m) => m - 1);
    }
  };

  const handleDossierNextMonth = () => {
    if (dossierMonth === 12) {
      setDossierMonth(1);
      setDossierYear((y) => y + 1);
    } else {
      setDossierMonth((m) => m + 1);
    }
  };

  const handleExportStaffCsv = () => {
    if (!selectedStaff || !dossierSummary) return;
    const headers = ['Date', 'Day of Week', 'Day Type', 'Status', 'Marked By'];
    const rows = dossierSummary.records.map((r) => [
      r.date,
      r.dayOfWeek,
      r.isSunday ? 'Sunday (Weekly Off)' : r.isHoliday ? `Holiday (${r.holidayName || 'Holiday'})` : 'Regular Working Day',
      r.status,
      r.markedBy || '—',
    ]);
    const csvContent = [headers.join(','), ...rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `staff-attendance-${selectedStaff.userId}-${dossierYear}-${String(dossierMonth).padStart(2, '0')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported attendance for ${selectedStaff.fullName}`);
  };

  // Load Attendance Report based on period type
  const loadAttendanceReport = async () => {
    setAttLoading(true);
    setAttError(null);
    try {
      let params: any = { year: attYear };
      if (attPeriodType === 'monthly') {
        params = { type: 'monthly', year: attYear, month: attMonth };
      } else if (attPeriodType === 'annual') {
        params = { type: 'annual', year: attYear };
      } else {
        params = { type: 'multi', year: attYear, startMonth: attStartMonth, endMonth: attEndMonth };
      }
      const res = await fetchMonthlyAttendanceReport(params);
      setAttReport(res.data);
    } catch (err: any) {
      setAttError(err?.message || 'Failed to load attendance report.');
    } finally {
      setAttLoading(false);
    }
  };

  // Load Balance Report
  const loadBalanceReport = async (year: number) => {
    setBalLoading(true);
    setBalError(null);
    try {
      const res = await fetchLeaveBalanceReport(year);
      const reportData = (res as any)?.data || res;
      setBalReport(reportData);
    } catch (err: any) {
      setBalError(err?.message || 'Failed to load leave balance report.');
    } finally {
      setBalLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'attendance') {
      loadAttendanceReport();
    } else {
      loadBalanceReport(balYear);
    }
  }, [activeTab, attPeriodType, attYear, attMonth, attStartMonth, attEndMonth, balYear]);

  const handleExportAttendanceCsv = async () => {
    setDownloading(true);
    try {
      let query = `year=${attYear}`;
      let filename = `attendance-report-${attYear}.csv`;

      if (attPeriodType === 'monthly') {
        query = `type=monthly&year=${attYear}&month=${attMonth}`;
        filename = `attendance-report-${attYear}-${String(attMonth).padStart(2, '0')}.csv`;
      } else if (attPeriodType === 'annual') {
        query = `type=annual&year=${attYear}`;
        filename = `attendance-report-${attYear}-annual.csv`;
      } else {
        query = `type=multi&year=${attYear}&startMonth=${attStartMonth}&endMonth=${attEndMonth}`;
        filename = `attendance-report-${attYear}-M${String(attStartMonth).padStart(2, '0')}-to-M${String(attEndMonth).padStart(2, '0')}.csv`;
      }

      await downloadReportCsv(`/api/reports/attendance/csv?${query}`, filename);
      toast.success(`Exported ${filename}`, 'CSV Downloaded');
    } catch (err: any) {
      toast.error(err?.message || 'CSV export failed.', 'Export Error');
    } finally {
      setDownloading(false);
    }
  };

  const handleExportBalancesCsv = async () => {
    setDownloading(true);
    try {
      const filename = `leave-balances-${balYear}.csv`;
      await downloadReportCsv(`/api/reports/leave-balances/csv?year=${balYear}`, filename);
      toast.success(`Exported ${filename}`, 'CSV Downloaded');
    } catch (err: any) {
      toast.error(err?.message || 'CSV export failed.', 'Export Error');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const monthNames = MONTH_NAMES;
  const yearOptions = YEAR_OPTIONS;

  return (
    <div className="space-y-6">
      {/* Header (hidden in print) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Attendance &amp; Leave Reports</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Monthly attendance and annual leave balance records.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-sm font-medium rounded-lg shadow-xs transition-colors"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>Print View</span>
          </button>
          {activeTab === 'attendance' ? (
            <button
              onClick={handleExportAttendanceCsv}
              disabled={downloading || attLoading}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-xs transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>{downloading ? 'Exporting...' : 'Export CSV'}</span>
            </button>
          ) : (
            <button
              onClick={handleExportBalancesCsv}
              disabled={downloading || balLoading}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-xs transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>{downloading ? 'Exporting...' : 'Export CSV'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs (hidden in print) */}
      <div className="flex border-b border-slate-200 no-print">
        <button
          onClick={() => setActiveTab('attendance')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'attendance'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Monthly Attendance Report</span>
        </button>
        <button
          onClick={() => setActiveTab('balances')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'balances'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Annual Leave Balance Report</span>
        </button>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: MONTHLY ATTENDANCE REPORT                                    */}
      {/* =================================================================== */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          {/* Controls bar (hidden in print) */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4 no-print">
            {/* Top row: Filter mode switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Filter Mode:
                </span>
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium text-slate-600">
                  <button
                    type="button"
                    onClick={() => setAttPeriodType('monthly')}
                    className={`px-3 py-1.5 rounded-md transition-all ${
                      attPeriodType === 'monthly'
                        ? 'bg-white text-blue-700 font-semibold shadow-xs'
                        : 'hover:text-slate-900'
                    }`}
                  >
                    Monthly (1 Mo)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttPeriodType('multi')}
                    className={`px-3 py-1.5 rounded-md transition-all ${
                      attPeriodType === 'multi'
                        ? 'bg-white text-blue-700 font-semibold shadow-xs'
                        : 'hover:text-slate-900'
                    }`}
                  >
                    Custom Range
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttPeriodType('annual')}
                    className={`px-3 py-1.5 rounded-md transition-all ${
                      attPeriodType === 'annual'
                        ? 'bg-white text-blue-700 font-semibold shadow-xs'
                        : 'hover:text-slate-900'
                    }`}
                  >
                    Annual (Full Year)
                  </button>
                </div>
              </div>

              {attReport?.periodTitle && (
                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>Reporting for: <strong className="text-slate-800">{attReport.periodTitle}</strong></span>
                </div>
              )}
            </div>

            {/* Bottom row: Period-specific selectors */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Option 1: Monthly */}
              {attPeriodType === 'monthly' && (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-medium text-slate-700">Month:</span>
                  <select
                    value={attMonth}
                    onChange={(e) => setAttMonth(parseInt(e.target.value, 10))}
                    className="border border-slate-300 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {monthNames.map((m, idx) => (
                      <option key={m} value={idx + 1}>
                        {m}
                      </option>
                    ))}
                  </select>

                  <span className="text-xs font-medium text-slate-700">Year:</span>
                  <select
                    value={attYear}
                    onChange={(e) => setAttYear(parseInt(e.target.value, 10))}
                    className="border border-slate-300 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Option 2: Custom Range */}
              {attPeriodType === 'multi' && (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-700">From Month:</span>
                    <select
                      value={attStartMonth}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setAttStartMonth(val);
                        if (val > attEndMonth) setAttEndMonth(val);
                      }}
                      className="border border-slate-300 rounded-lg text-sm px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {monthNames.map((m, idx) => (
                        <option key={m} value={idx + 1}>
                          {m}
                        </option>
                      ))}
                    </select>

                    <span className="text-xs font-medium text-slate-700">To Month:</span>
                    <select
                      value={attEndMonth}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setAttEndMonth(val);
                        if (val < attStartMonth) setAttStartMonth(val);
                      }}
                      className="border border-slate-300 rounded-lg text-sm px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {monthNames.map((m, idx) => (
                        <option key={m} value={idx + 1}>
                          {m}
                        </option>
                      ))}
                    </select>

                    <span className="text-xs font-medium text-slate-700">Year:</span>
                    <select
                      value={attYear}
                      onChange={(e) => setAttYear(parseInt(e.target.value, 10))}
                      className="border border-slate-300 rounded-lg text-sm px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Option 3: Annual (Full Year) */}
              {attPeriodType === 'annual' && (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-700">Select Full Year:</span>
                  <select
                    value={attYear}
                    onChange={(e) => setAttYear(parseInt(e.target.value, 10))}
                    className="border border-slate-300 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        Full Year {y} (Jan 1 – Dec 31)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Summary metadata badge */}
              {attReport && (
                <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                  <span><strong>{attReport.totalWorkingDays}</strong> Working Days</span>
                  <span className="text-slate-300">•</span>
                  <span><strong>{attReport.totalSundays}</strong> Sundays</span>
                  <span className="text-slate-300">•</span>
                  <span><strong>{attReport.totalHolidays}</strong> Holidays</span>
                </div>
              )}

              {/* Quick Staff Ledger Explorer */}
              {attReport && attReport.employeeSummaries.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600 uppercase">Staff Ledger:</span>
                  <select
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const staff = attReport.employeeSummaries.find((s) => s.userId === e.target.value);
                      if (staff) handleOpenStaffDossier(staff);
                    }}
                    className="border border-slate-300 rounded-lg text-xs font-medium px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
                  >
                    <option value="">Select Staff Member...</option>
                    {attReport.employeeSummaries.map((s) => (
                      <option key={s.userId} value={s.userId}>
                        {s.fullName} ({s.userId})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Printable Report Header */}
          <div className="hidden print:block pb-4 border-b border-slate-300">
            <h2 className="text-2xl font-bold text-slate-900">TC Tracker — Attendance Report</h2>
            <div className="text-sm text-slate-600 mt-1">
              Period: {attReport?.periodTitle || `${monthNames[attMonth - 1]} ${attYear}`} | Generated on: {GENERATED_DATE_STRING}
            </div>
          </div>

          {/* Policy safeguard note */}
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              <strong>Integrity Rules Applied:</strong> Sundays and official holidays are never counted as working-day absences. Unrecorded dates are reported as distinct <em>Not Marked</em> records.
            </span>
          </div>

          {attError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm text-red-700">{attError}</div>
            </div>
          )}


          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {attLoading ? (
              <div className="p-12 text-center text-slate-500 text-sm">
                Generating attendance report...
              </div>
            ) : !attReport || attReport.employeeSummaries.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-sm">
                No active staff found for this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3">Employee</th>
                      <th className="px-4 py-3 text-center">Working Days</th>
                      <th className="px-4 py-3 text-center">Present</th>
                      <th className="px-4 py-3 text-center">Absent</th>
                      <th className="px-4 py-3 text-center">Not Marked</th>
                      <th className="px-4 py-3 text-center">Sundays</th>
                      <th className="px-4 py-3 text-center">Holidays</th>
                      <th className="px-6 py-3 text-right">Attendance Rate</th>
                      <th className="px-4 py-3 text-center no-print">Staff Ledger</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {attReport.employeeSummaries.map((emp) => (
                      <tr key={emp.userId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-6 py-3.5">
                          <button
                            type="button"
                            onClick={() => handleOpenStaffDossier(emp)}
                            className="text-left font-semibold text-slate-900 hover:text-blue-600 transition group cursor-pointer block"
                            title="Click to view staff-wise attendance & details"
                          >
                            <span className="group-hover:underline">{emp.fullName}</span>
                          </button>
                          <div className="text-xs text-slate-500">{emp.email}</div>
                        </td>
                        <td className="px-4 py-3.5 text-center font-medium text-slate-700">
                          {emp.workingDays}
                        </td>
                        <td className="px-4 py-3.5 text-center font-semibold text-emerald-700">
                          {emp.presentCount}
                        </td>
                        <td className="px-4 py-3.5 text-center font-semibold text-red-700">
                          {emp.absentCount}
                        </td>
                        <td className="px-4 py-3.5 text-center font-medium text-amber-700">
                          {emp.notMarkedCount}
                        </td>
                        <td className="px-4 py-3.5 text-center text-slate-600">
                          {emp.sundaysCount}
                        </td>
                        <td className="px-4 py-3.5 text-center text-slate-600">
                          {emp.holidaysCount}
                        </td>
                        <td className="px-6 py-3.5 text-right font-semibold text-slate-900">
                          {emp.attendanceRate}%
                        </td>
                        <td className="px-4 py-3.5 text-center no-print">
                          <button
                            type="button"
                            onClick={() => handleOpenStaffDossier(emp)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200 transition cursor-pointer"
                            title={`View detailed monthly ledger for ${emp.fullName}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Details</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Summary / Total Footer Row */}
                  <tfoot className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
                    <tr>
                      <td className="px-6 py-4">
                        INSTITUTE TOTAL ({attReport.totalEmployees} Employees)
                      </td>
                      <td className="px-4 py-4 text-center">
                        {attReport.overallTotals.totalWorkingDays}
                      </td>
                      <td className="px-4 py-4 text-center text-emerald-700">
                        {attReport.overallTotals.totalPresent}
                      </td>
                      <td className="px-4 py-4 text-center text-red-700">
                        {attReport.overallTotals.totalAbsent}
                      </td>
                      <td className="px-4 py-4 text-center text-amber-700">
                        {attReport.overallTotals.totalNotMarked}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {attReport.overallTotals.totalSundays}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {attReport.overallTotals.totalHolidays}
                      </td>
                      <td className="px-6 py-4 text-right">—</td>
                      <td className="px-4 py-4 text-center no-print">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: ANNUAL LEAVE BALANCE REPORT                                  */}
      {/* =================================================================== */}
      {activeTab === 'balances' && (
        <div className="space-y-6">
          {/* Controls bar (hidden in print) */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between no-print">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Select Calendar Year:
              </span>
              <select
                value={balYear}
                onChange={(e) => setBalYear(parseInt(e.target.value, 10))}
                className="border border-slate-300 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-xs text-slate-500">
              Leave Policy: <span className="font-semibold text-slate-800">2.5 days / completed month</span> (credited on 1st of following month)
            </div>
          </div>

          {/* Printable Report Header */}
          <div className="hidden print:block pb-4 border-b border-slate-300">
            <h2 className="text-2xl font-bold text-slate-900">TC Tracker — Annual Leave Balance Report</h2>
            <div className="text-sm text-slate-600 mt-1">
              Calendar Year: {balYear} | Generated on: {GENERATED_DATE_STRING}
            </div>
          </div>

          {/* Policy safeguard note */}
          <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl text-xs text-purple-800 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
            <span>
              <strong>Policy Compliance:</strong> Earned leave calculates at 2.5 days per completed calendar month. Carried-forward balances reflect Admin-controlled 50% year-end rollover and expire on April 1 of the destination year.
            </span>
          </div>

          {balError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm text-red-700">{balError}</div>
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {balLoading ? (
              <div className="p-12 text-center text-slate-500 text-sm">
                Generating annual leave balance report...
              </div>
            ) : !balReport || balReport.balances.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-sm">
                No active employee balance records found for year {balYear}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3">Employee</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Joining Date</th>
                      <th className="px-4 py-3 text-right">Earned</th>
                      <th className="px-4 py-3 text-right">Carried Fwd</th>
                      <th className="px-4 py-3 text-right">Leave Taken</th>
                      <th className="px-6 py-3 text-right">Available</th>
                      <th className="px-4 py-3 text-center">Allowance Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {balReport.balances.map((b) => (
                      <tr key={b.userId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-6 py-3.5">
                          <div className="font-semibold text-slate-900">{b.fullName}</div>
                          <div className="text-xs text-slate-500">{b.email}</div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-600">
                          <span className="inline-block px-2 py-0.5 bg-slate-100 rounded text-slate-700">
                            {b.role}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-600">
                          {b.joiningDate || '—'}
                        </td>
                        <td className="px-4 py-3.5 text-right font-medium text-slate-900">
                          {fmtNum(b.earnedLeave)}d
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="font-medium text-slate-900">
                            {fmtNum(b.carriedForward)}d
                          </div>
                          {b.isCarryForwardExpired && Number(b.carriedForward) > 0 && (
                            <span className="text-[10px] text-red-600 font-semibold">
                              Expired (Apr 1)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right font-medium text-amber-700">
                          {fmtNum(b.usedLeave)}d
                        </td>
                        <td className="px-6 py-3.5 text-right font-bold text-emerald-700">
                          {fmtNum(Math.max(0, b.availableLeave))}d
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {b.isExceeded ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              Exceeds by {fmtNum(b.exceededBy, 1)}d
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Within Allowance
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Summary Footer Row */}
                  <tfoot className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
                    <tr>
                      <td className="px-6 py-4">
                        INSTITUTE TOTAL ({balReport.totalEmployees} Employees)
                      </td>
                      <td className="px-4 py-4">—</td>
                      <td className="px-4 py-4">—</td>
                      <td className="px-4 py-4 text-right text-blue-700">
                        {fmtNum(balReport?.overallTotals?.totalEarned)}d
                      </td>
                      <td className="px-4 py-4 text-right text-purple-700">
                        {fmtNum(balReport?.overallTotals?.totalCarried)}d
                      </td>
                      <td className="px-4 py-4 text-right text-amber-700">
                        {fmtNum(balReport?.overallTotals?.totalUsed)}d
                      </td>
                      <td className="px-6 py-4 text-right text-emerald-700">
                        {fmtNum(balReport?.overallTotals?.totalAvailable)}d
                      </td>
                      <td className="px-4 py-4 text-center text-xs text-slate-600 font-semibold">
                        {balReport.totalExceedingEmployees ? `${balReport.totalExceedingEmployees} Exceeded` : 'All Within Allowance'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* STAFF-WISE ATTENDANCE DOSSIER & PROFILE MODAL                       */}
      {/* =================================================================== */}
      {selectedStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl my-auto overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-[#10243e] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center shadow-xs">
                  {selectedStaff.fullName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                    <span>{selectedStaff.fullName}</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/30 text-blue-200 border border-blue-400/30">
                      {selectedStaff.userId}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300">Staff-Wise Attendance Dossier &amp; Profile Details</p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                {/* Quick Staff Switcher Dropdown */}
                {attReport && attReport.employeeSummaries.length > 1 && (
                  <select
                    value={selectedStaff.userId}
                    onChange={(e) => handleSwitchStaff(e.target.value)}
                    className="bg-white/10 text-white text-xs border border-white/20 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
                    title="Switch to another staff member"
                  >
                    {attReport.employeeSummaries.map((s) => (
                      <option key={s.userId} value={s.userId} className="text-slate-900 bg-white">
                        {s.fullName} ({s.userId})
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  onClick={handleExportStaffCsv}
                  disabled={dossierLoading || !dossierSummary}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50 cursor-pointer"
                  title="Export monthly ledger to CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Export CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedStaff(null)}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition cursor-pointer"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
              {/* SECTION 1: STAFF PROFILE DETAILS (Visible Section) - NO TENURE */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Employee Profile &amp; Details
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Full Name</span>
                    <span className="font-semibold text-slate-900 truncate block mt-0.5">
                      {selectedStaff.fullName}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">User ID</span>
                    <span className="font-mono font-medium text-slate-800 block mt-0.5">
                      {selectedStaff.userId}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Email Address</span>
                    <span className="font-medium text-slate-800 truncate block mt-0.5" title={selectedStaff.email}>
                      {selectedStaff.email}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Role</span>
                    <span className="inline-block font-semibold px-2 py-0.5 rounded bg-slate-200/80 text-slate-800 text-[11px] mt-0.5">
                      {selectedStaff.role}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Joining Date</span>
                    <span className="font-medium text-slate-800 block mt-0.5">
                      {selectedStaff.joiningDate || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 2: PERIOD ATTENDANCE METRICS WITH MONTHLY FILTER */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-blue-600" />
                    <h4 className="text-sm font-bold text-slate-900">
                      Period Attendance Metrics
                    </h4>
                  </div>

                  {/* Monthly Filter Controls */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 hidden sm:inline">Filter Month:</span>
                    <button
                      type="button"
                      onClick={handleDossierPrevMonth}
                      className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                      title="Previous Month"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <select
                      value={dossierMonth}
                      onChange={(e) => setDossierMonth(parseInt(e.target.value, 10))}
                      className="border border-slate-300 rounded-lg text-xs font-semibold px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {MONTH_NAMES.map((m, idx) => (
                        <option key={m} value={idx + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      value={dossierYear}
                      onChange={(e) => setDossierYear(parseInt(e.target.value, 10))}
                      className="border border-slate-300 rounded-lg text-xs font-semibold px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {YEAR_OPTIONS.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleDossierNextMonth}
                      className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                      title="Next Month"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 6 Metric Cards */}
                {dossierLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 animate-pulse">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="h-16 bg-slate-100 rounded-xl" />
                    ))}
                  </div>
                ) : dossierError ? (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between">
                    <span>{dossierError}</span>
                    <button
                      type="button"
                      onClick={() => loadStaffDossier(selectedStaff.userId, dossierYear, dossierMonth)}
                      className="underline font-semibold text-xs ml-2 cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Working Days</div>
                      <div className="text-xl font-extrabold text-slate-900 mt-0.5">
                        {dossierSummary?.totalWorkingDays ?? 0}
                      </div>
                    </div>
                    <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200">
                      <div className="text-[10px] font-bold text-emerald-700 uppercase">Present Days</div>
                      <div className="text-xl font-extrabold text-emerald-700 mt-0.5">
                        {dossierSummary?.presentCount ?? 0}
                      </div>
                    </div>
                    <div className="bg-red-50/70 p-3 rounded-xl border border-red-200">
                      <div className="text-[10px] font-bold text-red-700 uppercase">Absent Days</div>
                      <div className="text-xl font-extrabold text-red-700 mt-0.5">
                        {dossierSummary?.absentCount ?? 0}
                      </div>
                    </div>
                    <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200">
                      <div className="text-[10px] font-bold text-amber-700 uppercase">Not Marked</div>
                      <div className="text-xl font-extrabold text-amber-700 mt-0.5">
                        {dossierSummary?.notMarkedCount ?? 0}
                      </div>
                    </div>
                    <div className="bg-purple-50/70 p-3 rounded-xl border border-purple-200">
                      <div className="text-[10px] font-bold text-purple-700 uppercase">Sundays / Holidays</div>
                      <div className="text-xl font-extrabold text-purple-700 mt-0.5">
                        {dossierSummary?.totalSundays ?? 0} / {dossierSummary?.totalHolidays ?? 0}
                      </div>
                    </div>
                    <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200">
                      <div className="text-[10px] font-bold text-blue-700 uppercase">Attendance Rate</div>
                      <div className="text-xl font-extrabold text-blue-700 mt-0.5">
                        {dossierSummary && dossierSummary.totalWorkingDays > 0
                          ? Math.round((dossierSummary.presentCount / dossierSummary.totalWorkingDays) * 100)
                          : 0}%
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 3: DAY-BY-DAY ATTENDANCE LEDGER */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">
                    Day-by-Day Attendance Ledger ({MONTH_NAMES[dossierMonth - 1]} {dossierYear})
                  </h4>
                  <span className="text-xs text-slate-500">
                    {dossierSummary?.records.length ?? 0} Days Total
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 uppercase tracking-wider sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Day</th>
                        <th className="py-2.5 px-3">Day Type</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3 text-right">Marked By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dossierLoading ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">
                            Loading attendance records...
                          </td>
                        </tr>
                      ) : !dossierSummary || dossierSummary.records.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">
                            No attendance records found for this month.
                          </td>
                        </tr>
                      ) : (
                        dossierSummary.records.map((r) => {
                          const isSun = r.isSunday;
                          const isHol = r.isHoliday;
                          return (
                            <tr
                              key={r.date}
                              className={`hover:bg-slate-50/80 transition-colors ${
                                isSun ? 'bg-slate-50/40 text-slate-500' : isHol ? 'bg-blue-50/20' : ''
                              }`}
                            >
                              <td className="py-2 px-3 font-mono font-medium text-slate-800">
                                {r.date}
                              </td>
                              <td className="py-2 px-3 text-slate-600">
                                {r.dayOfWeek}
                              </td>
                              <td className="py-2 px-3">
                                {isSun ? (
                                  <span className="text-slate-500 italic">Sunday (Weekly Off)</span>
                                ) : isHol ? (
                                  <span className="inline-flex items-center gap-1 font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                                    <Sparkles className="w-3 h-3" />
                                    <span>{r.holidayName || 'Holiday'}</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-600">Regular Working Day</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {isSun || isHol ? (
                                  <span className="inline-block px-2 py-0.5 text-[11px] font-medium rounded bg-slate-100 text-slate-600 border border-slate-200">
                                    Weekly Off
                                  </span>
                                ) : r.status === 'Present' ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Present</span>
                                  </span>
                                ) : r.status === 'Absent' ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-red-50 text-red-700 border border-red-200">
                                    <XCircle className="w-3 h-3" />
                                    <span>Absent</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                    <Clock className="w-3 h-3" />
                                    <span>Not Marked</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right text-slate-500 font-mono text-[11px]">
                                {r.markedBy || '—'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs shrink-0">
              <span className="text-slate-500">
                Viewing attendance records for <strong>{selectedStaff.fullName}</strong>
              </span>
              <button
                type="button"
                onClick={() => setSelectedStaff(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
