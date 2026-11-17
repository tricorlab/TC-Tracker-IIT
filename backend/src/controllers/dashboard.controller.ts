import { Request, Response } from 'express';
import { dashboardService } from '../services/dashboard.service.js';
import { activityLogService } from '../services/activityLog.service.js';
import { emailService } from '../services/email.service.js';
import { googleSheetsService } from '../services/googleSheets.service.js';
import { backupService } from '../services/backup.service.js';
import { googleDriveBackupService } from '../services/googleDriveBackup.service.js';

export class DashboardController {
  public async getStaff(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const data = await dashboardService.getStaffDashboard(userId);
      res.json({ success: true, dashboard: data, data });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async getManager(req: Request, res: Response): Promise<void> {
    try {
      const date = req.query.date as string | undefined;
      const data = await dashboardService.getManagerDashboard(date);
      res.json({ success: true, dashboard: data, data });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async getAdmin(req: Request, res: Response): Promise<void> {
    try {
      const date = req.query.date as string | undefined;
      const data = await dashboardService.getAdminDashboard(date);
      res.json({ success: true, dashboard: data, data });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async getActivityLogs(req: Request, res: Response): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const logs = await activityLogService.getRecentLogs(limit);
      res.json({ success: true, data: logs, logs });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async getEmailLogs(req: Request, res: Response): Promise<void> {
    try {
      const logs = await emailService.getAllEmailLogs();
      res.json({ success: true, data: logs });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  /**
   * Diagnostic verification of the email connection for Admin inspection.
   */
  public async testEmailConnection(_req: Request, res: Response): Promise<void> {
    try {
      const result = await emailService.verifyConnection();
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Run read-only database diagnostics (Admin only).
   */
  public async getDatabaseDiagnostics(_req: Request, res: Response): Promise<void> {
    try {
      const report = await googleSheetsService.runDatabaseDiagnostics();
      res.json({ success: true, data: report });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Safe, non-destructive schema repair (Admin only).
   * Requires explicit { confirm: true } in request body.
   */
  public async executeDatabaseRepair(req: Request, res: Response): Promise<void> {
    try {
      const { confirm } = req.body;
      if (!confirm) {
        res.status(400).json({
          success: false,
          message: 'Explicit confirmation is required to initialize missing worksheets.',
        });
        return;
      }

      const adminId = req.user?.userId || 'ADMIN';
      const result = await googleSheetsService.repairDatabaseSchema({
        confirm: true,
        performedBy: adminId,
      });

      await activityLogService.logActivity({
        performedBy: adminId,
        action: 'DATABASE_DOCTOR_REPAIR',
        entityType: 'DatabaseSchema',
        entityID: 'GOOGLE_SHEETS',
        newValue: JSON.stringify(result),
        reason: result.message,
      });

      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  /**
   * Export full database snapshot as a structured JSON download (Admin only).
   */
  public async exportDatabaseBackup(req: Request, res: Response): Promise<void> {
    try {
      const adminId = req.user?.userId || 'ADMIN';
      const backup = await backupService.createDatabaseBackup(adminId);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);
      res.setHeader('X-Checksum-SHA256', backup.checksum);
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Checksum-SHA256');

      res.send(backup.jsonContent);
    } catch (err: any) {
      res.status(500).json({ success: false, message: `Backup failed: ${err.message}` });
    }
  }

  /**
   * Get latest database backup status and audit metrics (Admin only).
   */
  public async getBackupStatus(_req: Request, res: Response): Promise<void> {
    try {
      const logs = await activityLogService.getRecentLogs(50);
      const backupLogs = logs.filter((l) => l.Action === 'DATABASE_BACKUP_CREATED');
      const lastBackup = backupLogs.length > 0 ? backupLogs[0] : null;

      res.json({
        success: true,
        data: {
          lastBackupAt: lastBackup?.Timestamp || null,
          lastPerformedBy: lastBackup?.PerformedBy || null,
          totalBackupsRecorded: backupLogs.length,
          lastBackupDetails: lastBackup?.NewValue ? JSON.parse(lastBackup.NewValue) : null,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Get Google Drive semi-annual backup status (Admin only).
   */
  public async getDriveBackupStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = await googleDriveBackupService.getDriveBackupStatus();
      res.json({ success: true, data: status });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Manually execute Google Drive semi-annual backup (Admin only).
   */
  public async executeDriveBackup(req: Request, res: Response): Promise<void> {
    try {
      const adminId = req.user?.userId || 'ADMIN';
      const { customTitle } = req.body || {};
      const result = await googleDriveBackupService.createDriveBackup({
        customTitle,
        performedBy: adminId,
      });
      res.status(200).json({ success: true, data: result, message: result.message });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
}

export const dashboardController = new DashboardController();
