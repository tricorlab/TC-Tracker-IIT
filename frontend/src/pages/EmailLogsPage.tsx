import React, { useState, useEffect } from 'react';
import { fetchEmailLogs, testEmailConnection } from '../services/api';
import type { EmailLogItem, EmailConnectionStatus } from '../services/api';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { SearchInput } from '../components/common/SearchInput';
import { TableSkeleton } from '../components/common/LoadingSkeleton';
import {
  Mail,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';

export const EmailLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<EmailLogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Test Email Connection State
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [connectionResult, setConnectionResult] = useState<EmailConnectionStatus | null>(null);
  const [showDiagnostic, setShowDiagnostic] = useState<boolean>(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const res = await testEmailConnection();
      setConnectionResult(res.data);
      setShowDiagnostic(true);
    } catch (err: any) {
      setConnectionResult({
        configured: false,
        hasAppPassword: false,
        authMethod: 'None',
        verified: false,
        error: err?.message || 'Failed to execute SMTP connection test.',
        troubleshooting: 'Ensure the backend server is reachable and environment variables are set.',
      });
      setShowDiagnostic(true);
    } finally {
      setTestingConnection(false);
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchEmailLogs();
      setLogs(res.data || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch email logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      (log.RecipientEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.RelatedLeaveRequestID || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.EmailLogID || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.ErrorMessage || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'All' || log.DeliveryStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return isNaN(d.getTime()) ? isoString : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  const sentCount = logs.filter((l) => l.DeliveryStatus === 'Sent').length;
  const failedCount = logs.filter((l) => l.DeliveryStatus === 'Failed').length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <PageHeader
        title="Email Notification Audit Inspector"
        subtitle="Audit log of leave notification emails."
        badge={
          <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-800 border border-slate-300">
            Admin Only
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testingConnection}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition cursor-pointer disabled:opacity-50"
            >
              {testingConnection ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>{testingConnection ? 'Testing SMTP...' : 'Test Connection'}</span>
            </button>
            <button
              type="button"
              onClick={loadLogs}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg shadow-2xs transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        }
      />

      {/* Live Email SMTP Diagnostic Box */}
      {showDiagnostic && connectionResult && (
        <div
          className={`p-4 rounded-xl border transition shadow-sm ${
            connectionResult.verified
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {connectionResult.verified ? (
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1.5 text-xs">
                <div className="font-bold text-sm">
                  {connectionResult.verified
                    ? 'SMTP Connection Verified Successfully'
                    : 'SMTP Connection Issue Detected'}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-slate-700">
                  <div>
                    <span className="font-semibold text-slate-900">Auth Method:</span>{' '}
                    {connectionResult.authMethod}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">Configured:</span>{' '}
                    {connectionResult.configured ? 'Yes' : 'No'}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">Sender Account:</span>{' '}
                    {connectionResult.gmailUser || '<NOT SET>'}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">App Password:</span>{' '}
                    {connectionResult.hasAppPassword ? 'Configured' : '<NOT SET>'}
                  </div>
                  {connectionResult.portUsed && (
                    <div>
                      <span className="font-semibold text-slate-900">Active Port:</span>{' '}
                      {connectionResult.portUsed} ({connectionResult.portUsed === 465 ? 'SSL' : 'STARTTLS'})
                    </div>
                  )}
                </div>
                {connectionResult.error && (
                  <div className="mt-2 p-2.5 bg-white/80 rounded-lg border border-amber-300 font-mono text-[11px] text-rose-800 break-words">
                    {connectionResult.error}
                  </div>
                )}
                {connectionResult.troubleshooting && (
                  <div className="mt-2 text-slate-800 text-[11px] bg-white/60 p-2.5 rounded-lg border border-amber-200">
                    <span className="font-bold">Next Steps:</span> {connectionResult.troubleshooting}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowDiagnostic(false)}
              className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Logged Attempts"
          value={logs.length}
          subtitle="All dispatch events"
          icon={Mail}
          iconColor="text-slate-700"
          iconBg="bg-slate-100"
        />

        <StatCard
          title="Delivered (Sent)"
          value={sentCount}
          subtitle="Successful deliveries"
          icon={CheckCircle2}
          iconColor="text-emerald-700"
          iconBg="bg-emerald-50"
          badge={{ text: 'Delivered', variant: 'emerald' }}
        />

        <StatCard
          title="Failed / Recorded Unsent"
          value={failedCount}
          subtitle="Logged delivery issues"
          icon={XCircle}
          iconColor="text-rose-700"
          iconBg="bg-rose-50"
          badge={{ text: 'Undelivered', variant: 'rose' }}
        />
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <SearchInput
          placeholder="Search by recipient, request ID, or error..."
          value={searchTerm}
          onChange={setSearchTerm}
          className="w-full md:w-80"
        />

        <div className="flex items-center gap-2 self-start md:self-auto text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-slate-600">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-lg text-xs px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="All">All Statuses</option>
            <option value="Sent">Sent</option>
            <option value="Failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Email Logs Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No email notification logs found matching criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Log ID</th>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Leave Request</th>
                  <th className="px-4 py-3">Delivery Status</th>
                  <th className="px-4 py-3">Error / Note</th>
                  <th className="px-4 py-3">Attempted At</th>
                  <th className="px-4 py-3 text-right">Sent At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => {
                  const isSent = log.DeliveryStatus === 'Sent';

                  return (
                    <tr key={log.EmailLogID} className="hover:bg-slate-50/60 transition">
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                        {log.EmailLogID}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 font-mono text-[11px]">
                        {log.RecipientEmail}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-blue-600">
                        {log.RelatedLeaveRequestID || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={isSent ? 'Sent' : 'Failed'}
                          variant={isSent ? 'present' : 'absent'}
                          size="sm"
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-xs truncate text-[11px]" title={log.ErrorMessage}>
                        {log.ErrorMessage || (isSent ? 'Delivered successfully' : '—')}
                      </td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-[11px]">
                        {formatDate(log.AttemptedAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-right whitespace-nowrap text-[11px]">
                        {formatDate(log.SentAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailLogsPage;
