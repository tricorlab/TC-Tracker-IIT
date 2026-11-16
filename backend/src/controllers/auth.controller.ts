import { Request, Response } from 'express';
import { googleAuthService } from '../services/googleAuth.service.js';
import { userService, UserVerificationError } from '../services/userService.js';
import { sessionService } from '../services/sessionService.js';
import { config } from '../config/env.config.js';

export class AuthController {
  /**
   * POST /api/auth/google
   * Verifies Google ID Token, verifies employee against Google Sheets, and establishes session.
   */
  public async loginWithGoogle(req: Request, res: Response): Promise<void> {
    const { idToken } = req.body;

    if (!idToken || typeof idToken !== 'string' || idToken.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: 'Google ID token is required.',
      });
      return;
    }

    try {
      // 1. Verify Google ID Token (signature, issuer, audience, expiration, verified email)
      const verifiedGoogleUser = await googleAuthService.verifyIdToken(idToken);

      // 2. Verify active employee status & role in Google Sheets
      const userContext = await userService.verifyActiveUserByEmail(verifiedGoogleUser.email);

      // 3. Generate Anti-CSRF Token
      const csrfToken = sessionService.generateCsrfToken();

      // 4. Create signed session token with embedded CSRF claim
      const sessionToken = sessionService.createSessionToken(
        userContext.userId,
        userContext.email,
        csrfToken
      );

      // 5. Attach HTTP-only session cookie & client-readable XSRF-TOKEN cookie
      sessionService.setSessionCookie(res, sessionToken, csrfToken);

      // 6. Respond with authenticated user details and CSRF token
      res.status(200).json({
        success: true,
        message: 'Authentication successful',
        user: {
          userId: userContext.userId,
          fullName: userContext.fullName,
          email: userContext.email,
          role: userContext.role,
          mustChangePassword: userContext.mustChangePassword,
        },
        csrfToken,
      });
    } catch (error: any) {
      if (error instanceof UserVerificationError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
        return;
      }

      console.error('[Auth Error]', error.message);
      res.status(401).json({
        success: false,
        message: error.message || 'Google authentication failed',
      });
    }
  }

  /**
   * GET /api/auth/me
   * Returns current authenticated user context and dynamically resolved role.
   */
  public async getCurrentUser(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
      return;
    }

    // Extract CSRF token if session cookie present
    let csrfToken: string | undefined;
    const sessionCookie = req.cookies?.[config.cookie.name];
    if (sessionCookie) {
      try {
        const payload = sessionService.verifySessionToken(sessionCookie);
        csrfToken = payload.csrfToken;
      } catch {
        // Ignored
      }
    }

    res.status(200).json({
      success: true,
      user: {
        userId: req.user.userId,
        fullName: req.user.fullName,
        email: req.user.email,
        role: req.user.role,
        mustChangePassword: req.user.mustChangePassword,
      },
      csrfToken,
    });
  }

  /**
   * POST /api/auth/login
   * Authenticates user using Email and Password.
   * Supports temporary password and returns mustChangePassword flag.
   */
  public async loginWithPassword(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
      return;
    }

    try {
      // 1. Verify active employee status, role, and password hash
      const userContext = await userService.loginWithPassword(email, password);

      // 2. Generate Anti-CSRF Token
      const csrfToken = sessionService.generateCsrfToken();

      // 3. Create signed session token with embedded CSRF claim
      const sessionToken = sessionService.createSessionToken(
        userContext.userId,
        userContext.email,
        csrfToken
      );

      // 4. Attach HTTP-only session cookie & client-readable XSRF-TOKEN cookie
      sessionService.setSessionCookie(res, sessionToken, csrfToken);

      // 5. Respond with authenticated user details and CSRF token
      res.status(200).json({
        success: true,
        message: 'Authentication successful',
        user: {
          userId: userContext.userId,
          fullName: userContext.fullName,
          email: userContext.email,
          role: userContext.role,
          mustChangePassword: userContext.mustChangePassword,
        },
        csrfToken,
      });
    } catch (error: any) {
      if (error instanceof UserVerificationError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
        return;
      }

      console.error('[Auth Error - Password Login]', error.message);
      res.status(401).json({
        success: false,
        message: error.message || 'Invalid email or password.',
      });
    }
  }

  /**
   * POST /api/auth/change-password
   * Authenticated user changes their password (forced initial reset or self-service update).
   */
  public async changePassword(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
      return;
    }

    const { currentPassword, newPassword } = req.body;
    if (!newPassword) {
      res.status(400).json({
        success: false,
        message: 'New password is required.',
      });
      return;
    }

    try {
      await userService.changePassword(req.user.userId, currentPassword || '', newPassword);

      // Re-issue a fresh session token so the current session remains valid after password change
      const csrfToken = sessionService.generateCsrfToken();
      const sessionToken = sessionService.createSessionToken(
        req.user.userId,
        req.user.email,
        csrfToken
      );
      sessionService.setSessionCookie(res, sessionToken, csrfToken);

      res.status(200).json({
        success: true,
        message: 'Password updated successfully.',
        csrfToken,
      });
    } catch (error: any) {
      const status = error instanceof UserVerificationError ? error.statusCode : 400;
      res.status(status).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * POST /api/auth/forgot-password
   * Public request to initiate password reset via Email (Link & OTP).
   */
  public async forgotPassword(req: Request, res: Response): Promise<void> {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Valid email address is required.',
      });
      return;
    }

    try {
      const result = await userService.createPasswordResetRequest(email);
      res.status(200).json(result);
    } catch (error: any) {
      console.error('[ForgotPassword Error]', error.message);
      res.status(500).json({
        success: false,
        message: 'Unable to process password reset request at this time.',
      });
    }
  }

  /**
   * POST /api/auth/reset-password
   * Public reset completion using either Strategy A (Token from Link) or Strategy B (6-Digit OTP).
   */
  public async resetPassword(req: Request, res: Response): Promise<void> {
    const { email, token, otp, newPassword } = req.body;
    const tokenOrOtp = token || otp;

    if (!email || !tokenOrOtp || !newPassword) {
      res.status(400).json({
        success: false,
        message: 'Email, verification code/token, and new password are required.',
      });
      return;
    }

    try {
      const result = await userService.resetPasswordWithTokenOrOtp(email, tokenOrOtp, newPassword);
      res.status(200).json(result);
    } catch (error: any) {
      const status = error instanceof UserVerificationError ? error.statusCode : 400;
      res.status(status).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * POST /api/auth/admin/reset-password
   * Admin-initiated password reset fallback (Strategy C).
   */
  public async adminResetPassword(req: Request, res: Response): Promise<void> {
    if (!req.user || req.user.role !== 'Admin') {
      res.status(403).json({
        success: false,
        message: 'Only Administrators can trigger password resets.',
      });
      return;
    }

    const { targetUserId } = req.body;
    if (!targetUserId) {
      res.status(400).json({
        success: false,
        message: 'targetUserId is required.',
      });
      return;
    }

    try {
      const result = await userService.adminResetPassword(req.user, targetUserId);
      res.status(200).json(result);
    } catch (error: any) {
      const status = error instanceof UserVerificationError ? error.statusCode : 400;
      res.status(status).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * POST /api/auth/logout
   * Clears the HTTP-only session cookie and companion CSRF cookie.
   */
  public async logout(_req: Request, res: Response): Promise<void> {
    sessionService.clearSessionCookie(res);
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  }
}

export const authController = new AuthController();
