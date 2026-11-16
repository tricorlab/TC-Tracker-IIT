import { google, drive_v3 } from 'googleapis';
import { config } from '../config/env.config.js';
import { activityLogService } from './activityLog.service.js';
import { emailService } from './email.service.js';

export interface DriveBackupResult {
  success: boolean;
  fileId: string;
  title: string;
  webViewLink: string;
  folderId?: string;
  createdAt: string;
  performedBy: string;
  size?: string;
  message: string;
}

export interface DriveBackupStatus {
  isConfigured: boolean;
  folderConfigured: boolean;
  folderIdMasked: string;
  lastBackup: {
    fileId: string;
    title: string;
    webViewLink: string;
    createdAt: string;
    performedBy: string;
  } | null;
  nextScheduledDate: string;
  daysRemaining: number;
  scheduleFrequency: string;
}

export class GoogleDriveBackupService {
  private driveClient: drive_v3.Drive | null = null;
  private mockMode: boolean = config.isTest || process.env.NODE_ENV === 'test';
  private mockBackups: DriveBackupResult[] = [];
  private schedulerInterval: NodeJS.Timeout | null = null;

  public setMockMode(enabled: boolean): void {
    this.mockMode = enabled;
  }

  public isMockMode(): boolean {
    return this.mockMode || config.isTest || process.env.NODE_ENV === 'test';
  }

  public clearMockBackups(): void {
    this.mockBackups = [];
  }

  public getMockBackups(): DriveBackupResult[] {
    return [...this.mockBackups];
  }

  /**
   * Check if Service Account credentials and Spreadsheet ID are configured.
   */
  public isConfigured(): boolean {
    return Boolean(
      config.google.serviceAccountEmail &&
      config.google.privateKey &&
      config.google.spreadsheetId
    );
  }

  public isLiveApiEnabled(): boolean {
    return !this.isMockMode() && this.isConfigured();
  }

  /**
   * Mask a secret folder ID for safe display in UI.
   */
  private maskFolderId(folderId?: string): string {
    if (!folderId || typeof folderId !== 'string') return 'Default (Drive Root)';
    const trimmed = folderId.trim();
    if (trimmed.length <= 8) return '******';
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
  }

  /**
   * Initialize authorized Google Drive v3 client using Service Account.
   */
  private async getDriveClient(): Promise<drive_v3.Drive> {
    if (this.driveClient) return this.driveClient;

    if (!this.isConfigured()) {
      throw new Error(
        'Google Drive Service Account credentials are not configured. Please check GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_SPREADSHEET_ID.'
      );
    }

    try {
      const auth = new google.auth.JWT({
        email: config.google.serviceAccountEmail,
        key: config.google.privateKey,
        scopes: [
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/spreadsheets',
        ],
      });

      this.driveClient = google.drive({ version: 'v3', auth });
      return this.driveClient;
    } catch (err: any) {
      throw new Error(`Failed to initialize Google Drive client: ${err?.message || 'Unknown error'}`);
    }
  }

  /**
   * Calculate next semi-annual scheduled backup date (January 1st or July 1st).
   */
  public calculateNextScheduledDate(fromDate: Date = new Date()): { nextDate: Date; daysRemaining: number } {
    const year = fromDate.getFullYear();
    const jan1 = new Date(year, 0, 1, 0, 0, 0, 0);
    const jul1 = new Date(year, 6, 1, 0, 0, 0, 0);
    const nextJan1 = new Date(year + 1, 0, 1, 0, 0, 0, 0);

    let nextDate: Date;
    if (fromDate < jan1) {
      nextDate = jan1;
    } else if (fromDate < jul1) {
      nextDate = jul1;
    } else {
      nextDate = nextJan1;
    }

    const diffMs = nextDate.getTime() - fromDate.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    return { nextDate, daysRemaining };
  }

  /**
   * Generate canonical timestamped title for Google Sheet backup.
   * Format A: TC_Tracker_Backup_YYYY-MM-DD_H1 or H2
   */
  public generateBackupTitle(date: Date = new Date(), customSuffix?: string): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const half = (date.getMonth() + 1) <= 6 ? 'H1' : 'H2';
    const dateStr = `${year}-${month}-${day}`;

