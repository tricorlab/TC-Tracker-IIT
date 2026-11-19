import React, { useState, useEffect, useMemo } from 'react';
import { fetchActivityLogs } from '../services/api';
import { PageHeader } from '../components/common/PageHeader';
import { SearchInput } from '../components/common/SearchInput';
import { TableSkeleton } from '../components/common/LoadingSkeleton';
import {
  AlertCircle,
  RotateCcw,
  History,
  Filter,
  Download,
  ArrowRight,
  Eye,
  X,
  Copy,
  Check,
  ExternalLink,
  FileJson,
} from 'lucide-react';

interface DiffChange {
  key: string;
  label: string;
  oldVal: string;
  newVal: string;
}

const SENSITIVE_OR_IGNORED_KEYS = new Set([
  'PasswordHash',
  'ResetToken',
  'ResetOtp',
  'ResetTokenExpires',
  'ResetOtpAttempts',
  'PasswordChangedAt',
  'MustChangePassword',
  'UpdatedAt',
  'CreatedAt',
  'Timestamp',
]);

const tryParseJson = (val: any): Record<string, any> | null => {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    return null;
  }
  return null;
};

const formatKeyLabel = (key: string): string => {
  const map: Record<string, string> = {
    MonthlyAccrual: 'Monthly Accrual',
    CarryForwardPercentage: 'Carry Forward %',
    CarryForwardDate: 'Carry Forward Date',
    CarryForwardExpiryDate: 'Expiry Date',
    MinimumContinuousCalendarDays: 'Min Calendar Days',
    WorkingDays: 'Working Days',
    EffectiveFrom: 'Effective Date',
    AttendanceDate: 'Date',
    IsActive: 'Status',
    EarnedLeave: 'Earned',
    CarriedForward: 'Carried Over',
    UsedLeave: 'Used',
    AvailableLeave: 'Available',
    HolidayName: 'Holiday',
    HolidayDate: 'Holiday Date',
    FullName: 'Full Name',
    LeaveType: 'Leave Type',
    CalculatedDays: 'Days',
    StartDate: 'Start Date',
    EndDate: 'End Date',
    fileId: 'File ID',
    webViewLink: 'Drive Link',
    title: 'Backup Title',
  };
  if (map[key]) return map[key];
  return key.replace(/([A-Z])/g, ' $1').trim();
};

const formatPrimitiveValue = (val: any): string => {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Active / Yes' : 'Inactive / No';
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  const str = String(val).trim();
  if (str.toUpperCase() === 'TRUE') return 'Active / Yes';
  if (str.toUpperCase() === 'FALSE') return 'Inactive / No';
  return str || '—';
};

const computeObjectDiff = (
  prevObj: Record<string, any>,
  nextObj: Record<string, any>
): DiffChange[] => {
  const allKeys = Array.from(new Set([...Object.keys(prevObj), ...Object.keys(nextObj)]));
  const diffs: DiffChange[] = [];

  for (const k of allKeys) {
    if (SENSITIVE_OR_IGNORED_KEYS.has(k)) continue;
    const oldRaw = prevObj[k];
    const newRaw = nextObj[k];
    const oldStr = formatPrimitiveValue(oldRaw);
    const newStr = formatPrimitiveValue(newRaw);

    if (oldStr !== newStr) {
      diffs.push({
        key: k,
        label: formatKeyLabel(k),
        oldVal: oldStr,
        newVal: newStr,
      });
    }
  }

  return diffs;
};

