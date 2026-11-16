import crypto from 'crypto';

/**
 * Utility for cryptographically secure password hashing, verification,
 * random password generation, and token management.
 * Uses native Node.js crypto (OWASP-recommended scrypt & sha256).
 */

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate password complexity:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special symbol
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password || typeof password !== 'string') {
    return { isValid: false, errors: ['Password is required.'] };
  }

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long.');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter (A-Z).');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter (a-z).');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one digit (0-9).');
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*...).');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

const DEFAULT_DEV_PEPPER = 'tc-tracker-dev-pepper-secret-key-change-in-production-2026';

/**
 * Resolve the server-side pepper secret key.
 */
export function getPepper(overridePepper?: string): string {
  if (overridePepper) return overridePepper;
  return (
    process.env.PASSWORD_PEPPER ||
    process.env.SESSION_SECRET ||
    DEFAULT_DEV_PEPPER
  );
}

/**
 * Hash password using Node's crypto.scrypt combined with a secret server-side pepper and unique 16-byte random salt.
 * Output format: `scrypt$v=2$<saltHex>$<derivedKeyHex>`
 */
export function hashPassword(password: string, customPepper?: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const pepper = getPepper(customPepper);

  // HMAC-SHA256 combines password with secret pepper
  const pepperedBytes = crypto.createHmac('sha256', pepper).update(password).digest();

  // scrypt key derivation on the peppered digest
  const derivedKey = crypto.scryptSync(pepperedBytes, salt, 64);
  return `scrypt$v=2$${salt}$${derivedKey.toString('hex')}`;
}

/**
 * Determine if a stored hash is using an older legacy format that requires transparent re-hashing to v2.
 */
export function needsRehash(storedHash: string): boolean {
  if (!storedHash || typeof storedHash !== 'string') return true;
  return !storedHash.startsWith('scrypt$v=2$');
}

/**
 * Verify a password against a stored scrypt hash in constant time.
 * Supports:
 * - v2: Peppered HMAC-SHA256 + scrypt (`scrypt$v=2$<salt>$<key>`)
 * - v1: Legacy unpeppered scrypt (`scrypt$v=1$<salt>$<key>`)
 * - Legacy fallback format: `salt:key`
 */
export function verifyPassword(password: string, storedHash: string, customPepper?: string): boolean {
  if (!password || !storedHash) return false;

  const parts = storedHash.split('$');
  // Format: ['scrypt', 'v=1' | 'v=2', salt, key]
  if (parts.length === 4 && parts[0] === 'scrypt') {
    const version = parts[1];
    const salt = parts[2];
    const originalKey = parts[3];

    let derivedKey: Buffer;
    if (version === 'v=2') {
      const pepper = getPepper(customPepper);
      const pepperedBytes = crypto.createHmac('sha256', pepper).update(password).digest();
      derivedKey = crypto.scryptSync(pepperedBytes, salt, 64);
    } else if (version === 'v=1') {
      // Legacy unpeppered format
      derivedKey = crypto.scryptSync(password, salt, 64);
    } else {
      return false;
    }

    const originalBuffer = Buffer.from(originalKey, 'hex');
    if (originalBuffer.length !== derivedKey.length) return false;
    return crypto.timingSafeEqual(originalBuffer, derivedKey);
  }

  // Fallback for legacy format: salt:key
  if (storedHash.includes(':')) {
    const [salt, key] = storedHash.split(':');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const originalBuffer = Buffer.from(key, 'hex');
    if (originalBuffer.length !== derivedKey.length) return false;
    return crypto.timingSafeEqual(originalBuffer, derivedKey);
  }

  return false;
}

/**
 * Generate a strong, random temporary password for newly created accounts.
 * Contains uppercase, lowercase, numbers, and symbols.
 */
export function generateRandomPassword(length = 10): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // exclude confusing chars like I, O
  const lower = 'abcdefghijkmnopqrstuvwxyz'; // exclude l
  const digits = '23456789'; // exclude 0, 1
  const symbols = '!@#$%^&*';

  // Ensure at least one character from each set
  let pwd = [
    upper[crypto.randomInt(0, upper.length)],
    lower[crypto.randomInt(0, lower.length)],
    digits[crypto.randomInt(0, digits.length)],
    symbols[crypto.randomInt(0, symbols.length)],
  ];

  const all = upper + lower + digits + symbols;
  for (let i = pwd.length; i < length; i++) {
    pwd.push(all[crypto.randomInt(0, all.length)]);
  }

  // Shuffle array using Fisher-Yates
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }

  return pwd.join('');
}

/**
 * Generate a 6-digit numeric OTP code for forgot password.
 */
export function generateOtp(length = 6): string {
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += crypto.randomInt(0, 10).toString();
  }
  return otp;
}

/**
 * Generate a 32-byte cryptographic random hex token for reset links.
 */
export function generateCryptoToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Compute SHA-256 hash of a token or OTP for safe storage in Google Sheets.
 */
export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw.trim()).digest('hex');
}