    if (customSuffix && customSuffix.trim().length > 0) {
      return `TC_Tracker_Backup_${dateStr}_${half}_${customSuffix.trim()}`;
    }
    return `TC_Tracker_Backup_${dateStr}_${half}`;
  }

  /**
   * Execute Google Drive Backup (Format A: Spreadsheet Clone).
   * Creates an exact point-in-time copy of the live spreadsheet in Google Drive.
   */
  public async createDriveBackup(options?: {
    customTitle?: string;
    performedBy?: string;
    folderId?: string;
  }): Promise<DriveBackupResult> {
    const performedBy = options?.performedBy || 'ADMIN';
    const backupTitle = options?.customTitle || this.generateBackupTitle();
    const targetFolderId = options?.folderId || config.google.driveBackupFolderId || undefined;
    const nowIso = new Date().toISOString();

    // 1. Mock Mode (for unit tests and local mock runs)
    if (!this.isLiveApiEnabled()) {
      const mockFileId = `drive-mock-${Date.now()}`;
      const mockLink = `https://docs.google.com/spreadsheets/d/${mockFileId}/edit`;

      const result: DriveBackupResult = {
        success: true,
        fileId: mockFileId,
        title: backupTitle,
        webViewLink: mockLink,
        folderId: targetFolderId,
        createdAt: nowIso,
        performedBy,
        size: '150KB',
        message: `Successfully created semi-annual Google Drive spreadsheet clone backup: "${backupTitle}"`,
      };

      this.mockBackups.unshift(result);

      // Audit Log in ActivityLogs
      try {
        await activityLogService.logActivity({
          performedBy,
          action: 'DRIVE_BACKUP_CREATED',
          entityType: 'GoogleDrive',
          entityID: mockFileId,
          previousValue: undefined,
          newValue: JSON.stringify({
            fileId: mockFileId,
            title: backupTitle,
            webViewLink: mockLink,
            folderId: targetFolderId,
            createdAt: nowIso,
            performedBy,
          }),
          reason: 'Semi-annual Google Drive spreadsheet clone backup (Format A)',
        });
      } catch (logErr: any) {
        console.warn('[GoogleDriveBackup] Could not record activity log:', logErr.message);
      }

      // Email Notification
      try {
        await emailService.sendDriveBackupNotification({
          fileId: mockFileId,
          title: backupTitle,
          webViewLink: mockLink,
          createdAt: nowIso,
          performedBy,
        });
      } catch (emailErr: any) {
        console.warn('[GoogleDriveBackup] Email notification skipped:', emailErr.message);
      }

      return result;
    }

    // 2. Live Google Drive API Execution
    const drive = await this.getDriveClient();
    const sourceSpreadsheetId = config.google.spreadsheetId;

    if (!sourceSpreadsheetId) {
      throw new Error('GOOGLE_SPREADSHEET_ID is not configured in environment.');
    }

    try {
      const response = await drive.files.copy({
        fileId: sourceSpreadsheetId,
        supportsAllDrives: true,
        requestBody: {
          name: backupTitle,
          parents: targetFolderId ? [targetFolderId] : undefined,
        },
        fields: 'id, name, webViewLink, createdTime, size, parents',
      });

      const fileData = response.data;
      const fileId = fileData.id || `copied-${Date.now()}`;
      const webViewLink = fileData.webViewLink || `https://docs.google.com/spreadsheets/d/${fileId}/edit`;

      const result: DriveBackupResult = {
        success: true,
        fileId,
        title: fileData.name || backupTitle,
        webViewLink,
        folderId: targetFolderId,
        createdAt: fileData.createdTime || nowIso,
        performedBy,
        size: fileData.size ? `${Math.round(Number(fileData.size) / 1024)}KB` : undefined,
        message: `Successfully cloned Google Spreadsheet to Google Drive as "${backupTitle}".`,
      };

      // Record Activity Log
      try {
        await activityLogService.logActivity({
          performedBy,
          action: 'DRIVE_BACKUP_CREATED',
          entityType: 'GoogleDrive',
          entityID: fileId,
          previousValue: undefined,
          newValue: JSON.stringify({
            fileId,
            title: result.title,
            webViewLink,
            folderId: targetFolderId,
            createdAt: result.createdAt,
            performedBy,
          }),
          reason: 'Semi-annual Google Drive spreadsheet clone backup (Format A)',
        });
      } catch (logErr: any) {
        console.warn('[GoogleDriveBackup] Could not record activity log:', logErr.message);
      }

      // Dispatch Email Notification to Admin
      try {
        await emailService.sendDriveBackupNotification({
          fileId,
          title: result.title,
          webViewLink,
          createdAt: result.createdAt,
          performedBy,
        });
      } catch (emailErr: any) {
        console.warn('[GoogleDriveBackup] Email notification skipped:', emailErr.message);
      }

      return result;
    } catch (err: any) {
      const errMsg = err?.message || 'Unknown error';
      const isQuotaError = errMsg.includes('storage quota') || errMsg.includes('storageQuotaExceeded');

      if (isQuotaError) {
        console.error(
          '[GoogleDriveBackup Error] Service Account storage quota exceeded. Google Cloud Service Accounts have 0 bytes of Drive storage quota and cannot own files in personal Google Drive. To use Google Drive cloning, the destination folder must be inside a Google Workspace Shared Drive with the Service Account added as Content Manager, or use OAuth delegation / local database snapshots.'
        );
      } else {
        console.error('[GoogleDriveBackup Error] Failed to clone spreadsheet in Google Drive:', errMsg);
      }
      throw new Error(`Google Drive API error: Failed to clone spreadsheet backup: ${errMsg}`);
    }
  }

  /**
   * Get Google Drive backup status, last recorded backup, and next scheduled date.
   */
  public async getDriveBackupStatus(): Promise<DriveBackupStatus> {
    const isConfigured = this.isConfigured() || this.isMockMode();
    const folderConfigured = Boolean(config.google.driveBackupFolderId);
    const folderIdMasked = this.maskFolderId(config.google.driveBackupFolderId);

    const { nextDate, daysRemaining } = this.calculateNextScheduledDate();

    // Check mock list first
    if (this.mockBackups.length > 0) {
      const latest = this.mockBackups[0];
      return {
        isConfigured,
        folderConfigured,
        folderIdMasked,
        lastBackup: {
          fileId: latest.fileId,
          title: latest.title,
          webViewLink: latest.webViewLink,
          createdAt: latest.createdAt,
          performedBy: latest.performedBy,
        },
        nextScheduledDate: nextDate.toISOString().split('T')[0],
        daysRemaining,
        scheduleFrequency: 'Every 6 Months (Jan 1 & Jul 1)',
      };
    }

    // Query ActivityLogs for previous DRIVE_BACKUP_CREATED events
    try {
      const logs = await activityLogService.getAllLogs();
      const driveLogs = logs
        .filter((l) => l.Action === 'DRIVE_BACKUP_CREATED')
        .sort((a, b) => new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime());

      if (driveLogs.length > 0) {
        const latest = driveLogs[0];
        let parsedNewVal: any = {};
        try {
          parsedNewVal = JSON.parse(latest.NewValue || '{}');
        } catch {
          parsedNewVal = {};
        }

        return {
          isConfigured,
          folderConfigured,
          folderIdMasked,
          lastBackup: {
            fileId: latest.EntityID || parsedNewVal.fileId || 'UNKNOWN',
            title: parsedNewVal.title || 'TC_Tracker_Backup',
            webViewLink: parsedNewVal.webViewLink || `https://docs.google.com/spreadsheets/d/${latest.EntityID}/edit`,
            createdAt: latest.Timestamp,
            performedBy: latest.PerformedBy || 'SYSTEM',
          },
          nextScheduledDate: nextDate.toISOString().split('T')[0],
          daysRemaining,
          scheduleFrequency: 'Every 6 Months (Jan 1 & Jul 1)',
        };
      }
    } catch (err: any) {
      console.warn('[GoogleDriveBackup] Could not fetch activity logs for backup status:', err.message);
    }

    return {
      isConfigured,
      folderConfigured,
      folderIdMasked,
      lastBackup: null,
      nextScheduledDate: nextDate.toISOString().split('T')[0],
      daysRemaining,
      scheduleFrequency: 'Every 6 Months (Jan 1 & Jul 1)',
    };
  }

  /**
   * Automated 6-month scheduler: checks if a semi-annual backup is due.
   */
  public async checkAndExecuteScheduledBackup(): Promise<boolean> {
    const status = await this.getDriveBackupStatus();
    const now = new Date();
    const currentMonth = now.getMonth(); // 0 = Jan, 6 = Jul
    const currentDate = now.getDate();
    const todayStr = now.toISOString().split('T')[0];

    // Idempotency check: verify if an automated backup (Drive or Database snapshot) already ran today
    try {
      const logs = await activityLogService.getAllLogs();
      const ranToday = logs.some(
        (l) =>
          (l.Action === 'DRIVE_BACKUP_CREATED' || l.Action === 'DATABASE_BACKUP_CREATED') &&
          l.Timestamp?.startsWith(todayStr) &&
          l.PerformedBy === 'SYSTEM_SCHEDULER'
      );
      if (ranToday) {
        return false;
      }
    } catch {
      // Continue with normal evaluation if activity logs check fails
    }

    // Check if today is semi-annual day (Jan 1 or Jul 1)
    const isSemiAnnualDay = (currentMonth === 0 || currentMonth === 6) && currentDate === 1;

    // Check if last backup was more than 180 days ago
    let isElapsed180Days = false;
    if (status.lastBackup) {
      const lastDate = new Date(status.lastBackup.createdAt);
      const diffDays = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      isElapsed180Days = diffDays >= 180;

      // Idempotency guard: Don't execute if already executed today
      const isAlreadyRunToday =
        todayStr === lastDate.toISOString().split('T')[0];
      if (isAlreadyRunToday) {
        return false;
      }
    } else {
      // If no backup has ever been performed, take initial baseline snapshot
      isElapsed180Days = true;
    }

    if (isSemiAnnualDay || isElapsed180Days) {
      console.log('[GoogleDriveBackup] Triggering semi-annual automated backup to Google Drive...');
      try {
        await this.createDriveBackup({
          performedBy: 'SYSTEM_SCHEDULER',
        });
        console.log('[GoogleDriveBackup] Semi-annual automated backup to Google Drive completed.');
        return true;
      } catch (err: any) {
        console.error('[GoogleDriveBackup Error] Scheduled backup failed:', err.message);

        // Fallback: If Google Drive cloning fails (e.g. Service Account quota exceeded in personal Google Drive),
        // safely trigger local verified JSON database snapshot so data is never left unprotected.
        try {
          console.log('[GoogleDriveBackup] Triggering fallback automated local JSON database snapshot...');
          const { backupService } = await import('./backup.service.js');
          const backupResult = await backupService.createDatabaseBackup('SYSTEM_SCHEDULER');
          const savedPath = await backupService.saveLocalBackupFile(backupResult);
          console.log(`[GoogleDriveBackup] Fallback database backup saved successfully: ${savedPath}`);
          return true;
        } catch (fallbackErr: any) {
          console.error('[GoogleDriveBackup Error] Fallback database backup also failed:', fallbackErr.message);
        }

        return false;
      }
    }

    return false;
  }

  /**
   * Start background scheduler interval (runs check on boot and every 12 hours).
   */
  public initScheduledDriveBackup(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
    }

    if (config.google.enableDriveBackup === false) {
      console.log('[GoogleDriveBackup] Automated Google Drive backup scheduler is disabled via ENABLE_GOOGLE_DRIVE_BACKUP=false.');
      return;
    }

    // Run check on startup asynchronously
    setTimeout(() => {
      this.checkAndExecuteScheduledBackup().catch((err) => {
        console.warn('[GoogleDriveBackup] Startup backup check failed:', err.message);
      });
    }, 5000);

    // Recurring check every 12 hours
    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
    this.schedulerInterval = setInterval(() => {
      this.checkAndExecuteScheduledBackup().catch((err) => {
        console.warn('[GoogleDriveBackup] Periodic backup check failed:', err.message);
      });
    }, TWELVE_HOURS_MS);

    if (this.schedulerInterval && typeof this.schedulerInterval.unref === 'function') {
      this.schedulerInterval.unref();
    }
  }

  public stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }
}

export const googleDriveBackupService = new GoogleDriveBackupService();
