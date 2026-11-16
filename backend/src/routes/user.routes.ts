import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { authenticateSession } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/role.middleware.js';

const router = Router();

router.use(authenticateSession);

// Only Admin can list users
router.get('/', requireAdmin, (req, res) => userController.getAllUsers(req, res));

// Only Admin can create users
router.post('/', requireAdmin, (req, res) => userController.createUser(req, res));

// Only Admin can update user details
router.put('/:id', requireAdmin, (req, res) => userController.updateUser(req, res));

export default router;
