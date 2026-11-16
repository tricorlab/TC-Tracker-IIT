import { googleSheetsService } from './googleSheets.service.js';
import { SHEET_NAMES } from '../config/sheets.config.js';
import { ActivityLogRow } from '../types/database.types.js';

/**
 * Defensively strips sensitive authentication credentials from log payloads.
 */
function sanitizeLogValue(val?: string): string {
  if (!val || typeof val !== 'string') return '';
  try {
    const parsed = JSON.parse(val);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const sanitized = { ...parsed };
      delete sanitized.PasswordHash;
      delete sanitized.passwordHash;
      delete sanitized.ResetToken;
      delete sanitized.resetToken;
      delete sanitized.ResetOtp;
      delete sanitized.resetOtp;
      delete sanitized.ResetTokenExpires;
      delete sanitized.resetTokenExpires;
      delete sanitized.ResetOtpAttempts;
      delete sanitized.resetOtpAttempts;
      return JSON.stringify(sanitized);
    }
  } catch {
    // Plain string or non-JSON value, retain as-is
  }
  return val;
}

export class ActivityLogService {
  private mockLogs: ActivityLogRow[] = [];

  /**
   * Log an administrative, attendance, holiday, or balance action.
   */
  public async logActivity(entry: {
    performedBy: string;
    action: string;
    entityType: string;
    entityID: string;
    previousValue?: string;
    newValue?: string;
    reason?: string;
  }): Promise<ActivityLogRow> {
    const logRecord: ActivityLogRow = {
      LogID: `ACT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      PerformedBy: entry.performedBy || 'SYSTEM',
      Action: entry.action,
      EntityType: entry.entityType,
      EntityID: entry.entityID,
      PreviousValue: sanitizeLogValue(entry.previousValue),
      NewValue: sanitizeLogValue(entry.newValue),
      Reason: entry.reason || '',
      Timestamp: new Date().toISOString(),
    };

    // Always maintain recent logs in memory buffer as immediate cache
    this.mockLogs.push(logRecord);
    if (this.mockLogs.length > 500) {
      this.mockLogs = this.mockLogs.slice(-500);
    }

    if (googleSheetsService.isLiveApiEnabled()) {
      try {
        await googleSheetsService.appendSheetRow(SHEET_NAMES.ACTIVITY_LOGS, [
          logRecord.LogID,
          logRecord.PerformedBy,
          logRecord.Action,
          logRecord.EntityType,
          logRecord.EntityID,
          logRecord.PreviousValue,
          logRecord.NewValue,
          logRecord.Reason,
          logRecord.Timestamp,
        ]);
      } catch (err: any) {
        console.error('[ActivityLog Error] Failed to write log to Google Sheets:', err.message);
      }
    }

    return logRecord;
  }

  private normalizeLog(r: any): ActivityLogRow & { ActivityLogID?: string; CreatedAt?: string; Details?: string } {
    const logId = r.LogID || r.ActivityLogID || `ACT-${Date.now()}`;
    const ts = r.Timestamp || r.CreatedAt || new Date().toISOString();
    const reason = r.Reason || r.Details || '';
    return {
      LogID: String(logId).trim(),
      ActivityLogID: String(logId).trim(),
      PerformedBy: String(r.PerformedBy || 'SYSTEM').trim(),
      Action: String(r.Action || '').trim(),
      EntityType: String(r.EntityType || '').trim(),
      EntityID: String(r.EntityID || '').trim(),
      PreviousValue: String(r.PreviousValue || '').trim(),
      NewValue: String(r.NewValue || '').trim(),
      Reason: String(reason).trim(),
      Details: String(reason).trim(),
      Timestamp: String(ts).trim(),
      CreatedAt: String(ts).trim(),
    };
  }

  /**
   * Retrieve all activity logs without truncation (used for audit checks and duplicate prevention).
   */
  public async getAllLogs(): Promise<ActivityLogRow[]> {
    if (googleSheetsService.isLiveApiEnabled()) {
      try {
        const records = await googleSheetsService.getSheetRecords<ActivityLogRow>(
          SHEET_NAMES.ACTIVITY_LOGS
        );
        if (records && records.length > 0) {
          return records.map((r) => this.normalizeLog(r));
        }
      } catch {
        return this.mockLogs.map((r) => this.normalizeLog(r));
      }
    }
    return this.mockLogs.map((r) => this.normalizeLog(r));
  }

  /**
   * Retrieve recent activity logs (Admin view).
   */
  public async getRecentLogs(limit = 100): Promise<ActivityLogRow[]> {
    if (googleSheetsService.isLiveApiEnabled()) {
      try {
        const records = await googleSheetsService.getSheetRecords<ActivityLogRow>(
          SHEET_NAMES.ACTIVITY_LOGS
        );
        if (records && records.length > 0) {
          return records.slice(-limit).reverse().map((r) => this.normalizeLog(r));
        }
      } catch (err: any) {
        console.error('[ActivityLog Error] Failed to fetch logs from Google Sheets:', err.message);
      }
    }
    return this.mockLogs.slice(-limit).reverse().map((r) => this.normalizeLog(r));
  }

  public clearMockLogs(): void {
    this.mockLogs = [];
  }

  public getMockLogs(): ActivityLogRow[] {
    return [...this.mockLogs];
  }
}

export const activityLogService = new ActivityLogService();
