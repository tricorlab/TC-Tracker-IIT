import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticateSession } from '../middlewares/auth.middleware.js';
import { requireStaff, requireManager, requireAdmin } from '../middlewares/role.middleware.js';
import { authRateLimiter, accountRateLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = Router();

// Public auth endpoints (rate limited by IP and targeted account to defend against brute-force / credential stuffing)
router.post('/login', authRateLimiter, accountRateLimiter, (req, res) => authController.loginWithPassword(req, res));
router.post('/google', authRateLimiter, (req, res) => authController.loginWithGoogle(req, res));
router.post('/logout', (req, res) => authController.logout(req, res));
router.post('/forgot-password', authRateLimiter, accountRateLimiter, (req, res) => authController.forgotPassword(req, res));
router.post('/reset-password', authRateLimiter, (req, res) => authController.resetPassword(req, res));

// Protected auth profile & credentials management endpoints
router.get('/me', authenticateSession, (req, res) => authController.getCurrentUser(req, res));
router.post('/change-password', authenticateSession, (req, res) => authController.changePassword(req, res));
router.post('/admin/reset-password', authenticateSession, requireAdmin, (req, res) => authController.adminResetPassword(req, res));

// Role authorization verification endpoints (strictly disabled in production to eliminate reconnaissance attack surface)
if (process.env.NODE_ENV !== 'production') {
  router.get('/test/staff', authenticateSession, requireStaff, (req, res) => {
    res.json({ success: true, message: 'Staff-level access granted', user: req.user });
  });

  router.get('/test/manager', authenticateSession, requireManager, (req, res) => {
    res.json({ success: true, message: 'Manager-level access granted', user: req.user });
  });

  router.get('/test/admin', authenticateSession, requireAdmin, (req, res) => {
    res.json({ success: true, message: 'Admin-level access granted', user: req.user });
  });
}

export default router;
