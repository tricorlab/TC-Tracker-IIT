import { Request, Response, NextFunction } from 'express';
import { sessionService } from '../services/sessionService.js';
import { userService, UserVerificationError } from '../services/userService.js';
import { config } from '../config/env.config.js';

/**
 * Authentication middleware to verify session cookie and resolve current user.
 * Guarantees that user status and role are resolved dynamically from Google Sheets.
 */
export async function authenticateSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // 1. Extract session token from cookie (preferred) or Authorization header
  let token: string | undefined = req.cookies?.[config.cookie.name];

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Authentication required. No active session found.',
    });
    return;
  }

  try {
    // 2. Verify token signature & expiry
    const payload = sessionService.verifySessionToken(token);

    // 3. Resolve user identity and CURRENT role from Google Sheets source of truth
    const userContext = await userService.verifyActiveUserById(payload.userId);

    // 4. Invalidate sessions issued prior to recent password change / reset
    if (payload.iat && userContext.passwordChangedAt) {
      const changedTimestamp = Math.floor(new Date(userContext.passwordChangedAt).getTime() / 1000);
      if (payload.iat < changedTimestamp) {
        res.status(401).json({
          success: false,
          code: 'SESSION_REVOKED',
          message: 'Password was recently changed. Please sign in again with your new password.',
        });
        return;
      }
    }

    // 5. Enforce mustChangePassword server-side: temporary passwords cannot access portal resources
    if (userContext.mustChangePassword) {
      const rawPath = (req.originalUrl || req.baseUrl + req.path || req.path).split('?')[0];
      const isAllowed =
        rawPath === '/api/auth/change-password' ||
        rawPath === '/api/auth/logout' ||
        rawPath === '/api/auth/me' ||
        rawPath === '/change-password' ||
        rawPath === '/logout' ||
        rawPath === '/me';

      if (!isAllowed) {
        res.status(403).json({
          success: false,
          code: 'PASSWORD_CHANGE_REQUIRED',
          mustChangePassword: true,
          message: 'You must change your temporary password before accessing TC Tracker resources.',
        });
        return;
      }
    }

    // 6. Attach verified user context to request
    req.user = userContext;
    next();
  } catch (error: any) {
    if (error instanceof UserVerificationError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(401).json({
      success: false,
      message: error.message || 'Invalid or expired session. Please sign in again.',
    });
  }
}
