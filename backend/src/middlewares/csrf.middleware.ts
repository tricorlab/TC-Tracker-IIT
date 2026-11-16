import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.config.js';
import { sessionService } from '../services/sessionService.js';
import { isAllowedOrigin } from '../utils/origin.util.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Validate that incoming state-changing requests originate from the trusted frontend origin.
 * Strictly prevents cross-origin unauthorized form submissions / CSRF exploits.
 */
export function validateOrigin(req: Request, res: Response, next: NextFunction): void {
  if (!STATE_CHANGING_METHODS.has(req.method.toUpperCase())) {
    return next(); // Safe idempotent methods (GET, HEAD, OPTIONS)
  }

  const rawOrigin = req.headers.origin;
  const rawReferer = req.headers.referer;

  // Resolve request origin from Origin header or Referer header
  let requestOrigin = rawOrigin;
  if (!requestOrigin && rawReferer) {
    try {
      const parsed = new URL(rawReferer);
      requestOrigin = parsed.origin;
    } catch {
      // Malformed referer
    }
  }

  // 1. If Origin/Referer is present, it MUST match a trusted frontend origin
  if (requestOrigin) {
    if (!isAllowedOrigin(requestOrigin)) {
      res.status(403).json({
        success: false,
        message: `Forbidden: Untrusted cross-origin request from '${requestOrigin}'. Expected '${config.frontendUrl}'.`,
      });
      return;
    }
    return next();
  }

  // 2. If Origin/Referer is absent on a state-changing request:
  // In production or when authenticated session cookie is present, reject
  const hasSessionCookie = Boolean(req.cookies?.[config.cookie.name]);
  if (config.isProduction || hasSessionCookie) {
    res.status(403).json({
      success: false,
      message: 'Forbidden: Missing Origin/Referer header on state-changing request.',
    });
    return;
  }

  // Development / non-browser test environment without cookie
  next();
}

const EXEMPT_CSRF_PATHS = new Set([
  '/google',
  '/api/auth/google',
  '/login',
  '/api/auth/login',
  '/forgot-password',
  '/api/auth/forgot-password',
  '/reset-password',
  '/api/auth/reset-password',
]);

/**
 * Validates the Anti-CSRF Token on authenticated state-changing requests.
 * Uses Double-Submit Cookie / Session Token validation:
 * Client must provide matching 'X-CSRF-Token' header.
 */
export function validateCsrfToken(req: Request, res: Response, next: NextFunction): void {
  if (!STATE_CHANGING_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  const rawPath = (req.originalUrl || req.baseUrl + req.path || req.path).split('?')[0];
  const normalizedPath = req.path;

  // Exempt initial login, credential resets, and logout endpoints
  if (EXEMPT_CSRF_PATHS.has(rawPath) || EXEMPT_CSRF_PATHS.has(normalizedPath)) {
    return next();
  }

  const sessionCookie = req.cookies?.[config.cookie.name];
  // If request is not authenticated via cookie, CSRF does not apply
  if (!sessionCookie) {
    return next();
  }

  const clientCsrfToken = (req.headers['x-csrf-token'] as string) || (req.headers['x-xsrf-token'] as string);
  const cookieCsrfToken = req.cookies?.[config.cookie.csrfCookieName];

  if (!clientCsrfToken) {
    res.status(403).json({
      success: false,
      message: 'Forbidden: CSRF token missing from request headers (X-CSRF-Token).',
    });
    return;
  }

  // Verify against session payload CSRF token or cookie CSRF token
  try {
    const payload = sessionService.verifySessionToken(sessionCookie);

    const matchesPayload = payload.csrfToken && payload.csrfToken === clientCsrfToken;
    const matchesCookie = cookieCsrfToken && cookieCsrfToken === clientCsrfToken;

    if (!matchesPayload && !matchesCookie) {
      res.status(403).json({
        success: false,
        message: 'Forbidden: Invalid CSRF token provided.',
      });
      return;
    }

    next();
  } catch (err: any) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired session during CSRF validation.',
    });
  }
}
