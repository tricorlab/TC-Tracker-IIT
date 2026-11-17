import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { emailService } from '../services/email.service.js';

describe('--- [HTTPS EMAIL REST API TEST SUITE] Cloud-Ready Email Dispatch ---', () => {
  const origEnv = { ...process.env };
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    emailService.clearMockEmailLogs();
    emailService.setCustomDispatcher(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...origEnv };
  });

  it('1. isEmailConfigured recognizes RESEND_API_KEY as a valid email configuration', () => {
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    delete process.env.SMTP_HOST;
    delete process.env.GMAIL_REFRESH_TOKEN;
    delete process.env.BREVO_API_KEY;

    process.env.RESEND_API_KEY = 're_test_123456789';

    assert.strictEqual(emailService.isEmailConfigured(), true);
    assert.strictEqual(emailService.getActiveProvider(), 'resend');
  });

  it('2. isEmailConfigured recognizes BREVO_API_KEY as a valid email configuration', () => {
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    delete process.env.SMTP_HOST;
    delete process.env.GMAIL_REFRESH_TOKEN;
    delete process.env.RESEND_API_KEY;

    process.env.BREVO_API_KEY = 'xkeysib-test-123456';

    assert.strictEqual(emailService.isEmailConfigured(), true);
    assert.strictEqual(emailService.getActiveProvider(), 'brevo');
  });

  it('3. getActiveProvider prioritizes HTTPS Resend over SMTP to bypass cloud port blocking', () => {
    process.env.GMAIL_USER = 'sender@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'app-password';
    process.env.RESEND_API_KEY = 're_live_key_999';

    // Even if GMAIL_USER/GMAIL_APP_PASSWORD are set, RESEND_API_KEY takes priority
    assert.strictEqual(emailService.getActiveProvider(), 'resend');
  });

  it('4. getActiveProvider respects explicit EMAIL_PROVIDER override', () => {
    process.env.GMAIL_USER = 'sender@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'app-password';
    process.env.RESEND_API_KEY = 're_live_key_999';
    process.env.EMAIL_PROVIDER = 'smtp';

    assert.strictEqual(emailService.getActiveProvider(), 'smtp');
  });

  it('5. sendResendMail correctly dispatches POST to api.resend.com over HTTPS', async () => {
    process.env.RESEND_API_KEY = 're_mock_test_key';
    process.env.EMAIL_FROM = 'TC Tracker <test@domain.org>';

    let capturedUrl = '';
    let capturedOptions: any = null;

    globalThis.fetch = (async (url: any, opts: any) => {
      capturedUrl = url.toString();
      capturedOptions = opts;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'resend_msg_12345' }),
      } as any;
    }) as any;

    const result = await emailService.sendResendMail({
      to: 'employee@institution.edu',
      subject: 'TC Tracker Credentials',
      text: 'Temporary Password: secret',
      html: '<p>Temporary Password: secret</p>',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(capturedUrl, 'https://api.resend.com/emails');
    assert.strictEqual(capturedOptions.method, 'POST');
    assert.strictEqual(capturedOptions.headers['Authorization'], 'Bearer re_mock_test_key');

    const body = JSON.parse(capturedOptions.body);
    assert.strictEqual(body.from, 'TC Tracker <test@domain.org>');
    assert.deepStrictEqual(body.to, ['employee@institution.edu']);
    assert.strictEqual(body.subject, 'TC Tracker Credentials');
  });

  it('6. sendResendMail captures and returns descriptive error when API returns 4xx/5xx', async () => {
    process.env.RESEND_API_KEY = 're_invalid_key';

    globalThis.fetch = (async () => {
      return {
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: async () => ({
          message: 'The from address does not belong to any verified domain.',
          name: 'validation_error',
        }),
      } as any;
    }) as any;

    const result = await emailService.sendResendMail({
      to: 'employee@institution.edu',
      subject: 'TC Tracker Test',
      text: 'Test',
      html: '<p>Test</p>',
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.errorMessage?.includes('Resend API Error (422)'));
    assert.ok(result.errorMessage?.includes('verified domain'));
  });

  it('7. sendBrevoMail dispatches POST to api.brevo.com over HTTPS', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-mock-test';
    process.env.BREVO_FROM = 'admin@institution.edu';

    let capturedUrl = '';
    let capturedOptions: any = null;

    globalThis.fetch = (async (url: any, opts: any) => {
      capturedUrl = url.toString();
      capturedOptions = opts;
      return {
        ok: true,
        status: 201,
        json: async () => ({ messageId: '<brevo-12345@smtp-relay.mailin.fr>' }),
      } as any;
    }) as any;

    const result = await emailService.sendBrevoMail({
      fromName: 'TC Tracker Portal',
      to: 'employee@institution.edu',
      subject: 'Leave Approved',
      text: 'Your leave has been approved',
      html: '<p>Your leave has been approved</p>',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(capturedUrl, 'https://api.brevo.com/v3/smtp/email');
    assert.strictEqual(capturedOptions.headers['api-key'], 'xkeysib-mock-test');

    const body = JSON.parse(capturedOptions.body);
    assert.strictEqual(body.sender.name, 'TC Tracker Portal');
    assert.strictEqual(body.sender.email, 'admin@institution.edu');
    assert.deepStrictEqual(body.to, [{ email: 'employee@institution.edu' }]);
  });

  it('8. verifyConnection reports Resend API (HTTPS) and port 443 when key is valid', async () => {
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    process.env.RESEND_API_KEY = 're_test_key_valid';

    globalThis.fetch = (async (url: any) => {
      assert.strictEqual(url.toString(), 'https://api.resend.com/api-keys');
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      } as any;
    }) as any;

    const diag = await emailService.verifyConnection();

    assert.strictEqual(diag.configured, true);
    assert.strictEqual(diag.authMethod, 'Resend API (HTTPS)');
    assert.strictEqual(diag.verified, true);
    assert.strictEqual(diag.portUsed, 443);
  });

  it('9. sendResendMail falls back to onboarding@resend.dev when EMAIL_FROM is a public gmail.com address', async () => {
    process.env.RESEND_API_KEY = 're_test_key_valid';
    process.env.GMAIL_USER = 'tricorlab@gmail.com';
    process.env.EMAIL_FROM = 'tricorlab@gmail.com';

    let capturedOptions: any = null;
    globalThis.fetch = (async (_url: any, opts: any) => {
      capturedOptions = opts;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'resend_ok_1' }),
      } as any;
    }) as any;

    const result = await emailService.sendResendMail({
      to: 'staff@domain.com',
      subject: 'Test Subject',
      text: 'Body',
      html: '<p>Body</p>',
    });

    assert.strictEqual(result.success, true);
    const body = JSON.parse(capturedOptions.body);
    // Crucial: Must NOT send from @gmail.com to prevent Resend 403 error
    assert.strictEqual(body.from, 'TC Tracker <onboarding@resend.dev>');
    // Crucial: reply_to receives the admin's Gmail address
    assert.strictEqual(body.reply_to, 'tricorlab@gmail.com');
  });

  it('10. sendResendMail formats actionable message when 403 unverified domain occurs', async () => {
    process.env.RESEND_API_KEY = 're_test_key_valid';

    globalThis.fetch = (async () => {
      return {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({
          message: 'The gmail.com domain is not verified. Please, add and verify your domain on https://resend.com/domains',
        }),
      } as any;
    }) as any;

    const result = await emailService.sendResendMail({
      to: 'staff@domain.com',
      subject: 'Test',
      text: 'Test',
      html: '<p>Test</p>',
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.errorMessage?.includes('Resend Domain Notice (403)'));
    assert.ok(result.errorMessage?.includes('onboarding@resend.dev'));
  });
});
