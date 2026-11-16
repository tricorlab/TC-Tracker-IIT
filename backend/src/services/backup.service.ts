import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { googleSheetsService } from './googleSheets.service.js';
import { SHEET_NAMES, SHEET_SCHEMAS, SheetName } from '../config/sheets.config.js';
import { activityLogService } from './activityLog.service.js';
import { config } from '../config/env.config.js';

export interface DatabaseBackupPayload {
  version: '1.0';
  createdAt: string;
  checksumAlgorithm: 'SHA-256';
  checksum: string;
  metadata: {
    spreadsheetIdMasked: string;
    performedBy: string;
    totalCanonicalSheets: number;
    totalRecords: number;
    sheetCounts: Record<string, number>;
  };
  schemas: Record<string, readonly string[]>;
  data: Record<string, Record<string, any>[]>;
}

export interface DatabaseBackupResult {
  filename: string;
  payload: DatabaseBackupPayload;
  jsonContent: string;
  checksum: string;
  totalRecords: number;
  sheetCounts: Record<string, number>;
  createdAt: string;
}

export interface BackupVerificationResult {
  isValid: boolean;
  error?: string;
  computedChecksum?: string;
  recordedChecksum?: string;
  totalRecords?: number;
  createdAt?: string;
}

export class BackupService {
  private mockBackupData: Record<string, Record<string, any>[]> | null = null;

  public setMockBackupData(data: Record<string, Record<string, any>[]> | null): void {
    this.mockBackupData = data;
  }

  /**
   * Mask a secret or ID for safe inclusion in backup metadata
   */
  private maskId(id?: string): string {
    if (!id || typeof id !== 'string') return 'UNCONFIGURED';
    const trimmed = id.trim();
    if (trimmed.length <= 8) return '******';
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
  }

  /**
   * Calculate SHA-256 cryptographic checksum over the canonical JSON string of data
   */
  public calculateChecksum(data: Record<string, Record<string, any>[]>): string {
    // Sort keys to ensure deterministic serialization
    const sortedData: Record<string, any> = {};
    for (const key of Object.keys(data).sort()) {
      sortedData[key] = data[key];
    }
    const serialized = JSON.stringify(sortedData);
    return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
  }

  /**
   * Create a full, point-in-time database snapshot across all 8 canonical worksheets.
   * Completely read-only and non-destructive.
   */
  public async createDatabaseBackup(performedBy: string): Promise<DatabaseBackupResult> {
    const canonicalSheets = Object.values(SHEET_NAMES) as SheetName[];
    const extractedData: Record<string, Record<string, any>[]> = {};
    const sheetCounts: Record<string, number> = {};
    let totalRecords = 0;

    for (const sheetName of canonicalSheets) {
      let records: Record<string, any>[] = [];

      if (this.mockBackupData && this.mockBackupData[sheetName]) {
        records = [...this.mockBackupData[sheetName]];
      } else if (googleSheetsService.isLiveApiEnabled()) {
        try {
          records = await googleSheetsService.getSheetRecords(sheetName);
        } catch (err: any) {
          console.warn(
            `[BackupService] Warning: Failed to fetch records from sheet '${sheetName}': ${err.message}. Treating as empty.`
          );
          records = [];
        }
      }

      // Security: Redact sensitive credential hashes & reset tokens from backup snapshot
      if (sheetName === SHEET_NAMES.USERS) {
        records = records.map((record) => {
          const sanitized = { ...record };
          delete sanitized.PasswordHash;
          delete sanitized.ResetToken;
          delete sanitized.ResetOtp;
          delete sanitized.ResetTokenExpires;
          delete sanitized.ResetOtpAttempts;
          return sanitized;
        });
      }

      extractedData[sheetName] = records;
      sheetCounts[sheetName] = records.length;
      totalRecords += records.length;
    }

    const checksum = this.calculateChecksum(extractedData);
    const nowIso = new Date().toISOString();
    const spreadsheetIdMasked = this.maskId(config.google.spreadsheetId);

    const payload: DatabaseBackupPayload = {
      version: '1.0',
      createdAt: nowIso,
      checksumAlgorithm: 'SHA-256',
      checksum,
      metadata: {
        spreadsheetIdMasked,
        performedBy,
        totalCanonicalSheets: canonicalSheets.length,
        totalRecords,
        sheetCounts,
      },
      schemas: { ...SHEET_SCHEMAS },
      data: extractedData,
    };

    const jsonContent = JSON.stringify(payload, null, 2);

    // Format safe timestamped filename: tc-tracker-backup-YYYY-MM-DD-HHmmss.json
    const safeDate = nowIso
      .replace(/:/g, '')
      .replace(/\..+/, '')
      .replace('T', '_');
    const filename = `tc-tracker-backup-${safeDate}.json`;

    // Log the backup creation in ActivityLogs for enterprise compliance audit trail
    try {
      await activityLogService.logActivity({
        performedBy,
        action: 'DATABASE_BACKUP_CREATED',
        entityType: 'Database',
        entityID: 'ALL_CANONICAL_SHEETS',
        previousValue: undefined,
        newValue: JSON.stringify({
          filename,
          totalRecords,
          checksum: `${checksum.slice(0, 8)}...`,
          sheetCounts,
        }),
        reason: 'Administrator created verified point-in-time database snapshot',
      });
    } catch (auditErr: any) {
      console.warn('[BackupService] Failed to log backup activity:', auditErr.message);
    }

    return {
      filename,
      payload,
      jsonContent,
      checksum,
      totalRecords,
      sheetCounts,
      createdAt: nowIso,
    };
  }

  /**
   * Save the backup snapshot to the local disk in backend/backups/
   */
  public async saveLocalBackupFile(
    result: DatabaseBackupResult,
    targetDir?: string
  ): Promise<string> {
    const baseDir = targetDir || path.resolve(process.cwd(), 'backups');

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const filePath = path.join(baseDir, result.filename);
    fs.writeFileSync(filePath, result.jsonContent, 'utf8');
    return filePath;
  }

  /**
   * Verify the integrity and SHA-256 cryptographic signature of a backup payload
   */
  public verifyBackupIntegrity(
    backup: string | DatabaseBackupPayload
  ): BackupVerificationResult {
    let parsed: DatabaseBackupPayload;

    if (typeof backup === 'string') {
      try {
        parsed = JSON.parse(backup);
      } catch (err: any) {
        return { isValid: false, error: `Invalid JSON syntax: ${err.message}` };
      }
    } else {
      parsed = backup;
    }

    if (!parsed || parsed.version !== '1.0' || !parsed.data || !parsed.checksum) {
      return {
        isValid: false,
        error: 'Invalid backup structure. Missing version, data, or checksum header.',
      };
    }

    const computedChecksum = this.calculateChecksum(parsed.data);
    const recordedChecksum = parsed.checksum;

    if (computedChecksum !== recordedChecksum) {
      return {
        isValid: false,
        error: `Checksum mismatch! File may have been altered or corrupted. Expected: ${recordedChecksum}, Computed: ${computedChecksum}`,
        computedChecksum,
        recordedChecksum,
      };
    }

    return {
      isValid: true,
      computedChecksum,
      recordedChecksum,
      totalRecords: parsed.metadata?.totalRecords,
      createdAt: parsed.createdAt,
    };
  }
}

export const backupService = new BackupService();
