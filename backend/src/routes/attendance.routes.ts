import { Router } from 'express';
import { attendanceController } from '../controllers/attendance.controller.js';
import { authenticateSession } from '../middlewares/auth.middleware.js';
import { requireStaff, requireAdmin } from '../middlewares/role.middleware.js';

const router = Router();

// All attendance endpoints require authentication
router.use(authenticateSession);

// Admin: Daily attendance marking & review
router.get('/daily', requireAdmin, (req, res) => attendanceController.getDaily(req, res));
router.post('/daily', requireAdmin, (req, res) => attendanceController.markDaily(req, res));
router.post('/mark', requireAdmin, (req, res) => attendanceController.markDaily(req, res));

// Staff / Admin: Monthly summary & history (Staff restricted to own)
router.get('/monthly', requireStaff, (req, res) => attendanceController.getMonthly(req, res));
router.get('/history', requireStaff, (req, res) => attendanceController.getHistory(req, res));

export default router;
