import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticateSession } from '../middlewares/auth.middleware.js';
import { requireStaff, requireManager, requireAdmin } from '../middlewares/role.middleware.js';
import { authRateLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = Router();

// Public auth endpoints (rate limited to protect from brute-force / spam)
router.post('/login', authRateLimiter, (req, res) => authController.loginWithPassword(req, res));
router.post('/google', authRateLimiter, (req, res) => authController.loginWithGoogle(req, res));
router.post('/logout', (req, res) => authController.logout(req, res));
router.post('/forgot-password', authRateLimiter, (req, res) => authController.forgotPassword(req, res));
router.post('/reset-password', authRateLimiter, (req, res) => authController.resetPassword(req, res));

// Protected auth profile & credentials management endpoints
router.get('/me', authenticateSession, (req, res) => authController.getCurrentUser(req, res));
router.post('/change-password', authenticateSession, (req, res) => authController.changePassword(req, res));
router.post('/admin/reset-password', authenticateSession, requireAdmin, (req, res) => authController.adminResetPassword(req, res));

// Role authorization verification endpoints (for testing & RBAC validation)
router.get('/test/staff', authenticateSession, requireStaff, (req, res) => {
  res.json({ success: true, message: 'Staff-level access granted', user: req.user });
});

router.get('/test/manager', authenticateSession, requireManager, (req, res) => {
  res.json({ success: true, message: 'Manager-level access granted', user: req.user });
});

router.get('/test/admin', authenticateSession, requireAdmin, (req, res) => {
  res.json({ success: true, message: 'Admin-level access granted', user: req.user });
});

export default router;
