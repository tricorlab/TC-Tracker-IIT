import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Health check endpoint.
 * GET /api/health
 */
router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'TC Tracker API is running',
  });
});

export default router;
