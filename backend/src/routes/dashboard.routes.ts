import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller.js';
import { authenticateSession } from '../middlewares/auth.middleware.js';
import { requireStaff, requireAdmin } from '../middlewares/role.middleware.js';
import { reportExportRateLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = Router();

router.use(authenticateSession);

// Staff dashboard (all authenticated users can view their own dashboard)
router.get('/staff', requireStaff, (req, res) => dashboardController.getStaff(req, res));

// Admin dashboard (manager route aliases to admin)
router.get('/manager', requireAdmin, (req, res) => dashboardController.getAdmin(req, res));

// Admin dashboard, activity logs, email logs & database doctor
router.get('/admin', requireAdmin, (req, res) => dashboardController.getAdmin(req, res));
router.get('/activity-logs', requireAdmin, (req, res) => dashboardController.getActivityLogs(req, res));
router.get('/email-logs', requireAdmin, (req, res) => dashboardController.getEmailLogs(req, res));
router.post('/email-test', requireAdmin, (req, res) => dashboardController.testEmailConnection(req, res));
router.get('/email-test', requireAdmin, (req, res) => dashboardController.testEmailConnection(req, res));
router.get('/database-doctor', requireAdmin, (req, res) => dashboardController.getDatabaseDiagnostics(req, res));
router.post('/database-doctor/repair', requireAdmin, (req, res) => dashboardController.executeDatabaseRepair(req, res));

// Admin database backup snapshot export & status
router.get('/backup/export', requireAdmin, reportExportRateLimiter, (req, res) => dashboardController.exportDatabaseBackup(req, res));
router.get('/backup/status', requireAdmin, (req, res) => dashboardController.getBackupStatus(req, res));

// Admin Google Drive semi-annual backup (Format A: Spreadsheet Clone)
router.get('/backup/drive/status', requireAdmin, (req, res) => dashboardController.getDriveBackupStatus(req, res));
router.post('/backup/drive/execute', requireAdmin, (req, res) => dashboardController.executeDriveBackup(req, res));

export default router;