export const ActivityLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Event Inspection & JSON Inspector Modal State
  const [inspectLog, setInspectLog] = useState<any | null>(null);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);
  const [modalTab, setModalTab] = useState<'changes' | 'raw'>('changes');

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchActivityLogs(200);
      const logList = Array.isArray(res.logs)
        ? res.logs
        : Array.isArray((res as any).data)
        ? (res as any).data
        : [];
      setLogs(logList);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch activity logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const getActionBadgeClass = (action: string) => {
    const act = (action || '').toUpperCase();
    if (act.includes('ATTENDANCE')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
    }
    if (act.includes('LEAVE')) {
      return 'bg-indigo-50 text-indigo-700 border-indigo-200/80';
    }
    if (act.includes('USER') || act.includes('ROLE')) {
      return 'bg-purple-50 text-purple-700 border-purple-200/80';
    }
    if (act.includes('HOLIDAY')) {
      return 'bg-amber-50 text-amber-700 border-amber-200/80';
    }
    if (act.includes('POLICY') || act.includes('TRANSITION')) {
      return 'bg-cyan-50 text-cyan-700 border-cyan-200/80';
    }
    if (act.includes('BACKUP') || act.includes('DOCTOR') || act.includes('SCHEMA')) {
      return 'bg-slate-100 text-slate-700 border-slate-300';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const formatTimestamp = (ts?: string) => {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return ts;
      return d.toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  const formatDetails = (log: any) => {
    const prevRaw = (log.PreviousValue || '').trim();
    const nextRaw = (log.NewValue || '').trim();
    const reason = (log.Reason || log.Details || '').trim();

    const prevObj = tryParseJson(prevRaw);
    const nextObj = tryParseJson(nextRaw);

    // Case 1: Both Previous and New Values exist
    if (prevRaw && nextRaw) {
      if (prevObj && nextObj) {
        const diffs = computeObjectDiff(prevObj, nextObj);

        if (diffs.length > 0) {
          const visibleDiffs = diffs.slice(0, 3);
          const remainingCount = diffs.length - visibleDiffs.length;

          return (
            <div className="space-y-1.5 py-0.5">
              {reason && <div className="font-medium text-slate-800 text-xs">{reason}</div>}
              <div className="flex flex-wrap items-center gap-1.5">
                {visibleDiffs.map((d) => (
                  <span
                    key={d.key}
                    className="inline-flex items-center gap-1 text-[11px] bg-slate-50 border border-slate-200/90 rounded-md px-2 py-0.5 shadow-2xs"
                    title={`${d.label}: ${d.oldVal} -> ${d.newVal}`}
                  >
                    <span className="font-semibold text-slate-700">{d.label}:</span>
                    <span className="line-through text-rose-600 bg-rose-50/80 px-1 py-0.2 rounded border border-rose-200/60 font-mono text-[10px]">
                      {d.oldVal}
                    </span>
                    <ArrowRight className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                    <span className="font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200/80 font-mono text-[10px]">
                      {d.newVal}
                    </span>
                  </span>
                ))}

                {remainingCount > 0 && (
                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    +{remainingCount} more
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setInspectLog(log);
                    setModalTab('changes');
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-1.5 py-0.5 rounded transition cursor-pointer"
                  title="Inspect event details and raw JSON"
                >
                  <Eye className="w-3 h-3" />
                  <span>Inspect</span>
                </button>
              </div>
            </div>
          );
        }

        // Only ignored keys or metadata changed
        return (
          <div className="space-y-1 py-0.5">
            {reason && <div className="font-medium text-slate-800 text-xs">{reason}</div>}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 italic">Record state refreshed</span>
              <button
                type="button"
                onClick={() => {
                  setInspectLog(log);
                  setModalTab('raw');
                }}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800"
              >
                <Eye className="w-3 h-3" />
                <span>View Snapshot</span>
              </button>
            </div>
          </div>
        );
      }

      // Plain string changes (e.g. "Staff" -> "Admin")
      return (
        <div className="space-y-1 py-0.5">
          {reason && <div className="font-medium text-slate-800 text-xs">{reason}</div>}
          <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5 flex-wrap">
            <span className="bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200/80 break-all max-w-xs">{prevRaw}</span>
            <span>&rarr;</span>
            <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200/80 break-all max-w-xs">{nextRaw}</span>
          </div>
        </div>
      );
    }

    // Case 2: Only NewValue exists
    if (nextRaw && !prevRaw) {
      if (nextObj) {
        if (nextObj.webViewLink || nextObj.title) {
          return (
            <div className="space-y-1 py-0.5">
              {reason && <div className="font-medium text-slate-800 text-xs">{reason}</div>}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  {nextObj.title || 'Google Drive Backup'}
                </span>
                {nextObj.webViewLink && (
                  <a
                    href={nextObj.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 underline font-medium"
                  >
                    <span>Open in Drive</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setInspectLog(log);
                    setModalTab('changes');
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-1.5 py-0.5 rounded transition cursor-pointer ml-auto"
                >
                  <Eye className="w-3 h-3" />
                  <span>Inspect</span>
                </button>
              </div>
            </div>
          );
        }

        const keys = Object.keys(nextObj).filter((k) => !SENSITIVE_OR_IGNORED_KEYS.has(k)).slice(0, 3);
        return (
          <div className="space-y-1.5 py-0.5">
            {reason && <div className="font-medium text-slate-800 text-xs">{reason}</div>}
            <div className="flex flex-wrap items-center gap-1.5">
              {keys.map((k) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 text-[11px] bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5"
                >
                  <span className="font-semibold text-slate-600">{formatKeyLabel(k)}:</span>
                  <span className="font-mono text-slate-800">{formatPrimitiveValue(nextObj[k])}</span>
                </span>
              ))}
              <button
                type="button"
                onClick={() => {
                  setInspectLog(log);
                  setModalTab('changes');
                }}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-1.5 py-0.5 rounded transition cursor-pointer"
              >
                <Eye className="w-3 h-3" />
                <span>Inspect</span>
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-1 py-0.5">
          {reason && <div className="font-medium text-slate-800 text-xs">{reason}</div>}
          <span className="text-[11px] font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded inline-block border border-slate-200 break-all max-w-xs">
            {nextRaw}
          </span>
        </div>
      );
    }

    if (reason) {
      return <span className="text-slate-800 text-xs">{reason}</span>;
    }
    return <span className="text-slate-400 text-xs">—</span>;
  };

  const filteredLogs = useMemo(() => {
    let result = logs;

    if (categoryFilter !== 'ALL') {
      result = result.filter((l) => {
        const action = (l.Action || '').toUpperCase();
        const entity = (l.EntityType || '').toUpperCase();
        if (categoryFilter === 'ATTENDANCE') return action.includes('ATTENDANCE') || entity.includes('ATTENDANCE');
        if (categoryFilter === 'LEAVE') return action.includes('LEAVE') || entity.includes('LEAVE');
        if (categoryFilter === 'USER') return action.includes('USER') || action.includes('ROLE') || entity.includes('USER');
        if (categoryFilter === 'HOLIDAY') return action.includes('HOLIDAY') || entity.includes('HOLIDAY');
        if (categoryFilter === 'POLICY') return action.includes('POLICY') || action.includes('TRANSITION') || action.includes('BACKUP') || action.includes('DOCTOR');
        return true;
      });
    }

    if (!searchQuery.trim()) {
      return result;
    }

    const q = searchQuery.toLowerCase().trim();
    return result.filter(
      (l) =>
        l.Action?.toLowerCase().includes(q) ||
        l.EntityType?.toLowerCase().includes(q) ||
        l.EntityID?.toLowerCase().includes(q) ||
        l.Details?.toLowerCase().includes(q) ||
        l.Reason?.toLowerCase().includes(q) ||
        l.PreviousValue?.toLowerCase().includes(q) ||
        l.NewValue?.toLowerCase().includes(q) ||
        l.PerformedBy?.toLowerCase().includes(q)
    );
  }, [searchQuery, categoryFilter, logs]);

  const handleExportCsv = () => {
    if (filteredLogs.length === 0) return;
    const headers = ['LogID', 'Action', 'EntityType', 'EntityID', 'PreviousValue', 'NewValue', 'Reason', 'PerformedBy', 'Timestamp'];
    const rows = filteredLogs.map((l) => [
      `"${l.LogID || l.ActivityLogID || ''}"`,
      `"${l.Action || ''}"`,
      `"${l.EntityType || ''}"`,
      `"${l.EntityID || ''}"`,
      `"${(l.PreviousValue || '').replace(/"/g, '""')}"`,
      `"${(l.NewValue || '').replace(/"/g, '""')}"`,
      `"${(l.Reason || l.Details || '').replace(/"/g, '""')}"`,
      `"${l.PerformedBy || ''}"`,
      `"${l.Timestamp || l.CreatedAt || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Activity_Logs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <PageHeader
        title="Activity Logs"
        subtitle="Audit trail of administrative actions, user changes, attendance marking, and leave operations."
        badge={
          <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-800 border border-slate-300">
            Admin Only
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredLogs.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
              title="Download CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={loadLogs}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        }
      />

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col sm:flex-row items-center gap-3">
        <div className="w-full sm:flex-1">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search Action, Entity, Reason, Old/New Value, or PerformedBy..."
            className="w-full"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 transition cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Categories</option>
            <option value="ATTENDANCE">Attendance</option>
            <option value="LEAVE">Leave Requests &amp; Quotas</option>
            <option value="USER">User Management</option>
            <option value="HOLIDAY">Holidays</option>
            <option value="POLICY">Policy &amp; System Operations</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <h2 className="font-bold text-slate-900 text-sm">Recorded Audit Activities</h2>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Showing {filteredLogs.length} of {logs.length} events
          </span>
        </div>

        {loading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : filteredLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase bg-slate-50/50 text-[10px]">
                  <th className="py-3 px-4 font-semibold">Action</th>
                  <th className="py-3 px-4 font-semibold">Entity</th>
                  <th className="py-3 px-4 font-semibold">Entity ID</th>
                  <th className="py-3 px-4 font-semibold">Audit Details &amp; Changes</th>
                  <th className="py-3 px-4 font-semibold">Performed By</th>
                  <th className="py-3 px-4 font-semibold text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log, idx) => (
                  <tr
                    key={log.LogID || log.ActivityLogID || `${idx}-${log.Timestamp}-${log.Action}`}
                    className="hover:bg-slate-50/60 transition"
                  >
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full font-mono text-[10px] font-semibold border ${getActionBadgeClass(
                          log.Action
                        )}`}
                      >
                        {log.Action}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
                      {log.EntityType}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 text-[11px] whitespace-nowrap">
                      {log.EntityID}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 text-xs max-w-md break-words">
                      {formatDetails(log)}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap text-[11px]">
                      {log.PerformedBy}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 text-right whitespace-nowrap text-[11px]">
                      {formatTimestamp(log.Timestamp || log.CreatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-xs text-slate-400">
            <History className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-600">No activity records match your filter criteria.</p>
            <p className="text-slate-400 mt-1">
              Administrative actions such as attendance marking, leave adjustments, and onboarding are automatically logged here.
            </p>
          </div>
        )}
      </div>

      {/* Event Details & Raw JSON Inspector Modal */}
      {inspectLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <FileJson className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Audit Event Inspector
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Log #{inspectLog.LogID || inspectLog.ActivityLogID || 'RECORD'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectLog(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/50 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Sub-Header: Metadata */}
            <div className="px-5 py-3 border-b border-slate-100 bg-white grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">Action</span>
                <span className={`inline-block mt-0.5 px-2 py-0.2 rounded-full font-mono text-[10px] font-semibold border ${getActionBadgeClass(inspectLog.Action)}`}>
                  {inspectLog.Action}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">Target Entity</span>
                <span className="font-semibold text-slate-800 block truncate">{inspectLog.EntityType}: {inspectLog.EntityID}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">Performed By</span>
                <span className="font-mono text-slate-700 block truncate">{inspectLog.PerformedBy}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">Timestamp</span>
                <span className="text-slate-600 block">{formatTimestamp(inspectLog.Timestamp || inspectLog.CreatedAt)}</span>
              </div>
            </div>

            {/* Remark / Reason if present */}
            {(inspectLog.Reason || inspectLog.Details) && (
              <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 text-xs">
                <span className="font-semibold text-slate-600">Admin Remark: </span>
                <span className="text-slate-800 font-medium">{inspectLog.Reason || inspectLog.Details}</span>
              </div>
            )}

            {/* Tab Navigation */}
            <div className="px-5 pt-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModalTab('changes')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 transition cursor-pointer ${
                    modalTab === 'changes'
                      ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Structured Changes
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab('raw')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 transition cursor-pointer ${
                    modalTab === 'raw'
                      ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Raw JSON Snapshot
                </button>
              </div>

              {modalTab === 'raw' && (
                <button
                  type="button"
                  onClick={() => {
                    const rawPayload = {
                      previous: tryParseJson(inspectLog.PreviousValue) || inspectLog.PreviousValue,
                      new: tryParseJson(inspectLog.NewValue) || inspectLog.NewValue,
                    };
                    navigator.clipboard.writeText(JSON.stringify(rawPayload, null, 2));
                    setCopiedJson(true);
                    setTimeout(() => setCopiedJson(false), 2000);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition cursor-pointer"
                >
                  {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
                </button>
              )}
            </div>

            {/* Modal Body Content */}
            <div className="p-5 overflow-y-auto flex-1 text-xs">
              {modalTab === 'changes' ? (
                <div>
                  {(() => {
                    const prevObj = tryParseJson(inspectLog.PreviousValue);
                    const nextObj = tryParseJson(inspectLog.NewValue);

                    if (prevObj && nextObj) {
                      const diffs = computeObjectDiff(prevObj, nextObj);
                      if (diffs.length > 0) {
                        return (
                          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase">
                                <tr>
                                  <th className="py-2.5 px-3">Field / Parameter</th>
                                  <th className="py-2.5 px-3">Previous State</th>
                                  <th className="py-2.5 px-3">Updated State</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {diffs.map((d) => (
                                  <tr key={d.key} className="hover:bg-slate-50/50">
                                    <td className="py-2 px-3 font-semibold text-slate-700">{d.label}</td>
                                    <td className="py-2 px-3 font-mono text-rose-700 bg-rose-50/40">{d.oldVal}</td>
                                    <td className="py-2 px-3 font-mono text-emerald-700 bg-emerald-50/40 font-bold">{d.newVal}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      }
                    }

                    const singleObj = nextObj || prevObj;
                    if (singleObj) {
                      const entries = Object.entries(singleObj).filter(([k]) => !SENSITIVE_OR_IGNORED_KEYS.has(k));
                      return (
                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase">
                              <tr>
                                <th className="py-2.5 px-3">Property</th>
                                <th className="py-2.5 px-3">Value</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {entries.map(([k, v]) => (
                                <tr key={k} className="hover:bg-slate-50/50">
                                  <td className="py-2 px-3 font-semibold text-slate-700">{formatKeyLabel(k)}</td>
                                  <td className="py-2 px-3 font-mono text-slate-800 break-all">{formatPrimitiveValue(v)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    }

                    return (
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                        {inspectLog.PreviousValue && (
                          <div>
                            <span className="font-semibold text-slate-600 block text-[11px]">Previous Value:</span>
                            <span className="font-mono text-slate-800 break-all bg-white p-2 rounded border border-slate-200 block mt-0.5">
                              {inspectLog.PreviousValue}
                            </span>
                          </div>
                        )}
                        {inspectLog.NewValue && (
                          <div>
                            <span className="font-semibold text-slate-600 block text-[11px]">New Value:</span>
                            <span className="font-mono text-slate-800 break-all bg-white p-2 rounded border border-slate-200 block mt-0.5">
                              {inspectLog.NewValue}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-auto max-h-80 leading-relaxed border border-slate-800 select-all">
                  {JSON.stringify(
                    {
                      LogID: inspectLog.LogID || inspectLog.ActivityLogID,
                      Action: inspectLog.Action,
                      EntityType: inspectLog.EntityType,
                      EntityID: inspectLog.EntityID,
                      PerformedBy: inspectLog.PerformedBy,
                      Timestamp: inspectLog.Timestamp,
                      Reason: inspectLog.Reason || inspectLog.Details,
                      PreviousValue: tryParseJson(inspectLog.PreviousValue) || inspectLog.PreviousValue || null,
                      NewValue: tryParseJson(inspectLog.NewValue) || inspectLog.NewValue || null,
                    },
                    null,
                    2
                  )}
                </pre>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setInspectLog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityLogsPage;
