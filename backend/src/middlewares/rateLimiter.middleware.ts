import { Request, Response, NextFunction } from 'express';

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

interface RequestRecord {
  timestamps: number[];
}

/**
 * In-Memory Sliding-Window Rate Limiter Middleware.
 *
 * NOTE ON MULTI-INSTANCE CLUSTERING:
 * This in-memory rate limiter stores request counters per Node.js process.
 * In single-instance deployments (standard Render Free/Starter tiers), it provides complete protection.
 * If scaled across multiple horizontal Render instances, limits are enforced per-instance rather than
 * centrally coordinated. External databases or Redis are intentionally excluded per project constraints.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests. Please try again later.',
    keyGenerator = (req: Request) => {
      // Prefer authenticated UserID if present; fall back to verified client IP from trusted proxy
      if (req.user?.userId) {
        return `user:${req.user.userId}`;
      }
      return `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
    },
  } = options;

  const hits = new Map<string, RequestRecord>();

  // Periodic cleanup of stale keys every 5 minutes to prevent memory leak
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      record.timestamps = record.timestamps.filter((t) => now - t < windowMs);
      if (record.timestamps.length === 0) {
        hits.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  // Unref interval so it does not block Node process termination in tests
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  const middleware = (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req);
    const now = Date.now();

    let record = hits.get(key);
    if (!record) {
      record = { timestamps: [] };
      hits.set(key, record);
    }

    // Filter out timestamps outside the active window
    record.timestamps = record.timestamps.filter((t) => now - t < windowMs);

    const currentCount = record.timestamps.length;
    const remaining = Math.max(0, maxRequests - currentCount - 1);
    const oldestTimestamp = record.timestamps[0] || now;
    const resetTimeMs = oldestTimestamp + windowMs;
    const retryAfterSec = Math.max(1, Math.ceil((resetTimeMs - now) / 1000));

    res.setHeader('RateLimit-Limit', maxRequests);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', Math.ceil(resetTimeMs / 1000));

    if (currentCount >= maxRequests) {
      res.setHeader('Retry-After', retryAfterSec);
      res.status(429).json({
        success: false,
        message: `${message} Retry after ${retryAfterSec} seconds.`,
        retryAfter: retryAfterSec,
      });
      return;
    }

    record.timestamps.push(now);
    next();
  };

  middleware.reset = () => {
    hits.clear();
  };

  return middleware;
}

/**
 * 1. Auth Rate Limiter: Max 20 requests per 15 minutes per IP.
 * Protects Google OAuth token verification from brute force / spam.
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 20,
  message: 'Too many authentication attempts.',
  keyGenerator: (req) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    return `auth:${ip}`;
  },
});

/**
 * 2. Report Export Rate Limiter: Max 30 requests per minute.
 * Protects resource-heavy CSV streaming from exhausting Google Sheets API quota.
 */
export const reportExportRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Too many report export requests.',
  keyGenerator: (req) => `report:${req.user?.userId || req.ip || 'user'}`,
});

/**
 * 3. Year Transition Rate Limiter: Max 5 executions per minute per admin.
 * Protects year transition from rapid accidental double-executions.
 */
export const yearTransitionRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,
  message: 'Too many transition execution requests.',
  keyGenerator: (req) => `transition:${req.user?.userId || 'admin'}`,
});
