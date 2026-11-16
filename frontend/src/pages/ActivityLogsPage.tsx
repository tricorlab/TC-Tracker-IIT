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
} from 'lucide-react';

export const ActivityLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
    const prev = (log.PreviousValue || '').trim();
    const next = (log.NewValue || '').trim();
    const reason = (log.Reason || log.Details || '').trim();

    if (prev && next) {
      return (
        <div className="space-y-1">
          {reason && <div className="font-medium text-slate-800">{reason}</div>}
          <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5 flex-wrap">
            <span className="bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200/80">{prev}</span>
            <span>&rarr;</span>
            <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200/80">{next}</span>
          </div>
        </div>
      );
    }
    if (next && !prev) {
      return (
        <div className="space-y-1">
          {reason && <div className="font-medium text-slate-800">{reason}</div>}
          <span className="text-[11px] font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded inline-block border border-slate-200">
            {next}
          </span>
        </div>
      );
    }
    if (reason) {
      return <span className="text-slate-800">{reason}</span>;
    }
    return <span className="text-slate-400">—</span>;
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
                    <td className="py-3.5 px-4 text-slate-700 text-xs max-w-md">
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
    </div>
  );
};

export default ActivityLogsPage;
