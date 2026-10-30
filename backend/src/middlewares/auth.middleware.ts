import { Request, Response, NextFunction } from 'express';
import { googleAuthService } from '../services/googleAuth.service.js';

/**
 * Authentication middleware to verify Google ID Token.
 * Prepared for Phase 1; token verification structure is ready.
 */
export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Authentication token required',
    });
    return;
  }

  try {
    const user = await googleAuthService.verifyIdToken(token);
    req.user = user;
    next();
  } catch (error: any) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token',
      error: error?.message,
    });
  }
}
