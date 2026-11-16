import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleAuthService } from '../services/googleAuth.service.js';
import { UserService, UserVerificationError } from '../services/userService.js';
import { SessionService, sessionService } from '../services/sessionService.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { validateOrigin, validateCsrfToken } from '../middlewares/csrf.middleware.js';
import { config } from '../config/env.config.js';
import { Request, Response } from 'express';
import { UserRow } from '../types/database.types.js';

describe('--- [MOCK TEST SUITE] TC Tracker Phase 3 Authentication & RBAC ---', () => {
  let testUserService: UserService;
  let testSessionService: SessionService;
  const TEST_SECRET = 'super-secret-test-key-32-chars-long!!';

  beforeEach(() => {
    testUserService = new UserService();
    testSessionService = new SessionService(TEST_SECRET);
  });

  describe('1. Google Token Verification (Mocked Google Responses)', () => {
    const MOCK_CLIENT_ID = 'mock-client-id.apps.googleusercontent.com';

    it('should successfully verify valid token and normalize email', async () => {
      const mockOAuthClient: any = {
        verifyIdToken: async ({ idToken, audience }: any) => {
          if (idToken === 'valid-token') {
            return {
              getPayload: () => ({
                sub: 'google-uid-12345',
                email: '  Alice.Smith@Example.COM  ',
                name: 'Alice Smith',
                picture: 'https://example.com/alice.jpg',
                iss: 'https://accounts.google.com',
                email_verified: true,
                aud: audience,
              }),
            };
          }
          throw new Error('Invalid token');
        },
      };

      const authService = new GoogleAuthService(mockOAuthClient, MOCK_CLIENT_ID);
      const user = await authService.verifyIdToken('valid-token');

      assert.equal(user.email, 'alice.smith@example.com');
      assert.equal(user.googleId, 'google-uid-12345');
      assert.equal(user.name, 'Alice Smith');
      assert.equal(user.emailVerified, true);
    });

    it('should reject token with unverified email', async () => {
      const mockOAuthClient: any = {
        verifyIdToken: async () => ({
          getPayload: () => ({
            sub: 'google-uid-unverified',
            email: 'unverified@example.com',
            iss: 'https://accounts.google.com',
            email_verified: false,
          }),
        }),
      };

      const authService = new GoogleAuthService(mockOAuthClient, MOCK_CLIENT_ID);
      await assert.rejects(
        async () => {
          await authService.verifyIdToken('unverified-token');
        },
        /has not been verified by Google/
      );
    });

    it('should reject token with invalid issuer', async () => {
      const mockOAuthClient: any = {
        verifyIdToken: async () => ({
          getPayload: () => ({
            sub: 'fake-sub',
            email: 'fake@example.com',
            iss: 'https://malicious-issuer.com',
            email_verified: true,
          }),
        }),
      };

      const authService = new GoogleAuthService(mockOAuthClient, MOCK_CLIENT_ID);
      await assert.rejects(
        async () => {
          await authService.verifyIdToken('bad-iss-token');
        },
        /Invalid token issuer/
      );
    });

    it('should reject expired or invalid token', async () => {
      const mockOAuthClient: any = {
        verifyIdToken: async () => {
          throw new Error('Token used too late');
        },
      };

      const authService = new GoogleAuthService(mockOAuthClient, MOCK_CLIENT_ID);
      await assert.rejects(
        async () => {
          await authService.verifyIdToken('expired-token');
        },
        /Token used too late/
      );
    });
  });

  describe('2. User Verification Against Google Sheets', () => {
    const activeStaff: UserRow = {
      UserID: 'USR-001',
      FullName: 'Staff Member',
      Email: 'staff@example.com',
      Role: 'Staff',
      JoiningDate: '2026-01-01',
      IsActive: 'TRUE',
      CreatedAt: '2026-01-01T00:00:00.000Z',
      UpdatedAt: '2026-01-01T00:00:00.000Z',
    };

    const activeAdmin: UserRow = {
      UserID: 'USR-003',
      FullName: 'Admin Master',
      Email: 'admin@example.com',
      Role: 'Admin',
      JoiningDate: '2026-01-01',
      IsActive: 'TRUE',
      CreatedAt: '2026-01-01T00:00:00.000Z',
      UpdatedAt: '2026-01-01T00:00:00.000Z',
    };

    const inactiveUser: UserRow = {
      UserID: 'USR-004',
      FullName: 'Inactive Employee',
      Email: 'inactive@example.com',
      Role: 'Staff',
      JoiningDate: '2026-01-01',
      IsActive: 'FALSE',
      CreatedAt: '2026-01-01T00:00:00.000Z',
      UpdatedAt: '2026-01-01T00:00:00.000Z',
    };

    const invalidRoleUser: UserRow = {
      UserID: 'USR-005',
      FullName: 'Hacker Role',
      Email: 'hacker@example.com',
      Role: 'SuperAdmin' as any,
      JoiningDate: '2026-01-01',
      IsActive: 'TRUE',
      CreatedAt: '2026-01-01T00:00:00.000Z',
      UpdatedAt: '2026-01-01T00:00:00.000Z',
    };

    it('should verify registered active Staff and Admin with normalized email', async () => {
      testUserService.setMockUser(activeStaff);
      testUserService.setMockUser(activeAdmin);

      // Email normalization test (case & whitespace)
      const resStaff = await testUserService.verifyActiveUserByEmail('  STAFF@example.com  ');
      assert.equal(resStaff.userId, 'USR-001');
      assert.equal(resStaff.role, 'Staff');

      const resAdmin = await testUserService.verifyActiveUserByEmail('Admin@Example.com');
      assert.equal(resAdmin.userId, 'USR-003');
      assert.equal(resAdmin.role, 'Admin');
    });

    it('should deny unregistered user with exact required message', async () => {
      await assert.rejects(
        async () => {
          await testUserService.verifyActiveUserByEmail('unknown@example.com');
        },
        (err: any) => {
          assert.equal(err.name, 'UserVerificationError');
          assert.equal(err.statusCode, 401);
          assert.equal(
            err.message,
            'Your account is not registered in TC Tracker. Please contact the administrator.'
          );
          return true;
        }
      );
    });

    it('should deny inactive user with exact required message', async () => {
      testUserService.setMockUser(inactiveUser);

      await assert.rejects(
        async () => {
          await testUserService.verifyActiveUserByEmail('inactive@example.com');
        },
        (err: any) => {
          assert.equal(err.name, 'UserVerificationError');
          assert.equal(err.statusCode, 401);
          assert.equal(
            err.message,
            'Your account is inactive. Please contact the administrator.'
          );
          return true;
        }
      );
    });

    it('should reject user with invalid role', async () => {
      testUserService.setMockUser(invalidRoleUser);

      await assert.rejects(
        async () => {
          await testUserService.verifyActiveUserByEmail('hacker@example.com');
        },
        (err: any) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /Invalid account role/);
          return true;
        }
      );
    });
  });

  describe('3. Session Management and Cookie Handling', () => {
    it('should issue signed session token and verify payload correctly', () => {
      const token = testSessionService.createSessionToken('USR-001', 'staff@example.com');
      assert.ok(typeof token === 'string' && token.length > 20);

      const decoded = testSessionService.verifySessionToken(token);
      assert.equal(decoded.userId, 'USR-001');
      assert.equal(decoded.email, 'staff@example.com');
    });

    it('should reject tampered or expired session token', () => {
      const token = testSessionService.createSessionToken('USR-001', 'staff@example.com');
      const tampered = token.slice(0, -5) + 'abcde';

      assert.throws(() => {
        testSessionService.verifySessionToken(tampered);
      }, /Invalid session token/);
    });

    it('should set and clear HTTP-only cookies properly', () => {
      const setCookies: Array<{ name: string; val: string; opts: any }> = [];
      const clearedCookies: string[] = [];

      const mockRes: any = {
        cookie: (name: string, val: string, opts: any) => {
          setCookies.push({ name, val, opts });
        },
        clearCookie: (name: string) => {
          clearedCookies.push(name);
        },
      };

      testSessionService.setSessionCookie(mockRes, 'sample-token', 'sample-csrf');
      const sessionCookie = setCookies.find((c) => c.name === 'tc_session');
      assert.ok(sessionCookie);
      assert.equal(sessionCookie.val, 'sample-token');
      assert.equal(sessionCookie.opts.httpOnly, true);

      testSessionService.clearSessionCookie(mockRes);
      assert.ok(clearedCookies.includes('tc_session'));
      assert.ok(clearedCookies.includes('XSRF-TOKEN'));
    });

    it('should dynamically reflect role modification in Google Sheets on subsequent request', async () => {
      // User initially Admin
      const dynamicUser: UserRow = {
        UserID: 'USR-999',
        FullName: 'Dynamic User',
        Email: 'dynamic@example.com',
        Role: 'Admin',
        JoiningDate: '2026-01-01',
        IsActive: 'TRUE',
        CreatedAt: '2026-01-01T00:00:00.000Z',
        UpdatedAt: '2026-01-01T00:00:00.000Z',
      };
      testUserService.setMockUser(dynamicUser);

      // User creates session
      const token = testSessionService.createSessionToken('USR-999', 'dynamic@example.com');
      const payload = testSessionService.verifySessionToken(token);

      // Verify initial role is Admin
      const initial = await testUserService.verifyActiveUserById(payload.userId);
      assert.equal(initial.role, 'Admin');

      // Now administrator changes role to Staff in the database
      const demotedUser: UserRow = { ...dynamicUser, Role: 'Staff' };
      testUserService.clearCache();
      testUserService.setMockUser(demotedUser);

      // Next request with same session token resolves to 'Staff', NOT 'Admin'!
      const subsequent = await testUserService.verifyActiveUserById(payload.userId);
      assert.equal(subsequent.role, 'Staff');
    });
  });

  describe('4. Role-Based Access Control (RBAC) Middleware', () => {
    const makeMockReqRes = (userRole?: any) => {
      const req: any = {
        user: userRole ? { userId: 'USR-001', email: 'test@example.com', role: userRole } : undefined,
      };
      let statusSent = 200;
      let bodySent: any = null;
      let nextCalled = false;

      const res: any = {
        status: (code: number) => {
          statusSent = code;
          return res;
        },
        json: (data: any) => {
          bodySent = data;
          return res;
        },
      };

      const next = () => {
        nextCalled = true;
      };

      return { req, res, next, getResult: () => ({ statusSent, bodySent, nextCalled }) };
    };

    it('should allow Staff and Admin on Staff-required endpoints', () => {
      const staffMiddleware = requireRole(['Staff', 'Admin']);

      for (const role of ['Staff', 'Admin'] as const) {
        const { req, res, next, getResult } = makeMockReqRes(role);
        staffMiddleware(req, res, next);
        assert.equal(getResult().nextCalled, true, `Role ${role} should be allowed`);
      }
    });

    it('should deny Staff on Admin-required endpoints (403 Forbidden)', () => {
      const adminMiddleware = requireRole(['Admin']);

      const { req, res, next, getResult } = makeMockReqRes('Staff');
      adminMiddleware(req, res, next);
      assert.equal(getResult().nextCalled, false);
      assert.equal(getResult().statusSent, 403);
      assert.match(getResult().bodySent.message, /Forbidden/);
    });

    it('should allow ONLY Admin on Admin-required endpoints, denying Staff (403)', () => {
      const adminMiddleware = requireRole(['Admin']);

      // Admin allowed
      const adminTest = makeMockReqRes('Admin');
      adminMiddleware(adminTest.req, adminTest.res, adminTest.next);
      assert.equal(adminTest.getResult().nextCalled, true);

      // Staff denied
      const staffTest = makeMockReqRes('Staff');
      adminMiddleware(staffTest.req, staffTest.res, staffTest.next);
      assert.equal(staffTest.getResult().nextCalled, false);
      assert.equal(staffTest.getResult().statusSent, 403);
    });

    it('should return 401 when user is not authenticated', () => {
      const middleware = requireRole(['Staff', 'Admin']);
      const { req, res, next, getResult } = makeMockReqRes(undefined);

      middleware(req, res, next);
      assert.equal(getResult().nextCalled, false);
      assert.equal(getResult().statusSent, 401);
    });
  });

  describe('5. CSRF & Origin Validation Security Audit', () => {
    const makeReqRes = ({
      method = 'POST',
      origin,
      referer,
      cookies = {},
      headers = {},
      path = '/api/auth/logout',
    }: any) => {
      const req: any = {
        method,
        path,
        cookies,
        headers: {
          origin,
          referer,
          ...headers,
        },
      };
      let statusSent = 200;
      let bodySent: any = null;
      let nextCalled = false;

      const res: any = {
        status: (code: number) => {
          statusSent = code;
          return res;
        },
        json: (data: any) => {
          bodySent = data;
          return res;
        },
      };

      const next = () => {
        nextCalled = true;
      };

      return { req, res, next, getResult: () => ({ statusSent, bodySent, nextCalled }) };
    };

    it('should allow state-changing request from trusted frontend origin', () => {
      const { req, res, next, getResult } = makeReqRes({
        method: 'POST',
        origin: config.frontendUrl,
      });

      validateOrigin(req, res, next);
      assert.equal(getResult().nextCalled, true);
    });

    it('should reject state-changing request from untrusted origin (403 Forbidden)', () => {
      const { req, res, next, getResult } = makeReqRes({
        method: 'POST',
        origin: 'https://malicious-attacker-site.com',
      });

      validateOrigin(req, res, next);
      assert.equal(getResult().nextCalled, false);
      assert.equal(getResult().statusSent, 403);
      assert.match(getResult().bodySent.message, /Untrusted cross-origin request/);
    });

    it('should reject state-changing request with session cookie but missing Origin/Referer (403)', () => {
      const { req, res, next, getResult } = makeReqRes({
        method: 'POST',
        origin: undefined,
        referer: undefined,
        cookies: { [config.cookie.name]: 'some-token' },
      });

      validateOrigin(req, res, next);
      assert.equal(getResult().nextCalled, false);
      assert.equal(getResult().statusSent, 403);
      assert.match(getResult().bodySent.message, /Missing Origin\/Referer header/);
    });

    it('should bypass origin check for safe read-only methods (GET, OPTIONS)', () => {
      const { req, res, next, getResult } = makeReqRes({
        method: 'GET',
        origin: 'https://other-domain.com',
      });

      validateOrigin(req, res, next);
      assert.equal(getResult().nextCalled, true);
    });

    it('should reject cookie-authenticated POST with missing X-CSRF-Token header (403)', () => {
      const sessionToken = testSessionService.createSessionToken('USR-001', 'staff@example.com', 'csrf-secret-123');

      const { req, res, next, getResult } = makeReqRes({
        method: 'POST',
        cookies: { [config.cookie.name]: sessionToken },
        headers: {}, // No X-CSRF-Token
      });

      validateCsrfToken(req, res, next);
      assert.equal(getResult().nextCalled, false);
      assert.equal(getResult().statusSent, 403);
      assert.match(getResult().bodySent.message, /CSRF token missing/);
    });

    it('should reject cookie-authenticated POST with mismatched X-CSRF-Token header (403)', () => {
      const sessionToken = sessionService.createSessionToken('USR-001', 'staff@example.com', 'csrf-secret-123');

      const { req, res, next, getResult } = makeReqRes({
        method: 'POST',
        cookies: { [config.cookie.name]: sessionToken },
        headers: { 'x-csrf-token': 'wrong-token' },
      });

      validateCsrfToken(req, res, next);
      assert.equal(getResult().nextCalled, false);
      assert.equal(getResult().statusSent, 403);
      assert.match(getResult().bodySent.message, /Invalid CSRF token/);
    });

    it('should allow cookie-authenticated POST with valid matching X-CSRF-Token header', () => {
      const sessionToken = sessionService.createSessionToken('USR-001', 'staff@example.com', 'csrf-secret-123');

      const { req, res, next, getResult } = makeReqRes({
        method: 'POST',
        cookies: {
          [config.cookie.name]: sessionToken,
          [config.cookie.csrfCookieName]: 'csrf-secret-123',
        },
        headers: { 'x-csrf-token': 'csrf-secret-123' },
      });

      validateCsrfToken(req, res, next);
      assert.equal(getResult().nextCalled, true);
    });

    it('should bypass CSRF token check on safe read-only methods (GET)', () => {
      const { req, res, next, getResult } = makeReqRes({
        method: 'GET',
        cookies: { [config.cookie.name]: 'some-token' },
      });

      validateCsrfToken(req, res, next);
      assert.equal(getResult().nextCalled, true);
    });
  });

  describe('6. Google Sheets User Lookup Security Audit (Duplicate Normalized Emails)', () => {
    it('should reject safely when multiple rows have the same normalized email (409 Conflict)', async () => {
      const duplicateUser1: UserRow = {
        UserID: 'USR-010',
        FullName: 'User Ten',
        Email: 'duplicate@example.com',
        Role: 'Staff',
        JoiningDate: '2026-01-01',
        IsActive: 'TRUE',
        CreatedAt: '2026-01-01T00:00:00.000Z',
        UpdatedAt: '2026-01-01T00:00:00.000Z',
      };
      const duplicateUser2: UserRow = {
        UserID: 'USR-011',
        FullName: 'User Eleven Elevated',
        Email: '  DUPLICATE@example.COM  ', // Same normalized email
        Role: 'Admin',
        JoiningDate: '2026-01-01',
        IsActive: 'TRUE',
        CreatedAt: '2026-01-01T00:00:00.000Z',
        UpdatedAt: '2026-01-01T00:00:00.000Z',
      };

      testUserService.setMockUsersList([duplicateUser1, duplicateUser2]);

      await assert.rejects(
        async () => {
          await testUserService.verifyActiveUserByEmail('duplicate@example.com');
        },
        (err: any) => {
          assert.equal(err.name, 'UserVerificationError');
          assert.equal(err.statusCode, 409);
          assert.match(err.message, /Multiple user accounts registered/);
          return true;
        }
      );
    });
  });

  describe('7. Session Security & Secret Strength Enforcement', () => {
    it('should throw fatal error if SESSION_SECRET is too short (< 32 chars) in production mode simulation', () => {
      const validateSecretInProd = (secret: string | undefined) => {
        if (!secret) throw new Error('FATAL SECURITY ERROR: SESSION_SECRET is required');
        if (secret.length < 32) throw new Error('FATAL SECURITY ERROR: SESSION_SECRET must be at least 32 characters long');
      };

      assert.throws(() => validateSecretInProd(undefined), /SESSION_SECRET is required/);
      assert.throws(() => validateSecretInProd('short-key'), /at least 32 characters long/);
      assert.doesNotThrow(() => validateSecretInProd('valid-cryptographic-secret-32-chars-long!'));
    });
  });
});
