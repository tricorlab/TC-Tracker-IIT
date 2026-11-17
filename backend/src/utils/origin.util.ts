import { config } from '../config/env.config.js';

/**
 * Validates whether an incoming HTTP Origin or Referer is permitted by CORS and CSRF policies.
 * Accepts:
 *  1. Any origin explicitly listed in config.frontendUrl (supports comma/space separation & explicit wildcard patterns)
 *  2. Local development origins (localhost, 127.0.0.1 on any port)
 *
 * NOTE ON MULTI-TENANT CLOUD DOMAINS:
 * Generic wildcards for *.vercel.app or *.onrender.com are deliberately prohibited.
 * Multi-tenant platforms allow arbitrary third parties to deploy sites under these domains.
 * To permit a specific Vercel or Render deployment, add its exact URL (or specific project pattern,
 * e.g. 'https://tc-tracker*.vercel.app') to the FRONTEND_URL environment variable.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // Non-browser clients, CLI, server-to-server, unit tests
  const normalized = origin.replace(/\/+$/, '').toLowerCase();

  // 1. Configured frontend URLs (support comma/space-separated origins and explicit pattern wildcards)
  const configured = (config.frontendUrl || '')
    .split(/[\s,]+/)
    .map((o) => o.replace(/\/+$/, '').toLowerCase())
    .filter(Boolean);

  for (const entry of configured) {
    if (entry === normalized) return true;

    // Support explicit wildcard pattern if configured by admin (e.g. 'https://tc-tracker*.vercel.app')
    if (entry.includes('*')) {
      const regexPattern = '^' + entry.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
      try {
        if (new RegExp(regexPattern).test(normalized)) {
          return true;
        }
      } catch {
        // Invalid regex fallback
      }
    }
  }

  // 2. Built-in trusted project domains & project-scoped Vercel deployment patterns
  if (
    normalized === 'https://tctracker-iitm.vercel.app' ||
    normalized === 'https://tc-tracker-iitm.vercel.app' ||
    /^https:\/\/(tc-?tracker)[a-z0-9-]*\.vercel\.app$/.test(normalized)
  ) {
    return true;
  }

  // 3. Local development origins (localhost, 127.0.0.1 on any port)
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) return true;

  return false;
}
