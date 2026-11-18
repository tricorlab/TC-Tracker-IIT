import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { emailService } from '../services/email.service.js';

describe('--- [FIRST-PARTY EMAIL TEST SUITE] Google Apps Script & SMTP Dispatch ---', () => {
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

  it('1. isEmailConfigured recognizes APPS_SCRIPT_URL as a valid first-party email configuration', () => {
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    delete process.env.SMTP_HOST;
    delete process.env.GMAIL_REFRESH_TOKEN;

    process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_mock_deployment/exec';

    assert.strictEqual(emailService.isEmailConfigured(), true);
    assert.strictEqual(emailService.getActiveProvider(), 'google_script');
  });

  it('2. getActiveProvider prioritizes Google Apps Script over SMTP for cloud compatibility', () => {
    process.env.GMAIL_USER = 'sender@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'app-password';
    process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_live/exec';

    assert.strictEqual(emailService.getActiveProvider(), 'google_script');
  });

  it('3. getActiveProvider respects explicit EMAIL_PROVIDER override to smtp', () => {
    process.env.GMAIL_USER = 'sender@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'app-password';
    process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_live/exec';
    process.env.EMAIL_PROVIDER = 'smtp';

    assert.strictEqual(emailService.getActiveProvider(), 'smtp');
  });

  it('4. sendGoogleAppsScriptMail correctly dispatches POST to Apps Script URL over HTTPS', async () => {
    process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_mock_key/exec';
    process.env.GMAIL_USER = 'tricorlab@gmail.com';

    let capturedUrl = '';
    let capturedOptions: any = null;

    globalThis.fetch = (async (url: any, opts: any) => {
      capturedUrl = url.toString();
      capturedOptions = opts;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true }),
      } as any;
    }) as any;

    const result = await emailService.sendGoogleAppsScriptMail({
      fromName: 'TC Tracker Portal',
      to: 'employee@institution.edu',
      subject: 'TC Tracker Credentials',
      text: 'Temporary Password: secret',
      html: '<p>Temporary Password: secret</p>',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(capturedUrl, 'https://script.google.com/macros/s/AKfycbx_mock_key/exec');
    assert.strictEqual(capturedOptions.method, 'POST');

    const body = JSON.parse(capturedOptions.body);
    assert.strictEqual(body.fromName, 'TC Tracker Portal');
    assert.strictEqual(body.to, 'employee@institution.edu');
    assert.strictEqual(body.subject, 'TC Tracker Credentials');
    assert.strictEqual(body.replyTo, 'tricorlab@gmail.com');
  });

  it('5. sendGoogleAppsScriptMail captures and returns descriptive error when script fails', async () => {
    process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_invalid/exec';

    globalThis.fetch = (async () => {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          success: false,
          error: 'Missing required fields: to or subject',
        }),
      } as any;
    }) as any;

    const result = await emailService.sendGoogleAppsScriptMail({
      to: 'employee@institution.edu',
      subject: 'TC Tracker Test',
      text: 'Test',
      html: '<p>Test</p>',
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.errorMessage?.includes('Google Apps Script Error: Missing required fields'));
  });

  it('6. sendGoogleAppsScriptMail captures network failures gracefully', async () => {
    process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_offline/exec';

    globalThis.fetch = (async () => {
      throw new Error('fetch failed: ENOTFOUND script.google.com');
    }) as any;

    const result = await emailService.sendGoogleAppsScriptMail({
      to: 'employee@institution.edu',
      subject: 'TC Tracker Test',
      text: 'Test',
      html: '<p>Test</p>',
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.errorMessage?.includes('Google Apps Script Network Error'));
  });

  it('7. verifyConnection reports Google Apps Script (HTTPS) and port 443 when script is reachable', async () => {
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_valid/exec';

    globalThis.fetch = (async (url: any) => {
      assert.strictEqual(url.toString(), 'https://script.google.com/macros/s/AKfycbx_valid/exec');
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', service: 'TC Tracker Email Webhook' }),
      } as any;
    }) as any;

    const diag = await emailService.verifyConnection();

    assert.strictEqual(diag.configured, true);
    assert.strictEqual(diag.authMethod, 'Google Apps Script (HTTPS)');
    assert.strictEqual(diag.verified, true);
    assert.strictEqual(diag.portUsed, 443);
  });

  it('8. verifyConnection reports troubleshooting guidance when script returns non-200', async () => {
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_unauthorized/exec';

    globalThis.fetch = (async () => {
      return {
        ok: false,
        status: 401,
      } as any;
    }) as any;

    const diag = await emailService.verifyConnection();

    assert.strictEqual(diag.configured, true);
    assert.strictEqual(diag.verified, false);
    assert.ok(diag.error?.includes('HTTP 401'));
    assert.ok(diag.troubleshooting?.includes('Execute as: Me'));
  });
});
