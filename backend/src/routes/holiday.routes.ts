import { Router } from 'express';
import { holidayController } from '../controllers/holiday.controller.js';
import { authenticateSession } from '../middlewares/auth.middleware.js';
import { requireStaff, requireAdmin } from '../middlewares/role.middleware.js';

const router = Router();

router.use(authenticateSession);

// All authenticated staff can view the holiday calendar
router.get('/', requireStaff, (req, res) => holidayController.getHolidays(req, res));

// Admin: Add, edit, delete holidays
router.post('/', requireAdmin, (req, res) => holidayController.createHoliday(req, res));
router.put('/:id', requireAdmin, (req, res) => holidayController.updateHoliday(req, res));
router.delete('/:id', requireAdmin, (req, res) => holidayController.deleteHoliday(req, res));

export default router;
