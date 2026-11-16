import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { UserService, UserVerificationError, userService } from '../services/userService.js';
import { emailService, escapeHtml } from '../services/email.service.js';
import { activityLogService } from '../services/activityLog.service.js';
import { sessionService } from '../services/sessionService.js';
import { authenticateSession } from '../middlewares/auth.middleware.js';
import { backupService } from '../services/backup.service.js';
import { SHEET_NAMES } from '../config/sheets.config.js';
import {
  generateRandomPassword,
  hashPassword,
  verifyPassword,
  needsRehash,
  validatePasswordStrength,
  hashToken,
} from '../utils/password.util.js';
import { UserRow } from '../types/database.types.js';

describe('--- [PASSWORD AUTHENTICATION & FORGOT PASSWORD TEST SUITE] ---', () => {
  let testUserService: UserService;

  const mockAdminContext = {
    userId: 'USR-ADMIN-01',
    fullName: 'System Administrator',
    email: 'admin@tctracker.local',
    role: 'Admin' as const,
    isActive: true,
  };

  const mockStaffUser: UserRow = {
    UserID: 'USR-STAFF-99',
    FullName: 'John Doe',
    Email: 'john.doe@example.com',
    Role: 'Staff',
    JoiningDate: '2026-01-01',
    IsActive: 'TRUE',
    CreatedAt: '2026-01-01T00:00:00Z',
    UpdatedAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    testUserService = new UserService();
    emailService.clearMockEmailLogs();
  });

  describe('1. Password Utility Functions', () => {
    it('should generate a strong random temporary password', () => {
      const pwd = generateRandomPassword(12);
      assert.equal(pwd.length, 12);
      const validation = validatePasswordStrength(pwd);
      assert.equal(validation.isValid, true);
    });

    it('should correctly hash and verify passwords using scrypt with server-side pepper', () => {
      const pwd = 'ValidPassword123!@#';
      const hash = hashPassword(pwd);
      assert.ok(hash.startsWith('scrypt$v=2$'));
      assert.equal(verifyPassword(pwd, hash), true);
      assert.equal(verifyPassword('WrongPassword123!', hash), false);
    });

    it('should maintain backward compatibility with legacy unpeppered scrypt$v=1$ hashes', () => {
      const pwd = 'LegacyPassword123!@#';
      // Simulate legacy v1 hash without pepper
      const salt = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
      const derivedKey = crypto.scryptSync(pwd, salt, 64).toString('hex');
      const legacyV1Hash = `scrypt$v=1$${salt}$${derivedKey}`;

      assert.equal(needsRehash(legacyV1Hash), true);
      assert.equal(verifyPassword(pwd, legacyV1Hash), true);
      assert.equal(verifyPassword('WrongPassword!', legacyV1Hash), false);
    });

    it('should fail verification if incorrect pepper is used for v2 hash', () => {
      const pwd = 'PepperProtected123!';
      const hash = hashPassword(pwd, 'correct-secret-pepper-key-32chars!');
      assert.equal(verifyPassword(pwd, hash, 'correct-secret-pepper-key-32chars!'), true);
      assert.equal(verifyPassword(pwd, hash, 'wrong-intruder-pepper-key-32chars!'), false);
    });

    it('should enforce password complexity requirements', () => {
      assert.equal(validatePasswordStrength('short').isValid, false);
      assert.equal(validatePasswordStrength('nouppercase123!').isValid, false);
      assert.equal(validatePasswordStrength('NOLOWERCASE123!').isValid, false);
      assert.equal(validatePasswordStrength('NoNumbersSpecial!').isValid, false);
      assert.equal(validatePasswordStrength('NoSpecialChar123').isValid, false);
      assert.equal(validatePasswordStrength('Compliant@Pass123').isValid, true);
    });
  });

  describe('2. Admin User Creation & Onboarding Email Dispatch', () => {
    it('should generate temporary password, hash it, set MustChangePassword=TRUE, and send onboarding email', async () => {
      let sentEmailPayload: any = null;
      emailService.setCustomDispatcher(async (opts) => {
        sentEmailPayload = opts;
      });

      const newUser: any = await testUserService.createUser(mockAdminContext, {
        fullName: 'New Staff Employee',
        email: 'newstaff@example.com',
        role: 'Staff',
        joiningDate: '2026-02-01',
      });

      assert.ok(newUser.UserID.startsWith('USR-'));
      assert.ok(newUser.PasswordHash);
      assert.equal(newUser.MustChangePassword, 'TRUE');
      assert.ok(newUser.temporaryPassword);

      // Verify email was sent
      assert.ok(sentEmailPayload);
      assert.equal(sentEmailPayload.to, 'newstaff@example.com');
      assert.ok(sentEmailPayload.subject.includes('Welcome to TC Tracker'));
      assert.ok(sentEmailPayload.text.includes(newUser.temporaryPassword));
      assert.ok(sentEmailPayload.text.includes('temporary password must be changed'));

      emailService.setCustomDispatcher(null);
    });
  });

  describe('3. Login with Password & Forced Password Change Detection', () => {
    it('should successfully authenticate with temporary password and indicate mustChangePassword=true', async () => {
      const tempPass = 'Temporary1!';
      const userWithTempPass: UserRow = {
        ...mockStaffUser,
        PasswordHash: hashPassword(tempPass),
        MustChangePassword: 'TRUE',
      };
      testUserService.setMockUser(userWithTempPass);

      const authResult = await testUserService.loginWithPassword('john.doe@example.com', tempPass);
      assert.equal(authResult.userId, 'USR-STAFF-99');
      assert.equal(authResult.mustChangePassword, true);
    });

    it('should reject invalid password', async () => {
      const userWithTempPass: UserRow = {
        ...mockStaffUser,
        PasswordHash: hashPassword('CorrectPass1!'),
      };
      testUserService.setMockUser(userWithTempPass);

      await assert.rejects(
        () => testUserService.loginWithPassword('john.doe@example.com', 'WrongPass1!'),
        /Invalid email or password/
      );
    });

    it('should change password, enforce strength, clear MustChangePassword flag', async () => {
      const tempPass = 'Temporary1!';
      const userWithTempPass: UserRow = {
        ...mockStaffUser,
        PasswordHash: hashPassword(tempPass),
        MustChangePassword: 'TRUE',
      };
      testUserService.setMockUser(userWithTempPass);

      // Successfully update password
      const newPass = 'SecureNewPassword123!@#';
      await testUserService.changePassword('USR-STAFF-99', tempPass, newPass);

      // Re-verify login with new password
      const reAuth = await testUserService.loginWithPassword('john.doe@example.com', newPass);
      assert.equal(reAuth.mustChangePassword, false);

      // Old password should now fail
      await assert.rejects(
        () => testUserService.loginWithPassword('john.doe@example.com', tempPass),
        /Invalid email or password/
      );
    });
  });

  describe('4. Forgot Password — Both Strategy A (Token Link) & Strategy B (6-Digit OTP)', () => {
    it('should dispatch email containing BOTH one-click link and 6-digit OTP code', async () => {
      let emailSent: any = null;
      emailService.setCustomDispatcher(async (opts) => {
        emailSent = opts;
      });

      testUserService.setMockUser(mockStaffUser);

      const resetReq = await testUserService.createPasswordResetRequest('john.doe@example.com');
      assert.equal(resetReq.success, true);
      assert.ok(emailSent);
      assert.equal(emailSent.to, 'john.doe@example.com');
      assert.ok(emailSent.text.includes('METHOD 1: ONE-CLICK RESET LINK'));
      assert.ok(emailSent.text.includes('METHOD 2: 6-DIGIT VERIFICATION CODE'));

      // Check debug values
      assert.ok(resetReq.debugToken);
      assert.ok(resetReq.debugOtp);
      assert.equal(resetReq.debugOtp.length, 6);

      emailService.setCustomDispatcher(null);
    });

    it('Strategy A: should successfully reset password using 32-byte cryptographic token', async () => {
      testUserService.setMockUser(mockStaffUser);
      const req = await testUserService.createPasswordResetRequest('john.doe@example.com');

      const token = req.debugToken!;
      const newSecret = 'ResetTokenPass123!#';

      const result = await testUserService.resetPasswordWithTokenOrOtp(
        'john.doe@example.com',
        token,
        newSecret
      );
      assert.equal(result.success, true);

      // Should now be able to log in with new password
      const login = await testUserService.loginWithPassword('john.doe@example.com', newSecret);
      assert.equal(login.userId, 'USR-STAFF-99');
      assert.equal(login.mustChangePassword, false);
    });

    it('Strategy B: should successfully reset password using 6-digit OTP code', async () => {
      testUserService.setMockUser(mockStaffUser);
      const req = await testUserService.createPasswordResetRequest('john.doe@example.com');

      const otp = req.debugOtp!;
      const newSecret = 'ResetOtpPass123!#';

      const result = await testUserService.resetPasswordWithTokenOrOtp(
        'john.doe@example.com',
        otp,
        newSecret
      );
      assert.equal(result.success, true);

      // Should now be able to log in with new password
      const login = await testUserService.loginWithPassword('john.doe@example.com', newSecret);
      assert.equal(login.userId, 'USR-STAFF-99');
    });

    it('should reject invalid or expired reset tokens', async () => {
      testUserService.setMockUser({
        ...mockStaffUser,
        ResetToken: hashToken('valid-token'),
        ResetTokenExpires: new Date(Date.now() - 1000).toISOString(), // expired
      });

      await assert.rejects(
        () => testUserService.resetPasswordWithTokenOrOtp('john.doe@example.com', 'valid-token', 'NewPass123!'),
        /expired/
      );

      await assert.rejects(
        () => testUserService.resetPasswordWithTokenOrOtp('john.doe@example.com', 'wrong-token', 'NewPass123!'),
        /expired|Invalid/
      );
    });
  });

  describe('5. Strategy C: Administrative Reset Fallback', () => {
    it('should allow Admin to reset password for a staff member and trigger email', async () => {
      testUserService.setMockUser(mockStaffUser);

      let sentEmail: any = null;
      emailService.setCustomDispatcher(async (opts) => {
        sentEmail = opts;
      });

      const res = await testUserService.adminResetPassword(mockAdminContext, 'USR-STAFF-99');
      assert.equal(res.success, true);
      assert.ok(res.temporaryPassword);
      assert.ok(sentEmail);
      assert.equal(sentEmail.to, 'john.doe@example.com');
      assert.ok(sentEmail.text.includes(res.temporaryPassword));

      emailService.setCustomDispatcher(null);
    });

    it('should reject non-admin from triggering admin reset', async () => {
      const nonAdmin = { ...mockAdminContext, role: 'Staff' as const };
      await assert.rejects(
        () => testUserService.adminResetPassword(nonAdmin, 'USR-STAFF-99'),
        /Only Administrators can reset staff passwords/
      );
    });
  });

  describe('6. Security Hardening & Vulnerability Remediation Suite', () => {
    it('Finding 4: should track failed OTP verification attempts and lock out after 5 failures', async () => {
      testUserService.setMockUser(mockStaffUser);
      const req = await testUserService.createPasswordResetRequest('john.doe@example.com');
      assert.ok(req.debugOtp);

      // 4 failed attempts should report remaining attempts
      for (let attempt = 1; attempt <= 4; attempt++) {
        await assert.rejects(
          () => testUserService.resetPasswordWithTokenOrOtp('john.doe@example.com', '999999', 'NewSecret123!@#'),
          new RegExp(`${5 - attempt} attempt`)
        );
      }

      // 5th failed attempt should lock out and invalidate reset request
      await assert.rejects(
        () => testUserService.resetPasswordWithTokenOrOtp('john.doe@example.com', '999999', 'NewSecret123!@#'),
        /Too many failed verification attempts/
      );

      // Subsequent attempt even with the correct OTP should now be rejected as expired/invalidated
      await assert.rejects(
        () => testUserService.resetPasswordWithTokenOrOtp('john.doe@example.com', req.debugOtp!, 'NewSecret123!@#'),
        /No active password reset request found/
      );
    });

    it('Finding 9: should prevent user enumeration when account has no password set', async () => {
      const userWithoutPassword: UserRow = {
        ...mockStaffUser,
        PasswordHash: '',
      };
      testUserService.setMockUser(userWithoutPassword);

      await assert.rejects(
        () => testUserService.loginWithPassword('john.doe@example.com', 'AnyPassword123!'),
        (err: any) => {
          assert.equal(err.statusCode, 401);
          assert.equal(err.message, 'Invalid email or password.');
          return true;
        }
      );
    });

    it('Finding 2: should redact password hashes and reset tokens from ActivityLogs', async () => {
      activityLogService.clearMockLogs();

      const newUser: any = await testUserService.createUser(mockAdminContext, {
        fullName: 'Sanitized Employee',
        email: 'sanitized@example.com',
        role: 'Staff',
        joiningDate: '2026-02-01',
      });

      const logs = activityLogService.getMockLogs();
      const creationLog = logs.find((l) => l.Action === 'USER_CREATED' && l.EntityID === newUser.UserID);
      assert.ok(creationLog);
      assert.ok(!creationLog.NewValue.includes('PasswordHash'));
      assert.ok(!creationLog.NewValue.includes('scrypt$'));
      assert.ok(!creationLog.NewValue.includes('ResetToken'));
    });

    it('Finding 3: should redact password hashes and reset tokens from Database Backup exports', async () => {
      backupService.setMockBackupData({
        [SHEET_NAMES.USERS]: [
          {
            UserID: 'USR-SEC-01',
            FullName: 'Secured User',
            Email: 'sec@example.com',
            Role: 'Staff',
            PasswordHash: 'scrypt$v=1$sensitive-hash-value',
            ResetToken: 'sensitive-reset-token-value',
            ResetOtp: '123456',
            ResetTokenExpires: '2026-11-15T00:00:00Z',
          },
        ],
        [SHEET_NAMES.ATTENDANCE]: [],
        [SHEET_NAMES.LEAVE_REQUESTS]: [],
        [SHEET_NAMES.HOLIDAYS]: [],
        [SHEET_NAMES.LEAVE_BALANCES]: [],
        [SHEET_NAMES.LEAVE_POLICY]: [],
        [SHEET_NAMES.ACTIVITY_LOGS]: [],
        [SHEET_NAMES.EMAIL_LOGS]: [],
      });

      const backup = await backupService.createDatabaseBackup('ADMIN-TEST-USER');
      const userRecords = backup.payload.data[SHEET_NAMES.USERS];
      assert.equal(userRecords.length, 1);
      assert.equal(userRecords[0].UserID, 'USR-SEC-01');
      assert.equal(userRecords[0].PasswordHash, undefined);
      assert.equal(userRecords[0].ResetToken, undefined);
      assert.equal(userRecords[0].ResetOtp, undefined);
      assert.equal(userRecords[0].ResetTokenExpires, undefined);
      assert.ok(!backup.jsonContent.includes('sensitive-hash-value'));
    });

    it('Finding 1: should enforce mustChangePassword server-side and block portal resources', async () => {
      const userMustChange: UserRow = {
        ...mockStaffUser,
        UserID: 'USR-MUST-CHANGE-1',
        MustChangePassword: 'TRUE',
      };
      userService.setMockUser(userMustChange);

      const token = sessionService.createSessionToken('USR-MUST-CHANGE-1', 'john.doe@example.com');

      // Request to protected portal route (e.g., /api/attendance/my) should be blocked with 403
      const reqBlocked: any = {
        cookies: { tc_session: token },
        originalUrl: '/api/attendance/my',
        path: '/my',
      };
      let blockedStatus = 0;
      let blockedBody: any = null;
      const resBlocked: any = {
        status: (s: number) => {
          blockedStatus = s;
          return {
            json: (b: any) => {
              blockedBody = b;
            },
          };
        },
      };

      await authenticateSession(reqBlocked, resBlocked, () => {
        assert.fail('Should not call next() for user requiring password change on protected routes');
      });

      assert.equal(blockedStatus, 403);
      assert.equal(blockedBody.code, 'PASSWORD_CHANGE_REQUIRED');
      assert.equal(blockedBody.mustChangePassword, true);

      // Allowed route (e.g., /api/auth/change-password) should succeed
      const reqAllowed: any = {
        cookies: { tc_session: token },
        originalUrl: '/api/auth/change-password',
        path: '/change-password',
      };
      let nextCalled = false;
      await authenticateSession(reqAllowed, {} as any, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);
    });

    it('Finding 8: should revoke stale sessions issued prior to password change', async () => {
      // Simulate password changed 100 seconds in the future relative to token iat
      const now = new Date();
      const userWithUpdatedPassword: UserRow = {
        ...mockStaffUser,
        UserID: 'USR-PW-REVOKED-1',
        PasswordChangedAt: new Date(now.getTime() + 10000).toISOString(),
      };
      userService.setMockUser(userWithUpdatedPassword);

      // Token created with current timestamp (prior to PasswordChangedAt)
      const staleToken = sessionService.createSessionToken('USR-PW-REVOKED-1', 'john.doe@example.com');

      const req: any = {
        cookies: { tc_session: staleToken },
        originalUrl: '/api/attendance/my',
        path: '/my',
      };
      let status = 0;
      let body: any = null;
      const res: any = {
        status: (s: number) => {
          status = s;
          return {
            json: (b: any) => {
              body = b;
            },
          };
        },
      };

      await authenticateSession(req, res, () => {
        assert.fail('Should not allow stale token issued before password change');
      });

      assert.equal(status, 401);
      assert.equal(body.code, 'SESSION_REVOKED');
      assert.ok(body.message.includes('Password was recently changed'));
    });

    it('Finding 6: should properly escape HTML in email templates', () => {
      const malicious = '<script>alert("XSS")</script>&<img src=x onerror=alert(1)>';
      const escaped = escapeHtml(malicious);
      assert.ok(!escaped.includes('<script>'));
      assert.ok(!escaped.includes('<img'));
      assert.ok(escaped.includes('&lt;script&gt;'));
      assert.ok(escaped.includes('&amp;'));
      assert.ok(escaped.includes('&quot;'));
    });
  });
});
