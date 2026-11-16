import React, { useState, useEffect } from 'react';
import {
  fetchDatabaseDiagnostics,
  repairDatabaseSchema,
  downloadDatabaseBackupApi,
  fetchBackupStatusApi,
  fetchDriveBackupStatus,
  executeDriveBackupApi,
} from '../services/api';
import type {
  DatabaseDiagnosticsReport,
  DatabaseRepairResult,
  BackupStatusResponse,
  DriveBackupStatusData,
} from '../services/api';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Wrench,
  Table,
  FileSpreadsheet,
  Mail,
  ShieldCheck,
  X,
  Sparkles,
  Download,
  HardDrive,
  FileCheck,
  Cloud,
  ExternalLink,
} from 'lucide-react';

export const DatabaseDoctorPage: React.FC = () => {
  const [report, setReport] = useState<DatabaseDiagnosticsReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Repair State & Modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [confirmChecked, setConfirmChecked] = useState<boolean>(false);
  const [repairing, setRepairing] = useState<boolean>(false);
  const [repairResult, setRepairResult] = useState<DatabaseRepairResult | null>(null);
  const [repairError, setRepairError] = useState<string | null>(null);

  // Backup State
  const [exportingBackup, setExportingBackup] = useState<boolean>(false);
  const [backupNotice, setBackupNotice] = useState<{ message: string; checksum?: string } | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatusResponse['data'] | null>(null);

  // Google Drive Semi-Annual Backup State
  const [driveStatus, setDriveStatus] = useState<DriveBackupStatusData | null>(null);
  const [syncingDrive, setSyncingDrive] = useState<boolean>(false);
  const [driveNotice, setDriveNotice] = useState<string | null>(null);

  const loadDiagnostics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDatabaseDiagnostics();
      setReport(res.data);
    } catch (err: any) {
      setError(err?.message || 'Failed to run database diagnostics.');
    } finally {
      setLoading(false);
    }
  };

  const loadBackupStatus = async () => {
    try {
      const res = await fetchBackupStatusApi();
      if (res.success && res.data) {
        setBackupStatus(res.data);
      }
    } catch {
      // Ignored non-critical background fetch
    }
  };

  const loadDriveBackupStatus = async () => {
    try {
      const res = await fetchDriveBackupStatus();
      if (res.success && res.data) {
        setDriveStatus(res.data);
      }
    } catch {
      // Ignored non-critical background fetch
    }
  };

  useEffect(() => {
    loadDiagnostics();
    loadBackupStatus();
    loadDriveBackupStatus();
  }, []);

  const handleExecuteDriveBackup = async () => {
    setSyncingDrive(true);
    setDriveNotice(null);
    try {
      const res = await executeDriveBackupApi();
      setDriveNotice(res.message || `Successfully created Google Drive backup: ${res.data.title}`);
      await loadDriveBackupStatus();
    } catch (err: any) {
      setError(err?.message || 'Failed to execute Google Drive backup.');
    } finally {
      setSyncingDrive(false);
    }
  };

  const handleDownloadBackup = async () => {
    setExportingBackup(true);
    setBackupNotice(null);
    try {
      const res = await downloadDatabaseBackupApi();
      setBackupNotice({
        message: `Database snapshot downloaded successfully (${res.filename}).`,
        checksum: res.checksum,
      });
      await loadBackupStatus();
    } catch (err: any) {
      setError(err?.message || 'Failed to download database backup.');
    } finally {
      setExportingBackup(false);
    }
  };

  const openRepairModal = () => {
    setConfirmChecked(false);
    setRepairError(null);
    setIsModalOpen(true);
  };

  const handleExecuteRepair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmChecked) return;

    setRepairing(true);
    setRepairError(null);
    try {
      const res = await repairDatabaseSchema(true);
      setRepairResult(res.data);
      setIsModalOpen(false);
      await loadDiagnostics();
    } catch (err: any) {
      setRepairError(err?.message || 'Database repair failed.');
    } finally {
      setRepairing(false);
    }
  };

  const missingSheets = report?.sheets.filter((s) => !s.exists) || [];
  const mismatchedSheets = report?.sheets.filter((s) => s.exists && !s.headersValid) || [];
  const needsAttention = missingSheets.length > 0 || mismatchedSheets.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">
              Google Sheets Database Doctor
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-purple-50 text-purple-700 border border-purple-200">
              Admin Only Diagnostics
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Read-only schema verification and non-destructive worksheet repair.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleDownloadBackup}
            disabled={exportingBackup}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Download complete database JSON snapshot with SHA-256 signature"
          >
            <Download className={`w-3.5 h-3.5 ${exportingBackup ? 'animate-bounce' : ''}`} />
            <span>{exportingBackup ? 'Exporting...' : 'Export Backup (JSON)'}</span>
          </button>
          <button
            onClick={loadDiagnostics}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-sm font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Re-Check Health</span>
          </button>
          {needsAttention && (
            <button
              onClick={openRepairModal}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Wrench className="w-4 h-4" />
              <span>Repair Missing Schema</span>
            </button>
          )}
        </div>
      </div>

      {/* Backup Notification */}
      {backupNotice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-emerald-900">{backupNotice.message}</div>
              {backupNotice.checksum && (
                <div className="text-[11px] text-emerald-700 font-mono mt-1">
                  SHA-256 Checksum: <span className="font-bold">{backupNotice.checksum}</span>
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBackupNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-medium cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {/* Repair Result Banner */}
      {repairResult && (
        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>Database Repair Completed Successfully</span>
            </div>
            <button
              onClick={() => setRepairResult(null)}
              className="text-emerald-600 hover:text-emerald-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-emerald-700">{repairResult.message}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
            <div className="bg-white/80 p-2.5 rounded-lg border border-emerald-200">
              <span className="font-semibold text-slate-700">Worksheets Created:</span>{' '}
              <span className="font-mono text-emerald-800">
                {repairResult.createdSheets.length > 0
                  ? repairResult.createdSheets.join(', ')
                  : 'None needed'}
              </span>
            </div>
            <div className="bg-white/80 p-2.5 rounded-lg border border-emerald-200">
              <span className="font-semibold text-slate-700">Headers Initialized:</span>{' '}
              <span className="font-mono text-emerald-800">
                {repairResult.initializedHeaders.length > 0
                  ? repairResult.initializedHeaders.join(', ')
                  : 'None needed'}
              </span>
            </div>
            <div className="bg-white/80 p-2.5 rounded-lg border border-emerald-200">
              <span className="font-semibold text-slate-700">Preserved Valid:</span>{' '}
              <span className="font-mono text-slate-800">
                {repairResult.alreadyValidSheets.length} sheet(s)
              </span>
            </div>
          </div>
          {repairResult.unresolvedIssues.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
              <div className="font-semibold flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Notice on Existing Custom Headers:</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5">
                {repairResult.unresolvedIssues.map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Diagnostic Metric Cards */}
      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Overall Status
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                  report.status === 'HEALTHY'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : report.status === 'ACTION_REQUIRED'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}
              >
                {report.status === 'HEALTHY' && <CheckCircle2 className="w-3.5 h-3.5" />}
                {report.status === 'ACTION_REQUIRED' && <AlertTriangle className="w-3.5 h-3.5" />}
                {report.status === 'UNCONFIGURED' && <Activity className="w-3.5 h-3.5" />}
                <span>
                  {report.status === 'HEALTHY'
                    ? 'All Sheets Healthy'
                    : report.status === 'ACTION_REQUIRED'
                    ? 'Action Required'
                    : 'Mock / Dev Database'}
                </span>
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Spreadsheet ID (Masked)
            </div>
            <div className="font-mono text-xs font-bold text-slate-800 mt-2 truncate" title={report.configuration.spreadsheetIdMasked}>
              {report.configuration.spreadsheetIdMasked}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {report.isConfigured ? 'Service Account Linked' : 'In-Memory / Test Mode'}
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Service Account (Masked)
            </div>
            <div className="text-xs font-bold text-slate-800 mt-2 truncate" title={report.configuration.serviceAccountEmailMasked}>
              {report.configuration.serviceAccountEmailMasked}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Private key: {report.configuration.isPrivateKeySet ? 'Loaded (Protected)' : 'Not Set'}</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Email Notifications
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <Mail className="w-4 h-4 text-slate-400" />
              <span className={`text-xs font-bold ${report.configuration.isEmailConfigured ? 'text-emerald-700' : 'text-slate-600'}`}>
                {report.configuration.isEmailConfigured ? 'Live SMTP Configured' : 'Audit Logs Only'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Informational notifications recorded
            </div>
          </div>
        </div>
      )}

      {/* Database Backup & Disaster Recovery Card */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-semibold text-slate-900 tracking-tight">
                Offline Database Backup &amp; Disaster Recovery
              </h2>
              <p className="text-[11px] text-slate-400">
                Point-in-time JSON snapshot across all 8 canonical worksheets with SHA-256 cryptographic signature
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadBackup}
            disabled={exportingBackup}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50 shrink-0 self-start sm:self-auto"
          >
            <Download className={`w-3.5 h-3.5 ${exportingBackup ? 'animate-bounce' : ''}`} />
            <span>{exportingBackup ? 'Exporting...' : 'Export Snapshot (JSON)'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block">
              Last Backup Taken
            </span>
            <span className="font-semibold text-slate-800 block mt-1">
              {backupStatus?.lastBackupAt
                ? new Date(backupStatus.lastBackupAt).toLocaleString()
                : 'No backups recorded yet'}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              {backupStatus?.lastPerformedBy ? `By Admin: ${backupStatus.lastPerformedBy}` : 'Run via UI or CLI'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block">
              Integrity Protection
            </span>
            <span className="font-semibold text-emerald-700 flex items-center gap-1 mt-1">
              <FileCheck className="w-3.5 h-3.5" />
              <span>SHA-256 Checksummed</span>
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Tamper-proof signature included
            </span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block">
              CLI Offline Backup
            </span>
            <span className="font-mono text-[11px] font-semibold text-slate-800 block mt-1">
              npm run db:backup
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Saves to backend/backups/
            </span>
          </div>
        </div>
      </div>

      {/* Google Drive Semi-Annual Cloud Backup (Format A: Spreadsheet Clone) */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs sm:text-sm font-semibold text-slate-900 tracking-tight">
                  Google Drive Semi-Annual Cloud Backup
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  Format A (Spreadsheet Clone)
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Automated 6-month disaster recovery engine cloning all active database sheets directly into Google Drive every Jan 1 &amp; Jul 1
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            {driveStatus?.lastBackup?.webViewLink && (
              <a
                href={driveStatus.lastBackup.webViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                <span>Open in Drive</span>
              </a>
            )}
            <button
              type="button"
              onClick={handleExecuteDriveBackup}
              disabled={syncingDrive}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingDrive ? 'animate-spin' : ''}`} />
              <span>{syncingDrive ? 'Cloning to Drive...' : 'Backup to Drive Now'}</span>
            </button>
          </div>
        </div>

        {driveNotice && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{driveNotice}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block">
              Last Drive Backup
            </span>
            <span className="font-semibold text-slate-800 block mt-1 truncate" title={driveStatus?.lastBackup?.title || undefined}>
              {driveStatus?.lastBackup ? driveStatus.lastBackup.title : 'No Drive backups recorded yet'}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              {driveStatus?.lastBackup?.createdAt
                ? `${new Date(driveStatus.lastBackup.createdAt).toLocaleDateString()} (${driveStatus.lastBackup.performedBy})`
                : 'Runs every 6 months automatically'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block">
              Next Scheduled Backup
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="font-semibold text-slate-800">
                {driveStatus?.nextScheduledDate || 'Calculating...'}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                In {driveStatus?.daysRemaining ?? '--'} days
              </span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Schedule: Jan 1 &amp; Jul 1 (Every 6 Months)
            </span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block">
              Google Drive Target
            </span>
            <span className="font-semibold text-slate-800 block mt-1">
              {driveStatus?.folderConfigured ? 'Custom Backup Folder' : 'Default (Service Drive)'}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block truncate" title={driveStatus?.folderIdMasked}>
              Folder: {driveStatus?.folderIdMasked || 'Root'}
            </span>
          </div>
        </div>
      </div>

      {/* Safety Notice Banner */}
      <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-start gap-2.5">
        <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <strong>Non-Destructive Database Doctor Guarantee:</strong> Diagnostics are 100% read-only. When schema repair is executed, missing worksheets are created and empty header rows are initialized. Existing data rows and populated headers are <strong>never overwritten or deleted</strong>. Credentials and private keys are never transmitted to the frontend.
        </div>
      </div>

      {/* Canonical Worksheets Diagnostic Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Table className="w-4 h-4 text-slate-500" />
            <h2 className="font-bold text-slate-900 text-sm">
              Canonical Worksheets Inspection ({report?.totalCanonicalSheets || 8} Sheets Required)
            </h2>
          </div>
          <div className="text-xs text-slate-500">
            {report?.validSheetsCount || 0} Healthy &bull; {report?.missingSheetsCount || 0} Missing &bull; {report?.headerMismatchCount || 0} Header Mismatch
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Running Google Sheets diagnostics...
          </div>
        ) : !report ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No diagnostic data available.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/70 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Worksheet</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Existence</th>
                  <th className="px-4 py-3">Columns Verified</th>
                  <th className="px-6 py-3">Schema Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {report.sheets.map((sheet) => {
                  const isHealthy = sheet.status === 'Healthy';
                  const isMissing = sheet.status === 'MissingSheet';
                  const isMismatch = sheet.status === 'HeaderMismatch';
                  const isEmpty = sheet.status === 'Empty';

                  return (
                    <tr key={sheet.sheetName} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-3.5 font-semibold text-slate-900 flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-slate-400" />
                        <span>{sheet.sheetName}</span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            isHealthy
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : isMissing
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : isMismatch
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {isHealthy && <CheckCircle2 className="w-3 h-3" />}
                          {isMissing && <AlertCircle className="w-3 h-3" />}
                          {isMismatch && <AlertTriangle className="w-3 h-3" />}
                          <span>
                            {isHealthy
                              ? 'Healthy'
                              : isMissing
                              ? 'Worksheet Missing'
                              : isMismatch
                              ? 'Header Mismatch'
                              : 'Empty Header'}
                          </span>
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {sheet.exists ? (
                          <span className="text-emerald-700 font-medium">Present in Spreadsheet</span>
                        ) : (
                          <span className="text-red-600 font-medium">Not Created</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-700 font-medium">
                        {sheet.actualHeaders.length} / {sheet.expectedHeaders.length} headers
                      </td>

                      <td className="px-6 py-3.5 text-xs">
                        {isHealthy && (
                          <span className="text-slate-500">
                            Schema matches canonical headers ({sheet.expectedHeaders.length} columns)
                          </span>
                        )}
                        {isMissing && (
                          <span className="text-red-700 font-medium">
                            Missing worksheet. Click "Repair Missing Schema" to provision automatically.
                          </span>
                        )}
                        {isMismatch && (
                          <div className="space-y-1">
                            {sheet.missingHeaders.length > 0 && (
                              <div className="text-red-700">
                                Missing: <span className="font-mono">{sheet.missingHeaders.join(', ')}</span>
                              </div>
                            )}
                            {sheet.unexpectedHeaders.length > 0 && (
                              <div className="text-slate-500">
                                Extra columns: <span className="font-mono">{sheet.unexpectedHeaders.join(', ')}</span>
                              </div>
                            )}
                          </div>
                        )}
                        {isEmpty && (
                          <span className="text-amber-700 font-medium">
                            Header row empty. Safe to initialize.
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-lg">
                  Confirm Database Schema Repair
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {repairError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{repairError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs text-slate-600">
              <p>
                The Database Doctor will safely inspect and perform the following actions:
              </p>

              {missingSheets.length > 0 && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <div className="font-semibold text-slate-800">
                    Missing Worksheets to Create ({missingSheets.length}):
                  </div>
                  <div className="font-mono text-blue-700">
                    {missingSheets.map((s) => s.sheetName).join(', ')}
                  </div>
                </div>
              )}

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Safety Policy: Zero Data Overwrite</span>
                </div>
                <p>
                  Any existing data rows in your Google Spreadsheet will remain completely untouched.
                  Existing headers will not be cleared.
                </p>
              </div>

              <div className="pt-2 flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="confirmCheck"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <label
                  htmlFor="confirmCheck"
                  className="text-xs font-semibold text-slate-800 cursor-pointer select-none"
                >
                  I authorize the initialization of missing worksheets and empty headers in accordance with the canonical schema.
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteRepair}
                disabled={!confirmChecked || repairing}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
              >
                {repairing ? 'Initializing...' : 'Confirm & Initialize'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
