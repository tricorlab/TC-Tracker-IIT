import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import attendanceRoutes from './attendance.routes.js';
import holidayRoutes from './holiday.routes.js';
import leaveRoutes from './leave.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import userRoutes from './user.routes.js';
import reportRoutes from './report.routes.js';
import noticeRoutes from './notice.routes.js';

const apiRouter = Router();

apiRouter.use('/health', healthRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/attendance', attendanceRoutes);
apiRouter.use('/holidays', holidayRoutes);
apiRouter.use('/leave', leaveRoutes);
apiRouter.use('/dashboard', dashboardRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/reports', reportRoutes);
apiRouter.use('/notices', noticeRoutes);

export default apiRouter;
