import { Router } from 'express';
import { reportController } from '../controllers/report.controller.js';
import { authenticateSession } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/role.middleware.js';
import { reportExportRateLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = Router();

router.use(authenticateSession);

// Reports are accessible to Admin (Staff gets 403 Forbidden)
router.get('/attendance', requireAdmin, (req, res) =>
  reportController.getMonthlyAttendanceReport(req, res)
);
router.get('/attendance/csv', requireAdmin, reportExportRateLimiter, (req, res) =>
  reportController.exportAttendanceCsv(req, res)
);
router.get('/leave-balances', requireAdmin, (req, res) =>
  reportController.getLeaveBalanceReport(req, res)
);
router.get('/leave-balances/csv', requireAdmin, reportExportRateLimiter, (req, res) =>
  reportController.exportLeaveBalanceCsv(req, res)
);

export default router;
