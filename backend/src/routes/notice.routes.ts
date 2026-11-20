import { Router } from 'express';
import { noticeController } from '../controllers/notice.controller.js';
import { authenticateSession } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/role.middleware.js';

const router = Router();

router.use(authenticateSession);

// Authenticated users (Staff and Admin) can view notices
router.get('/', (req, res) => noticeController.getNotices(req, res));
router.get('/:id', (req, res) => noticeController.getNoticeById(req, res));

// Admin-only endpoints for publishing, editing, deleting, and re-emailing notices
router.post('/', requireAdmin, (req, res) => noticeController.createNotice(req, res));
router.put('/:id', requireAdmin, (req, res) => noticeController.updateNotice(req, res));
router.delete('/:id', requireAdmin, (req, res) => noticeController.deleteNotice(req, res));
router.post('/:id/resend', requireAdmin, (req, res) => noticeController.resendNoticeEmail(req, res));

export default router;
