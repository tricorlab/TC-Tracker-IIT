import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Response, CookieOptions } from 'express';
import { config } from '../config/env.config.js';

export interface SessionPayload {
  userId: string;
  email: string;
  csrfToken?: string;
  iat?: number;
  exp?: number;
}

export class SessionService {
  private secret: string;

  constructor(secret?: string) {
    this.secret = secret || config.sessionSecret;
  }

  /**
   * Generate a cryptographically random anti-CSRF token.
   */
  public generateCsrfToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Common cookie options for session & CSRF cookies.
   */
  private getBaseCookieOptions(): CookieOptions {
    const opts: CookieOptions = {
      secure: config.cookie.secure,
      sameSite: config.cookie.sameSite,
      path: '/',
    };
    if (config.cookie.domain) {
      opts.domain = config.cookie.domain;
    }
    return opts;
  }

  /**
   * Create a signed session token.
   */
  public createSessionToken(userId: string, email: string, csrfToken?: string): string {
    const payload: SessionPayload = {
      userId: userId.trim(),
      email: email.trim().toLowerCase(),
      csrfToken: csrfToken || this.generateCsrfToken(),
    };

    return jwt.sign(payload, this.secret, {
      expiresIn: '7d',
      algorithm: 'HS256',
    });
  }

  /**
   * Verify and decode a session token.
   * Throws error if token is invalid or expired.
   */
  public verifySessionToken(token: string): SessionPayload {
    if (!token || typeof token !== 'string') {
      throw new Error('Session token missing or empty.');
    }

    try {
      const decoded = jwt.verify(token, this.secret, {
        algorithms: ['HS256'],
      }) as SessionPayload;

      if (!decoded || !decoded.userId || !decoded.email) {
        throw new Error('Malformed session token payload.');
      }

      return decoded;
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        throw new Error('Session has expired. Please sign in again.');
      }
      throw new Error(`Invalid session token: ${err.message}`);
    }
  }

  /**
   * Attach HTTP-only session cookie and companion XSRF-TOKEN cookie to Express response.
   */
  public setSessionCookie(res: Response, token: string, csrfToken?: string): void {
    const baseOpts = this.getBaseCookieOptions();

    // 1. HTTP-only session authentication cookie
    res.cookie(config.cookie.name, token, {
      ...baseOpts,
      httpOnly: true,
      maxAge: config.cookie.maxAgeMs,
    });

    // 2. Client-readable Anti-CSRF cookie (SameSite & Secure protected)
    if (csrfToken) {
      res.cookie(config.cookie.csrfCookieName, csrfToken, {
        ...baseOpts,
        httpOnly: false, // Must be readable by client JS to send in X-CSRF-Token header
        maxAge: config.cookie.maxAgeMs,
      });
    }
  }

  /**
   * Clear session cookie and CSRF cookie from response on logout using matching attributes.
   */
  public clearSessionCookie(res: Response): void {
    const baseOpts = this.getBaseCookieOptions();

    res.clearCookie(config.cookie.name, {
      ...baseOpts,
      httpOnly: true,
    });

    res.clearCookie(config.cookie.csrfCookieName, {
      ...baseOpts,
      httpOnly: false,
    });
  }
}

export const sessionService = new SessionService();
