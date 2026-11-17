import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin } from '../utils/origin.util.js';
import { googleSheetsService } from '../services/googleSheets.service.js';
import { accountRateLimiter } from '../middlewares/rateLimiter.middleware.js';
import { userService } from '../services/userService.js';
import { config } from '../config/env.config.js';

describe('--- [SECURITY HARDENING SUITE] Defense Verification ---', () => {
  describe('1. CORS & Origin Validation Hardening', () => {
    it('should allow legitimate local development origins', () => {
      assert.strictEqual(isAllowedOrigin('http://localhost:5173'), true);
      assert.strictEqual(isAllowedOrigin('http://127.0.0.1:3000'), true);
    });

    it('should allow built-in project deployment domains on vercel.app', () => {
      assert.strictEqual(isAllowedOrigin('https://tctracker-iitm.vercel.app'), true);
      assert.strictEqual(isAllowedOrigin('https://tc-tracker-iitm.vercel.app'), true);
    });

    it('should reject arbitrary untrusted multi-tenant domains on vercel.app', () => {
      assert.strictEqual(isAllowedOrigin('https://attacker-project.vercel.app'), false);
      assert.strictEqual(isAllowedOrigin('https://malicious.vercel.app'), false);
    });

    it('should reject arbitrary untrusted multi-tenant domains on onrender.com', () => {
      assert.strictEqual(isAllowedOrigin('https://evil-hacker.onrender.com'), false);
      assert.strictEqual(isAllowedOrigin('https://phishing.onrender.com'), false);
    });

    it('should allow explicitly configured frontend URLs', () => {
      const original = config.frontendUrl;
      try {
        config.frontendUrl = 'https://tc-tracker-official.vercel.app, https://portal.company.com';
        assert.strictEqual(isAllowedOrigin('https://tc-tracker-official.vercel.app'), true);
        assert.strictEqual(isAllowedOrigin('https://portal.company.com'), true);
        assert.strictEqual(isAllowedOrigin('https://other.vercel.app'), false);
      } finally {
        config.frontendUrl = original;
      }
    });

    it('should support explicit admin wildcard patterns safely scoped to project', () => {
      const original = config.frontendUrl;
      try {
        config.frontendUrl = 'https://tc-tracker-*.vercel.app';
        assert.strictEqual(isAllowedOrigin('https://tc-tracker-preview-123.vercel.app'), true);
        assert.strictEqual(isAllowedOrigin('https://tc-tracker-pr-45.vercel.app'), true);
        assert.strictEqual(isAllowedOrigin('https://unrelated-app.vercel.app'), false);
      } finally {
        config.frontendUrl = original;
      }
    });
  });

  describe('2. Google Sheets Formula Injection (CWE-1236) Defense', () => {
    it('should escape leading formula characters (=, @) with a single quote', () => {
      assert.strictEqual(googleSheetsService.sanitizeCellValue('=SUM(A1:A10)'), "'=SUM(A1:A10)");
      assert.strictEqual(
        googleSheetsService.sanitizeCellValue('=HYPERLINK("http://evil.com", "Click")'),
        '\'=HYPERLINK("http://evil.com", "Click")'
      );
      assert.strictEqual(googleSheetsService.sanitizeCellValue('@IMPORTXML("http://evil.com")'), "'@IMPORTXML(\"http://evil.com\")");
    });

    it('should escape malicious + / - formula expressions while preserving pure numbers', () => {
      // Malicious expressions with non-numeric content
      assert.strictEqual(
        googleSheetsService.sanitizeCellValue("-2+3*cmd|' /C calc'!A0"),
        "'-2+3*cmd|' /C calc'!A0"
      );
      assert.strictEqual(
        googleSheetsService.sanitizeCellValue('+91 9876543210 (HR)'),
        "'+91 9876543210 (HR)"
      );

      // Safe pure numeric values should not be altered
      assert.strictEqual(googleSheetsService.sanitizeCellValue('-15.5'), '-15.5');
      assert.strictEqual(googleSheetsService.sanitizeCellValue('+10'), '+10');
      assert.strictEqual(googleSheetsService.sanitizeCellValue(42), 42);
      assert.strictEqual(googleSheetsService.sanitizeCellValue(-5), -5);
    });

    it('should leave normal safe text, booleans, and null untouched', () => {
      assert.strictEqual(googleSheetsService.sanitizeCellValue('Casual Leave for family function'), 'Casual Leave for family function');
      assert.strictEqual(googleSheetsService.sanitizeCellValue('user@example.com'), 'user@example.com');
      assert.strictEqual(googleSheetsService.sanitizeCellValue(true), true);
      assert.strictEqual(googleSheetsService.sanitizeCellValue(null), null);
    });

    it('should sanitize entire rows and matrices before transmission', () => {
      const row = ['USR-01', '=1+1', 'Normal note', '-cmd|test', 10];
      const sanitized = googleSheetsService.sanitizeRow(row);
      assert.deepStrictEqual(sanitized, ['USR-01', "'=1+1", 'Normal note', "'-cmd|test", 10]);
    });
  });

  describe('3. Targeted Account Rate Limiter Defense', () => {
    beforeEach(() => {
      accountRateLimiter.reset?.();
    });

    it('should enforce limit when multiple attempts target the same account', () => {
      const targetReq = {
        body: { email: 'victim@company.com' },
        ip: '10.0.0.1',
      } as any;

      let blocked = false;
      let lastStatus = 200;
      const res = {
        setHeader: () => {},
        status: (code: number) => {
          lastStatus = code;
          return {
            json: () => {
              blocked = code === 429;
            },
          };
        },
      } as any;

      for (let i = 0; i < 15; i++) {
        // Even if IP changes across requests (distributed bot attack), same email is targeted
        const req = {
          body: { email: 'victim@company.com' },
          ip: `192.168.1.${i + 1}`,
        } as any;
        accountRateLimiter(req, res, () => {});
      }

      assert.strictEqual(blocked, true);
      assert.strictEqual(lastStatus, 429);
    });
  });

  describe('4. Session Revocation on User Role Modification or Deactivation', () => {
    it('should immediately update PasswordChangedAt and purge reset tokens on role change', async () => {
      const adminContext = {
        userId: 'USR-ADMIN-01',
        fullName: 'Admin User',
        email: 'admin@example.com',
        role: 'Admin' as const,
        isActive: true,
        mustChangePassword: false,
      };

      const created = await userService.createUser(adminContext, {
        fullName: 'Security Test Staff',
        email: 'sec-staff@example.com',
        role: 'Staff',
        joiningDate: '2026-01-01',
        isActive: true,
      });

      const updated = await userService.updateUser(adminContext, created.UserID, {
        role: 'Admin',
      });

      assert.strictEqual(updated.Role, 'Admin');
      assert.ok(updated.PasswordChangedAt);
      assert.strictEqual(updated.ResetToken, '');
      assert.strictEqual(updated.ResetOtp, '');
    });
  });
});
