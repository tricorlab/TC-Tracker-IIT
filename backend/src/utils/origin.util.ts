import { config } from '../config/env.config.js';

/**
 * Validates whether an incoming HTTP Origin or Referer is permitted by CORS and CSRF policies.
 * Accepts:
 *  1. Any origin explicitly listed in config.frontendUrl (supports comma/space separation)
 *  2. Local development origins (localhost, 127.0.0.1 on any port)
 *  3. Vercel deployment domains (*.vercel.app)
 *  4. Render deployment domains (*.onrender.com)
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // Non-browser clients, CLI, server-to-server, unit tests
  const normalized = origin.replace(/\/+$/, '').toLowerCase();

  // 1. Configured frontend URLs (support comma/space-separated origins)
  const configured = (config.frontendUrl || '')
    .split(/[\s,]+/)
    .map((o) => o.replace(/\/+$/, '').toLowerCase())
    .filter(Boolean);

  if (configured.includes(normalized)) return true;

  // 2. Local development origins (localhost, 127.0.0.1 on any port)
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) return true;

  // 3. Any Vercel deployment domain (*.vercel.app)
  if (/^https:\/\/[a-z0-9_.-]+\.vercel\.app$/.test(normalized)) return true;

  // 4. Any Render deployment domain (*.onrender.com)
  if (/^https:\/\/[a-z0-9_.-]+\.onrender\.com$/.test(normalized)) return true;

  return false;
}
