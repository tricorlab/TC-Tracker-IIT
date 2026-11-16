import { Router } from 'express';
import { leaveController } from '../controllers/leave.controller.js';
import { authenticateSession } from '../middlewares/auth.middleware.js';
import { requireStaff, requireAdmin } from '../middlewares/role.middleware.js';
import { yearTransitionRateLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = Router();

router.use(authenticateSession);

// Preview calculation (Staff / Admin)
router.get('/calculate', requireStaff, (req, res) => leaveController.previewCalculation(req, res));

// Submit request (Staff / Admin)
router.post('/submit', requireStaff, (req, res) => leaveController.submitRequest(req, res));
router.post('/requests', requireStaff, (req, res) => leaveController.submitRequest(req, res));

// View own requests
router.get('/my-requests', requireStaff, (req, res) => leaveController.getMyRequests(req, res));
router.get('/requests/my', requireStaff, (req, res) => leaveController.getMyRequests(req, res));

// Withdraw / Cancel leave request (Staff own, Admin any)
router.post('/requests/:id/cancel', requireStaff, (req, res) => leaveController.cancelRequest(req, res));
router.post('/requests/:id/withdraw', requireStaff, (req, res) => leaveController.cancelRequest(req, res));

// View all requests (Admin)
router.get('/all-requests', requireAdmin, (req, res) => leaveController.getAllRequests(req, res));
router.get('/requests', requireAdmin, (req, res) => leaveController.getAllRequests(req, res));

// View balance (Staff own, Admin any)
router.get('/balance', requireStaff, (req, res) => leaveController.getBalance(req, res));

// View policy (All authenticated)
router.get('/policy', requireStaff, (req, res) => leaveController.getPolicy(req, res));

// Admin only: view all balances, adjust balance, update policy
router.get('/all-balances', requireAdmin, (req, res) => leaveController.getAllBalances(req, res));
router.get('/balances', requireAdmin, (req, res) => leaveController.getAllBalances(req, res));
router.post('/adjust-balance', requireAdmin, (req, res) => leaveController.adjustBalance(req, res));
router.post('/balances/adjust', requireAdmin, (req, res) => leaveController.adjustBalance(req, res));
router.put('/policy', requireAdmin, (req, res) => leaveController.updatePolicy(req, res));

// Admin only: allocate special leave based on critical section
router.post('/special-allocation', requireAdmin, (req, res) => leaveController.allocateSpecialLeave(req, res));
router.post('/allocate-special', requireAdmin, (req, res) => leaveController.allocateSpecialLeave(req, res));

// Admin only: year-end carry forward transition preview & execute
router.get('/year-transition/preview', requireAdmin, (req, res) => leaveController.previewYearTransition(req, res));
router.post('/year-transition/execute', requireAdmin, yearTransitionRateLimiter, (req, res) => leaveController.executeYearTransition(req, res));

export default router;
