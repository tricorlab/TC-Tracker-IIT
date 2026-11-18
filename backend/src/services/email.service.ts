import dotenv from 'dotenv';
import { google } from 'googleapis';
import nodemailer, { type Transporter } from 'nodemailer';
import { googleSheetsService } from './googleSheets.service.js';
import { SHEET_NAMES } from '../config/sheets.config.js';
import { EmailLogRow } from '../types/database.types.js';
import { userService } from './userService.js';

/**
 * Sanitizes input strings against HTML / script injection for email bodies.
 */
export function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface LeaveEmailNotificationPayload {
  leaveRequestId: string;
  staffName: string;
  staffEmail?: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  calculatedDays: number;
  reason: string;
  submittedAt: string;
  warning?: string;
}

export interface SpecialLeaveEmailNotificationPayload {
  leaveRequestId: string;
  staffName: string;
  staffEmail: string;
  adminName: string;
  criticalSection: string;
  startDate: string;
  endDate: string;
  calculatedDays: number;
  reason: string;
  exemptFromBalance: boolean;
}

export interface DriveBackupEmailNotificationPayload {
  fileId: string;
  title: string;
  webViewLink: string;
  createdAt: string;
  performedBy: string;
}

export interface WelcomeCredentialsEmailPayload {
  staffName: string;
  staffEmail: string;
  temporaryPassword: string;
  loginUrl?: string;
}

export interface AdminPasswordResetEmailPayload {
  staffName: string;
  staffEmail: string;
  temporaryPassword: string;
  loginUrl?: string;
  adminName?: string;
}

export interface PasswordResetEmailPayload {
  staffName: string;
  staffEmail: string;
  resetLink: string;
  otpCode: string;
  expiresInMinutes?: number;
}

export type CustomEmailDispatcher = (options: {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
}) => Promise<void>;

export class EmailService {
  private mockEmailLogs: EmailLogRow[] = [];
  private customDispatcher: CustomEmailDispatcher | null = null;

  public clearMockEmailLogs(): void {
    this.mockEmailLogs = [];
  }

  public getMockEmailLogs(): EmailLogRow[] {
    return [...this.mockEmailLogs];
  }

  /**
   * Inject a custom dispatcher for testing email transmission without external API calls.
   */
  public setCustomDispatcher(dispatcher: CustomEmailDispatcher | null): void {
    this.customDispatcher = dispatcher;
  }

  private lastEnvReload = 0;

  /**
   * Reload environment variables from disk (throttled to at most once per minute to avoid blocking disk I/O).
   */
  public reloadEnv(force = false): void {
    const now = Date.now();
    if (process.env.NODE_ENV !== 'test' && (force || now - this.lastEnvReload > 60000)) {
      dotenv.config({ override: true });
      dotenv.config({ path: 'backend/.env', override: true });
      this.lastEnvReload = now;
    }
  }

  /**
   * Helper to resolve the sender/system Gmail address from environment variables.
   * Supports standard GMAIL_USER, ADMIN_GMAIL, and EMAIL_USER to handle varied cloud deployment configs.
   */
  public getResolvedGmailUser(): string | undefined {
    const raw =
      process.env.GMAIL_USER ||
      process.env.ADMIN_GMAIL ||
      process.env.EMAIL_USER;
    return raw?.replace(/^["']|["']$/g, '').trim() || undefined;
  }

  /**
   * Helper to resolve the Gmail App Password from environment variables.
   * Automatically strips internal spaces and surrounding quotes.
   */
  public getResolvedGmailAppPassword(): string | undefined {
    const raw =
      process.env.GMAIL_APP_PASSWORD ||
      process.env.GMAIL_PASS ||
      process.env.EMAIL_PASS ||
      process.env.EMAIL_PASSWORD;
    return raw ? raw.replace(/^["']|["']$/g, '').replace(/\s+/g, '').trim() : undefined;
  }

  /**
   * Check if live email credentials (Google Apps Script, Gmail App Password, SMTP, or Gmail API OAuth2) are configured.
   */
  public isEmailConfigured(): boolean {
    if (this.customDispatcher) {
      return true;
    }
    this.reloadEnv();

    // 0. Check Google Apps Script Web App (Port 443 - HTTPS, zero third-party services)
    if (process.env.APPS_SCRIPT_URL && process.env.APPS_SCRIPT_URL.trim()) {
      return true;
    }
    if (process.env.GOOGLE_APPS_SCRIPT_URL && process.env.GOOGLE_APPS_SCRIPT_URL.trim()) {
      return true;
    }

    // 1. Check Gmail SMTP / App Password
    const gmailUser = this.getResolvedGmailUser();
    const gmailAppPassword = this.getResolvedGmailAppPassword();
    if (gmailUser && gmailAppPassword) {
      return true;
    }

    // 2. Check Generic SMTP
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    if (smtpHost && smtpUser && smtpPass) {
      return true;
    }

    // 3. Check Gmail API OAuth2
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
    const clientId =
      process.env.GMAIL_CLIENT_ID ||
      process.env.GOOGLE_CLIENT_ID ||
      process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret =
      process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

    return Boolean(gmailUser && refreshToken && clientId && clientSecret);
  }

  /**
   * Helper to format descriptive and actionable error messages for SMTP failures.
   */
  public formatSmtpError(err: any): string {
    const rawMsg = err?.message || 'SMTP transmission failure';
    const cleanMsg = rawMsg.replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]');

    if (err?.code === 'EAUTH' || /535|Username and Password not accepted/i.test(cleanMsg)) {
      return `Gmail Authentication Failed (535): Google rejected your credentials. Ensure GMAIL_USER is correct, 2-Step Verification is active on that Google account, and GMAIL_APP_PASSWORD is a valid 16-character App Password (not your personal Google account password). If deploying from a new cloud IP (e.g. Render/AWS), check Google Security Alerts to approve the login. Details: ${cleanMsg}`;
    }

    if (err?.code === 'ETIMEDOUT' || err?.code === 'ESOCKETTIMEDOUT' || err?.code === 'ENETUNREACH' || /timeout/i.test(cleanMsg)) {
      return `SMTP Connection Timed Out: Outbound connection to Google Mail servers timed out on ports 465 and 587. The hosting platform firewall may be restricting outbound SMTP traffic or network egress. Details: ${cleanMsg}`;
    }

    if (err?.code === 'ECONNREFUSED') {
      return `SMTP Connection Refused: The mail server refused connection on ports 465/587. Details: ${cleanMsg}`;
    }

    return cleanMsg;
  }

  /**
   * Helper to create a Nodemailer transporter if Gmail App Password or SMTP is configured.
   * Configured with family: 4 (force IPv4) and explicit connection timeouts
   * to guarantee reliable delivery on cloud hosting environments (Render, Docker, AWS).
   */
  public getNodemailerTransporter(portOverride?: number): { transporter: Transporter; from: string; port: number } | null {
    this.reloadEnv();
    const gmailUser = this.getResolvedGmailUser();
    const gmailAppPassword = this.getResolvedGmailAppPassword();

    if (gmailUser && gmailAppPassword) {
      const port = portOverride || (process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465);
      const isSecure = port === 465;

      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port,
        secure: isSecure,
        auth: {
          user: gmailUser,
          pass: gmailAppPassword,
        },
        family: 4, // Critical for cloud platforms (Render, Docker, AWS) to avoid IPv6 unreachable timeouts
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      } as any);

      return {
        transporter,
        from: gmailUser,
        port,
      };
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = portOverride || parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;

    if (smtpHost && smtpUser && smtpPass) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        family: 4,
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      } as any);
      return {
        transporter,
        from: smtpUser,
        port: smtpPort,
      };
    }

    return null;
  }

  /**
   * Helper to send email via Nodemailer with dual-port fallback (465 SSL <-> 587 STARTTLS)
   * if a network or connection timeout occurs on cloud deployments.
   */
  public async sendNodemailerMail(options: {
    fromName: string;
    fromEmail: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    replyTo?: string;
  }): Promise<{ success: boolean; errorMessage?: string }> {
    const primary = this.getNodemailerTransporter();
    if (!primary) {
      return {
        success: false,
        errorMessage: 'Email service credentials not configured. Please set GMAIL_USER and GMAIL_APP_PASSWORD in environment to send live emails.',
      };
    }

    try {
      await primary.transporter.sendMail({
        from: `"${options.fromName}" <${primary.from}>`,
        to: options.to,
        replyTo: options.replyTo,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      return { success: true };
    } catch (err: any) {
      const isNetworkErr =
        err?.code === 'ETIMEDOUT' ||
        err?.code === 'ESOCKETTIMEDOUT' ||
        err?.code === 'ECONNREFUSED' ||
        err?.code === 'ENETUNREACH';

      if (isNetworkErr) {
        // Try fallback port (587 if 465 was used, or 465 if 587 was used)
        const fallbackPort = primary.port === 465 ? 587 : 465;
        const fallback = this.getNodemailerTransporter(fallbackPort);
        if (fallback) {
          try {
            await fallback.transporter.sendMail({
              from: `"${options.fromName}" <${fallback.from}>`,
              to: options.to,
              replyTo: options.replyTo,
              subject: options.subject,
              text: options.text,
              html: options.html,
            });
            return { success: true };
          } catch (fallbackErr: any) {
            return { success: false, errorMessage: this.formatSmtpError(fallbackErr) };
          }
        }
      }

      return { success: false, errorMessage: this.formatSmtpError(err) };
    }
  }

  /**
   * Helper to send email via Google Apps Script Web App (HTTPS port 443).
   * Runs directly inside the existing Google Sheet without third-party services.
   */
  public async sendGoogleAppsScriptMail(options: {
    fromName?: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    replyTo?: string;
  }): Promise<{ success: boolean; errorMessage?: string }> {
    const scriptUrl = (process.env.APPS_SCRIPT_URL || process.env.GOOGLE_APPS_SCRIPT_URL)?.trim();
    if (!scriptUrl) {
      return { success: false, errorMessage: 'APPS_SCRIPT_URL is not configured in environment.' };
    }

    const secret = process.env.APPS_SCRIPT_SECRET?.trim();
    const replyTo = options.replyTo || process.env.ADMIN_GMAIL || process.env.GMAIL_USER;

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html,
          fromName: options.fromName || 'TC Tracker',
          replyTo: replyTo || undefined,
          secret: secret || undefined,
        }),
        redirect: 'follow',
      });

      const rawText = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        // Not JSON
      }

      if (data && data.success === false) {
        return {
          success: false,
          errorMessage: `Google Apps Script Error: ${data.error || data.message || 'Script reported dispatch failure'}`,
        };
      }

      if (!response.ok) {
        return {
          success: false,
          errorMessage: `Google Apps Script HTTP Error (${response.status}): ${data?.message || rawText.slice(0, 150)}`,
        };
      }

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        errorMessage: `Google Apps Script Network Error: ${err?.message || 'Failed to reach Apps Script Web App'}`,
      };
    }
  }

  /**
   * Determine the active email dispatch mechanism.
   * Priority:
   * 1. Explicit EMAIL_PROVIDER ('google_script' | 'gmail_api' | 'smtp')
   * 2. Google Apps Script Web App (HTTPS port 443 - first party, runs in existing Google Sheet)
   * 3. Gmail API OAuth2 (HTTPS port 443)
   * 4. Nodemailer SMTP (Gmail App Password or Custom SMTP)
   */
  public getActiveProvider(): 'google_script' | 'gmail_api' | 'smtp' | null {
    const explicit = process.env.EMAIL_PROVIDER?.toLowerCase().trim();
    if (explicit === 'google_script' || explicit === 'apps_script' || explicit === 'google_apps_script') {
      if (process.env.APPS_SCRIPT_URL || process.env.GOOGLE_APPS_SCRIPT_URL) return 'google_script';
    }
    if (explicit === 'gmail_api' && this.getGmailClient()) return 'gmail_api';
    if (explicit === 'smtp' && this.getNodemailerTransporter()) return 'smtp';

    if (process.env.APPS_SCRIPT_URL?.trim() || process.env.GOOGLE_APPS_SCRIPT_URL?.trim()) return 'google_script';
    if (this.getGmailClient()) return 'gmail_api';
    if (this.getNodemailerTransporter()) return 'smtp';

    return null;
  }

  /**
   * Unified dispatcher executing the active email transport.
   * Handles custom testing dispatchers, mock test environments, Google Apps Script, Gmail API, and SMTP.
   */
  public async sendDirectEmail(options: {
    to: string;
    subject: string;
    text: string;
    html: string;
    fromName?: string;
    fromEmail?: string;
    replyTo?: string;
  }): Promise<{ success: boolean; errorMessage?: string }> {
    if (this.customDispatcher) {
      try {
        await this.customDispatcher({
          to: options.to,
          from: options.fromEmail || 'notifications@tc-tracker.local',
          subject: options.subject,
          text: options.text,
          html: options.html,
        });
        return { success: true };
      } catch (err: any) {
        return { success: false, errorMessage: err?.message || 'Custom dispatcher transmission failure' };
      }
    }

    if (process.env.NODE_ENV === 'test') {
      return { success: true };
    }

    const provider = this.getActiveProvider();
    if (!provider) {
      return {
        success: false,
        errorMessage: 'Email service credentials not configured. Please set APPS_SCRIPT_URL (or GMAIL_USER and GMAIL_APP_PASSWORD) in environment to send live emails.',
      };
    }

    if (provider === 'google_script') {
      return this.sendGoogleAppsScriptMail(options);
    }

    if (provider === 'gmail_api') {
      const gmailClient = this.getGmailClient();
      if (!gmailClient) {
        return { success: false, errorMessage: 'Gmail OAuth2 client could not be initialized.' };
      }
      try {
        const raw = this.buildRawMimeMessage({
          from: gmailClient.from,
          to: options.to,
          subject: options.subject,
          textBody: options.text,
          htmlBody: options.html,
        });
        await gmailClient.gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw },
        });
        return { success: true };
      } catch (err: any) {
        const rawMsg = err?.message || 'Gmail API transmission failure';
        return {
          success: false,
          errorMessage: rawMsg.replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]'),
        };
      }
    }

    if (provider === 'smtp') {
      const transporterObj = this.getNodemailerTransporter();
      if (!transporterObj) {
        return { success: false, errorMessage: 'Nodemailer transporter could not be initialized.' };
      }
      return this.sendNodemailerMail({
        fromName: options.fromName || 'TC Tracker',
        fromEmail: transporterObj.from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: options.replyTo,
      });
    }

    return { success: false, errorMessage: 'No email delivery provider available.' };
  }

  /**
   * Helper to create an authorized Gmail API client if credentials exist.
   */
  private getGmailClient(): { gmail: any; from: string } | null {
    const user = process.env.GMAIL_USER;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
    const clientId =
      process.env.GMAIL_CLIENT_ID ||
      process.env.GOOGLE_CLIENT_ID ||
      process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret =
      process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

    if (user && refreshToken && clientId && clientSecret) {
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      return {
        gmail: google.gmail({ version: 'v1', auth: oauth2Client }),
        from: user,
      };
    }

    return null;
  }

  /**
   * Encode an RFC 2822 / MIME multipart message (plain text + HTML) in base64url.
   */
  public buildRawMimeMessage(options: {
    from: string;
    to: string;
    subject: string;
    textBody: string;
    htmlBody: string;
  }): string {
    const boundary = `tc_boundary_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const utf8Subject = `=?utf-8?B?${Buffer.from(options.subject).toString('base64')}?=`;

    const lines = [
      `From: TC Tracker <${options.from}>`,
      `To: ${options.to}`,
      `Subject: ${utf8Subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      options.textBody,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      options.htmlBody,
      ``,
      `--${boundary}--`,
    ];

    return Buffer.from(lines.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Generate clean, professional HTML body for leave notifications.
   * Informational only: no approval or rejection buttons.
   */
  public generateHtmlEmail(payload: LeaveEmailNotificationPayload): string {
    const staffEmailDisplay = payload.staffEmail ? escapeHtml(payload.staffEmail) : 'N/A';
    const reasonDisplay = payload.reason ? escapeHtml(payload.reason) : 'None provided';
    const safeStaffName = escapeHtml(payload.staffName);
    const safeLeaveRequestId = escapeHtml(payload.leaveRequestId);
    const safeLeaveType = escapeHtml(payload.leaveType);
    const safeStartDate = escapeHtml(payload.startDate);
    const safeEndDate = escapeHtml(payload.endDate);
    const safeCalculatedDays = escapeHtml(payload.calculatedDays);
    const safeSubmittedAt = escapeHtml(payload.submittedAt);
    const safeWarning = payload.warning ? escapeHtml(payload.warning) : '';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TC Tracker — Formal Leave Application</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b; margin: 0; padding: 24px; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); padding: 24px 28px; color: #ffffff; text-align: left; }
    .header-badge { display: inline-block; padding: 3px 10px; border-radius: 9999px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; background-color: rgba(255, 255, 255, 0.2); color: #ffffff; margin-bottom: 8px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
    .header p { margin: 4px 0 0; font-size: 13px; color: #dbeafe; font-weight: 500; }
    .content { padding: 28px 28px 20px; }
    .salutation { font-size: 14px; font-weight: 700; color: #0f172a; margin: 0 0 12px; }
    .intro { font-size: 13px; color: #475569; line-height: 1.55; margin: 0 0 18px; }
    .table-card { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; background-color: #ffffff; font-size: 13px; }
    tr:nth-child(even) { background-color: #f8fafc; }
    td { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    td.label { width: 36%; font-weight: 600; color: #64748b; }
    td.value { width: 64%; font-weight: 500; color: #0f172a; }
    .id-tag { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; font-weight: 700; color: #1e40af; background-color: #eff6ff; padding: 2px 6px; border-radius: 4px; }
    .days-badge { display: inline-block; font-weight: 700; color: #0f172a; background-color: #f1f5f9; padding: 2px 8px; border-radius: 6px; }
    .warning-box { background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 14px; font-size: 12px; color: #92400e; margin-bottom: 18px; line-height: 1.45; }
    .notice { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; font-size: 12px; color: #475569; line-height: 1.5; margin-top: 14px; }
    .notice strong { color: #1e293b; }
    .signoff { margin-top: 20px; font-size: 13px; color: #475569; line-height: 1.5; }
    .footer { padding: 16px 28px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="header-badge">Formal Notification</span>
      <h1>TC Tracker &bull; Leave Management</h1>
      <p>Institutional Staff Absence &amp; Leave Registry</p>
    </div>
    <div class="content">
      <div class="salutation">Dear Administrator,</div>
      <p class="intro">
        Please accept this formal notification of a leave application submitted by <strong>${safeStaffName}</strong>. The application details have been formally recorded in the institutional registry:
      </p>
      <div class="table-card">
        <table>
          <tr>
            <td class="label">Staff Member</td>
            <td class="value"><strong>${safeStaffName}</strong></td>
          </tr>
          <tr>
            <td class="label">Staff Email</td>
            <td class="value">${staffEmailDisplay}</td>
          </tr>
          <tr>
            <td class="label">Leave Request ID</td>
            <td class="value"><span class="id-tag">${safeLeaveRequestId}</span></td>
          </tr>
          <tr>
            <td class="label">Leave Type</td>
            <td class="value"><strong>${safeLeaveType}</strong></td>
          </tr>
          <tr>
            <td class="label">Start Date</td>
            <td class="value">${safeStartDate}</td>
          </tr>
          <tr>
            <td class="label">End Date</td>
            <td class="value">${safeEndDate}</td>
          </tr>
          <tr>
            <td class="label">Number of Days</td>
            <td class="value"><span class="days-badge">${safeCalculatedDays} day(s)</span></td>
          </tr>
          <tr>
            <td class="label">Reason / Grounds</td>
            <td class="value">${reasonDisplay}</td>
          </tr>
          <tr>
            <td class="label">Submitted At</td>
            <td class="value">${safeSubmittedAt}</td>
          </tr>
        </table>
      </div>
      ${
        safeWarning
          ? `<div class="warning-box">
        <strong>Allowance Notice:</strong> ${safeWarning}
      </div>`
          : ''
      }
      <div class="notice">
        <strong>Policy Notice:</strong> This is an automated informational notification. TC Tracker operates without an approval or rejection workflow. The request has been recorded in the leave records.
      </div>
      <div class="signoff">
        Yours faithfully,<br>
        <strong>TC Tracker Institutional Leave Management System</strong><br>
        <span style="font-size: 12px; color: #64748b;">Office of Institute Administration</span>
      </div>
    </div>
    <div class="footer">
      TC Tracker &bull; Confidential Institutional Notification &bull; To contact the applicant directly, you may reply to this email
    </div>
  </div>
</body>
</html>`.trim();
  }

  /**
   * Generate plain-text fallback for formal leave notifications.
   */
  public generatePlainTextEmail(payload: LeaveEmailNotificationPayload): string {
    const staffEmailDisplay = payload.staffEmail ? payload.staffEmail : 'N/A';
    const reasonDisplay = payload.reason ? payload.reason : 'None provided';
    const warningDisplay = payload.warning ? `\nAllowance Notice: ${payload.warning}` : '';

    return `
============================================================
TC TRACKER — FORMAL LEAVE APPLICATION
============================================================

To: The Administrator / Leave Sanctioning Authority

Dear Administrator,

This is a formal leave application notification submitted on behalf of ${payload.staffName}.
The details of the requested leave of absence are formally stated below:

Staff Member:     ${payload.staffName}
Staff Email:      ${staffEmailDisplay}
Leave Request ID: ${payload.leaveRequestId}
Leave Type:       ${payload.leaveType}
Start Date:       ${payload.startDate}
End Date:         ${payload.endDate}
Calculated Days:  ${payload.calculatedDays} day(s)
Reason:           ${reasonDisplay}
Submitted At:     ${payload.submittedAt}${warningDisplay}

NOTE: This is an automated informational notification. TC Tracker operates without an approval or rejection workflow. The request has been recorded in the leave records.

Yours faithfully,
TC Tracker Institutional Leave Management System
Office of Administration
============================================================
`.trim();
  }

  /**
   * Dispatch informational notification for a submitted leave request to Admins.
   * - Identifies active Admin users from the database.
   * - Includes ADMIN_GMAIL / ADMIN_EMAIL from environment variables if set.
   * - Deduplicates identical Admin emails so each recipient receives only 1 email.
   * - Sends via Gmail SMTP (Nodemailer), Custom SMTP, or Gmail API OAuth2.
   * - Logs every attempt (success or failure) to the EmailLogs worksheet.
   */
  public async sendLeaveSubmissionNotifications(
    payload: LeaveEmailNotificationPayload
  ): Promise<{ dispatchedCount: number; logs: EmailLogRow[] }> {
    // 1. Identify recipient Admin emails from database
    const allUsers = await userService.getAllUsers();
    const managementUsers = allUsers.filter(
      (u) =>
        userService.parseIsActive(u.IsActive) &&
        u.Role === 'Admin' &&
        u.Email &&
        u.Email.trim()
    );

    // 2. Deduplicate recipients by normalized lowercase email
    const recipientMap = new Map<string, { email: string; name: string }>();
    for (const u of managementUsers) {
      const normalizedEmail = u.Email.trim().toLowerCase();
      if (!recipientMap.has(normalizedEmail)) {
        recipientMap.set(normalizedEmail, {
          email: normalizedEmail,
          name: u.FullName ? u.FullName.trim() : normalizedEmail,
        });
      }
    }

    // 3. Add explicitly configured ADMIN_GMAIL / ADMIN_EMAIL from env if present
    const envAdminEmails = [
      process.env.ADMIN_GMAIL,
      process.env.ADMIN_EMAIL,
      process.env.ADMIN_NOTIFICATION_EMAIL,
    ];
    for (const raw of envAdminEmails) {
      if (raw && raw.trim()) {
        const normalized = raw.trim().toLowerCase();
        if (!recipientMap.has(normalized)) {
          recipientMap.set(normalized, {
            email: normalized,
            name: 'Administrator',
          });
        }
      }
    }

    // 4. Fallback to GMAIL_USER if no other admin recipient was identified
    if (recipientMap.size === 0 && process.env.GMAIL_USER && process.env.GMAIL_USER.trim()) {
      const fallback = process.env.GMAIL_USER.trim().toLowerCase();
      recipientMap.set(fallback, {
        email: fallback,
        name: 'Administrator',
      });
    }

    const recipients = Array.from(recipientMap.values());

    const emailLogs: EmailLogRow[] = [];
    const isConfigured = this.isEmailConfigured();
    const emailSubject = 'TC Tracker — New Leave Request';

    const textBody = this.generatePlainTextEmail(payload);
    const htmlBody = this.generateHtmlEmail(payload);

    const fromAddress =
      process.env.EMAIL_FROM ||
      process.env.GMAIL_USER ||
      'notifications@tc-tracker.local';

    for (const recipient of recipients) {
      const logId = `EML-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const attemptedAt = new Date().toISOString();

      let deliveryStatus: 'Sent' | 'Failed' = 'Failed';
      let errorMessage = '';
      let sentAt = '';

      const sendResult = await this.sendDirectEmail({
        fromName: 'TC Tracker Leave Management',
        fromEmail: fromAddress,
        to: recipient.email,
        replyTo: payload.staffEmail ? `"${payload.staffName}" <${payload.staffEmail}>` : undefined,
        subject: emailSubject,
        text: textBody,
        html: htmlBody,
      });

      if (sendResult.success) {
        deliveryStatus = 'Sent';
        sentAt = new Date().toISOString();
      } else {
        deliveryStatus = 'Failed';
        errorMessage = sendResult.errorMessage || 'Email transmission failure';
      }

      const logRecord: EmailLogRow = {
        EmailLogID: logId,
        RelatedLeaveRequestID: payload.leaveRequestId,
        RecipientEmail: recipient.email,
        DeliveryStatus: deliveryStatus,
        ErrorMessage: errorMessage,
        AttemptedAt: attemptedAt,
        SentAt: sentAt,
      };

      if (googleSheetsService.isLiveApiEnabled()) {
        try {
          await googleSheetsService.appendSheetRow(SHEET_NAMES.EMAIL_LOGS, [
            logRecord.EmailLogID,
            logRecord.RelatedLeaveRequestID,
            logRecord.RecipientEmail,
            logRecord.DeliveryStatus,
            logRecord.ErrorMessage,
            logRecord.AttemptedAt,
            logRecord.SentAt,
          ]);
        } catch (sheetErr: any) {
          console.error('[EmailService Error] Failed to append email log to Google Sheets:', sheetErr.message);
        }
      }

      // Keep in-memory copy for audit queries and test validations
      this.mockEmailLogs.push(logRecord);
      emailLogs.push(logRecord);
    }

    return {
      dispatchedCount: emailLogs.filter((l) => l.DeliveryStatus === 'Sent').length,
      logs: emailLogs,
    };
  }

  /**
   * Dispatch notification when an administrator allocates Special Leave based on a Critical Section.
   */
  public async sendSpecialLeaveNotification(
    payload: SpecialLeaveEmailNotificationPayload
  ): Promise<{ dispatched: boolean; log: EmailLogRow }> {
    const isConfigured = this.isEmailConfigured();
    const emailSubject = `TC Tracker — Special Leave Allocation: ${payload.criticalSection}`;
    const logId = `EML-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const attemptedAt = new Date().toISOString();

    const exemptionNotice = payload.exemptFromBalance
      ? 'This special allocation is EXEMPT from regular casual leave balance deductions.'
      : 'This allocation is recorded as standard administrative leave.';

    const textBody = `
============================================================
TC TRACKER — SPECIAL LEAVE ALLOCATION
============================================================

Dear ${payload.staffName},

An administrator (${payload.adminName}) has officially allocated Special Leave for you.

Details:
------------------------------------------------------------
Leave Request ID:  ${payload.leaveRequestId}
Critical Section:  ${payload.criticalSection}
Date Span:         ${payload.startDate} to ${payload.endDate}
Calculated Days:   ${payload.calculatedDays} day(s)
Exemption Status:  ${exemptionNotice}
Reason / Grounds:  ${payload.reason}

Allocated At:      ${attemptedAt}
============================================================
`.trim();

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .card { background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; max-width: 600px; margin: 0 auto; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { background-color: #7e22ce; color: #ffffff; padding: 20px 24px; }
    .header h1 { margin: 0; font-size: 18px; font-weight: 600; }
    .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.9; }
    .body { padding: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 20px; font-size: 14px; }
    td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
    .label { color: #64748b; font-weight: 500; width: 35%; }
    .value { color: #0f172a; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; background-color: #f3e8ff; color: #6b21a8; }
    .notice { background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px; font-size: 13px; color: #166534; margin-top: 16px; }
    .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>TC Tracker &bull; Special Leave Allocated</h1>
      <p>Administrative Critical Section Leave Grant</p>
    </div>
    <div class="body">
      <p>Dear <strong>${escapeHtml(payload.staffName)}</strong>,</p>
      <p>An administrator (<strong>${escapeHtml(payload.adminName)}</strong>) has allocated Special Leave to your record under the <strong>${escapeHtml(payload.criticalSection)}</strong> category.</p>
      <table>
        <tr>
          <td class="label">Leave Request ID</td>
          <td class="value"><code>${escapeHtml(payload.leaveRequestId)}</code></td>
        </tr>
        <tr>
          <td class="label">Critical Section</td>
          <td class="value"><span class="badge">${escapeHtml(payload.criticalSection)}</span></td>
        </tr>
        <tr>
          <td class="label">Dates</td>
          <td class="value"><strong>${escapeHtml(payload.startDate)}</strong> &rarr; <strong>${escapeHtml(payload.endDate)}</strong></td>
        </tr>
        <tr>
          <td class="label">Allocated Days</td>
          <td class="value"><strong>${escapeHtml(payload.calculatedDays)} day(s)</strong></td>
        </tr>
        <tr>
          <td class="label">Exemption Status</td>
          <td class="value">${payload.exemptFromBalance ? '<strong style="color: #16a34a;">Exempt from regular balance</strong>' : 'Standard balance'}</td>
        </tr>
        <tr>
          <td class="label">Grounds / Reason</td>
          <td class="value">${escapeHtml(payload.reason)}</td>
        </tr>
      </table>
      <div class="notice">
        <strong>Status:</strong> ${escapeHtml(exemptionNotice)}
      </div>
    </div>
    <div class="footer">
      TC Tracker &bull; Automated Administrative Notification &bull; Do not reply
    </div>
  </div>
</body>
</html>`.trim();

    let deliveryStatus: 'Sent' | 'Failed' = 'Failed';
    let errorMessage = '';
    let sentAt = '';

    const normalizedRecipient = (payload.staffEmail || '').trim().toLowerCase();

    if (normalizedRecipient) {
      const sendResult = await this.sendDirectEmail({
        fromName: 'TC Tracker Leave Management',
        to: normalizedRecipient,
        subject: emailSubject,
        text: textBody,
        html: htmlBody,
      });

      if (sendResult.success) {
        deliveryStatus = 'Sent';
        sentAt = new Date().toISOString();
      } else {
        deliveryStatus = 'Failed';
        errorMessage = sendResult.errorMessage || 'Email transmission failure';
      }
    } else {
      deliveryStatus = 'Failed';
      errorMessage = 'Recipient staff email address was not specified.';
    }

    const logRecord: EmailLogRow = {
      EmailLogID: logId,
      RelatedLeaveRequestID: payload.leaveRequestId,
      RecipientEmail: normalizedRecipient || 'unknown@domain.local',
      DeliveryStatus: deliveryStatus,
      ErrorMessage: errorMessage,
      AttemptedAt: attemptedAt,
      SentAt: sentAt,
    };

    if (googleSheetsService.isLiveApiEnabled()) {
      try {
        await googleSheetsService.appendSheetRow(SHEET_NAMES.EMAIL_LOGS, [
          logRecord.EmailLogID,
          logRecord.RelatedLeaveRequestID,
          logRecord.RecipientEmail,
          logRecord.DeliveryStatus,
          logRecord.ErrorMessage,
          logRecord.AttemptedAt,
          logRecord.SentAt,
        ]);
      } catch (sheetErr: any) {
        console.error('[EmailService Error] Failed to append email log to Google Sheets:', sheetErr.message);
      }
    }

    this.mockEmailLogs.push(logRecord);

    return {
      dispatched: deliveryStatus === 'Sent',
      log: logRecord,
    };
  }

  /**
   * Dispatch an informational notification when a 6-month Google Drive backup is created.
   */
  public async sendDriveBackupNotification(
    payload: DriveBackupEmailNotificationPayload
  ): Promise<{ dispatched: boolean; log: EmailLogRow }> {
    const attemptedAt = new Date().toISOString();
    const logId = `EML-DRV-${Date.now()}`;
    const subject = `[TC Tracker] Semi-Annual Google Drive Backup Created: ${payload.title}`;

    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.GMAIL_USER || 'admin@tctracker.local';

    const textContent = [
      `TC Tracker Semi-Annual Google Drive Backup Notification`,
      `-------------------------------------------------------`,
      `A complete spreadsheet clone backup has been successfully stored in Google Drive.`,
      ``,
      `Backup Title:  ${payload.title}`,
      `File ID:       ${payload.fileId}`,
      `Executed By:   ${payload.performedBy}`,
      `Timestamp:     ${payload.createdAt}`,
      `Direct Link:   ${payload.webViewLink}`,
      ``,
      `This is an informational backup record. All active spreadsheet records remain untouched.`,
    ].join('\n');

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 8px;">
        <h2 style="color: #0f172a; margin-top: 0;">TC Tracker Semi-Annual Google Drive Backup</h2>
        <p style="color: #334155; font-size: 14px;">A complete spreadsheet clone backup has been safely created in Google Drive.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
          <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; color: #64748b;"><strong>Backup Title:</strong></td><td style="padding: 8px 0; font-weight: 600;">${escapeHtml(payload.title)}</td></tr>
          <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; color: #64748b;"><strong>File ID:</strong></td><td style="padding: 8px 0; font-mono;">${escapeHtml(payload.fileId)}</td></tr>
          <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; color: #64748b;"><strong>Executed By:</strong></td><td style="padding: 8px 0;">${escapeHtml(payload.performedBy)}</td></tr>
          <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; color: #64748b;"><strong>Timestamp:</strong></td><td style="padding: 8px 0;">${escapeHtml(payload.createdAt)}</td></tr>
        </table>
        <div style="margin-top: 24px;">
          <a href="${escapeHtml(payload.webViewLink)}" style="background-color: #2563eb; color: #ffffff; padding: 10px 18px; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: bold; display: inline-block;">
            Open Backup in Google Drive &rarr;
          </a>
        </div>
      </div>
    `;

    let deliveryStatus: 'Sent' | 'Failed' = 'Failed';
    let errorMessage = '';
    let sentAt = '';

    const sendResult = await this.sendDirectEmail({
      fromName: 'TC Tracker Backup Service',
      to: adminEmail,
      subject,
      text: textContent,
      html: htmlContent,
    });

    if (sendResult.success) {
      deliveryStatus = 'Sent';
      sentAt = new Date().toISOString();
    } else {
      deliveryStatus = 'Failed';
      errorMessage = sendResult.errorMessage || 'Backup notification email failed';
    }

    const logRecord: EmailLogRow = {
      EmailLogID: logId,
      RelatedLeaveRequestID: payload.fileId,
      RecipientEmail: adminEmail,
      DeliveryStatus: deliveryStatus,
      ErrorMessage: errorMessage,
      AttemptedAt: attemptedAt,
      SentAt: sentAt,
    };

    if (googleSheetsService.isLiveApiEnabled()) {
      try {
        await googleSheetsService.appendSheetRow(SHEET_NAMES.EMAIL_LOGS, [
          logRecord.EmailLogID,
          logRecord.RelatedLeaveRequestID,
          logRecord.RecipientEmail,
          logRecord.DeliveryStatus,
          logRecord.ErrorMessage,
          logRecord.AttemptedAt,
          logRecord.SentAt,
        ]);
      } catch (sheetErr: any) {
        console.error('[EmailService Error] Failed to append email log:', sheetErr.message);
      }
    }

    this.mockEmailLogs.push(logRecord);

    return {
      dispatched: deliveryStatus === 'Sent',
      log: logRecord,
    };
  }

  /**
   * Send onboarding credentials email to newly created staff member with temporary password.
   * Asks them to change their password immediately upon initial sign-in.
   */
  public async sendWelcomeCredentialsEmail(
    payload: WelcomeCredentialsEmailPayload
  ): Promise<{ dispatched: boolean; log: EmailLogRow }> {
    const logId = `EML-WLC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const attemptedAt = new Date().toISOString();
    const recipient = (payload.staffEmail || '').trim().toLowerCase();
    const loginUrl = payload.loginUrl || 'http://localhost:5173/login';
    const emailSubject = 'Welcome to TC Tracker — Your Account Credentials';

    const textBody = `
============================================================
TC TRACKER — WELCOME TO THE TEAM
============================================================

Hello ${payload.staffName},

Your staff account has been created in the TC Tracker attendance and leave portal.

YOUR LOGIN CREDENTIALS:
------------------------------------------------------------
Login ID (Email):  ${recipient}
Temporary Password: ${payload.temporaryPassword}
Portal Login URL:   ${loginUrl}

SECURITY REQUIREMENT:
For your account security, this temporary password must be changed
immediately upon your first sign-in. You will be prompted to set
a new, private password as soon as you log in.

If you have any questions, please contact your administrator.
============================================================
`.trim();

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .card { background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; max-width: 600px; margin: 0 auto; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #1e3a8a, #2563eb); color: #ffffff; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em; }
    .content { padding: 24px; }
    .greeting { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #0f172a; }
    .lead { font-size: 14px; line-height: 1.5; color: #475569; margin-bottom: 20px; }
    .credentials-box { background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 18px; margin-bottom: 20px; }
    .cred-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
    .cred-label { font-weight: 600; color: #475569; }
    .cred-value { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 700; color: #0f172a; }
    .badge-pass { background-color: #e0e7ff; color: #3730a3; padding: 4px 10px; border-radius: 4px; font-size: 15px; letter-spacing: 0.05em; display: inline-block; }
    .alert-box { background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; margin-bottom: 24px; font-size: 13px; color: #92400e; }
    .btn-container { text-align: center; margin: 24px 0; }
    .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; }
    .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>TC Tracker Portal</h1>
    </div>
    <div class="content">
      <div class="greeting">Welcome, ${escapeHtml(payload.staffName)}!</div>
      <p class="lead">An administrator has provisioned your account for the TC Tracker Attendance and Leave Portal. Below are your initial sign-in credentials:</p>
      
      <div class="credentials-box">
        <div style="margin-bottom: 12px;">
          <span class="cred-label">User ID / Email:</span><br>
          <span class="cred-value" style="font-size: 15px;">${escapeHtml(recipient)}</span>
        </div>
        <div>
          <span class="cred-label">Temporary Password:</span><br>
          <span class="badge-pass cred-value">${escapeHtml(payload.temporaryPassword)}</span>
        </div>
      </div>

      <div class="alert-box">
        <strong>Mandatory Action Required:</strong> For security reasons, you will be required to change this temporary password immediately after signing in for the first time.
      </div>

      <div class="btn-container">
        <a href="${escapeHtml(loginUrl)}" class="btn" target="_blank" rel="noopener noreferrer">Sign In to TC Tracker</a>
      </div>
    </div>
    <div class="footer">
      Automated account setup notification &bull; TC Tracker Internal Portal
    </div>
  </div>
</body>
</html>
`.trim();

    let deliveryStatus: 'Pending' | 'Sent' | 'Failed' = 'Pending';
    let errorMessage = '';
    let sentAt = '';

    if (recipient) {
      const sendResult = await this.sendDirectEmail({
        fromName: 'TC Tracker Team',
        to: recipient,
        subject: emailSubject,
        text: textBody,
        html: htmlBody,
      });

      if (sendResult.success) {
        deliveryStatus = 'Sent';
        sentAt = new Date().toISOString();
      } else {
        deliveryStatus = 'Failed';
        errorMessage = sendResult.errorMessage || 'Credentials email transmission failure';
      }
    } else {
      deliveryStatus = 'Failed';
      errorMessage = 'Recipient staff email is required.';
    }

    const logRecord: EmailLogRow = {
      EmailLogID: logId,
      RelatedLeaveRequestID: 'USER_ONBOARDING',
      RecipientEmail: recipient || 'unknown@domain.local',
      DeliveryStatus: deliveryStatus,
      ErrorMessage: errorMessage,
      AttemptedAt: attemptedAt,
      SentAt: sentAt,
    };

    if (googleSheetsService.isLiveApiEnabled()) {
      try {
        await googleSheetsService.appendSheetRow(SHEET_NAMES.EMAIL_LOGS, [
          logRecord.EmailLogID,
          logRecord.RelatedLeaveRequestID,
          logRecord.RecipientEmail,
          logRecord.DeliveryStatus,
          logRecord.ErrorMessage,
          logRecord.AttemptedAt,
          logRecord.SentAt,
        ]);
      } catch (sheetErr: any) {
        console.error('[EmailService Error] Failed to append email log:', sheetErr.message);
      }
    }

    this.mockEmailLogs.push(logRecord);

    return {
      dispatched: deliveryStatus === 'Sent',
      log: logRecord,
    };
  }

  /**
   * Send administrative password reset credentials email to an existing employee.
   * Delivers fresh temporary credentials and instructs them to set a new password upon login.
   */
  public async sendAdminPasswordResetEmail(
    payload: AdminPasswordResetEmailPayload
  ): Promise<{ dispatched: boolean; log: EmailLogRow }> {
    const logId = `EML-ADM-RST-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const attemptedAt = new Date().toISOString();
    const recipient = (payload.staffEmail || '').trim().toLowerCase();
    const loginUrl =
      payload.loginUrl ||
      (process.env.FRONTEND_URL
        ? `${process.env.FRONTEND_URL.replace(/\/+$/, '')}/login`
        : 'http://localhost:5173/login');
    const emailSubject = 'TC Tracker — Temporary Login Credentials (Password Reset)';
    const adminLabel = payload.adminName ? `Administrator (${payload.adminName})` : 'An administrator';

    const textBody = `
============================================================
TC TRACKER — TEMPORARY LOGIN CREDENTIALS
============================================================

Hello ${payload.staffName},

${adminLabel} has reset your TC Tracker account password.
Below are your new temporary login credentials:

YOUR TEMPORARY CREDENTIALS:
------------------------------------------------------------
Login ID (Email):   ${recipient}
Temporary Password: ${payload.temporaryPassword}
Portal Login URL:   ${loginUrl}

MANDATORY SECURITY REQUIREMENT:
For your account security, this temporary password must be changed
immediately upon signing in. You will be prompted to create a new,
private password as soon as you log in.

If you did not request this password reset or believe this was done in error,
please contact your administrator immediately.
============================================================
`.trim();

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .card { background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; max-width: 600px; margin: 0 auto; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #1e3a8a, #2563eb); color: #ffffff; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em; }
    .content { padding: 24px; }
    .greeting { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #0f172a; }
    .lead { font-size: 14px; line-height: 1.5; color: #475569; margin-bottom: 20px; }
    .credentials-box { background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 18px; margin-bottom: 20px; }
    .cred-label { font-weight: 600; color: #475569; font-size: 13px; }
    .cred-value { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 700; color: #0f172a; }
    .badge-pass { background-color: #e0e7ff; color: #3730a3; padding: 6px 12px; border-radius: 4px; font-size: 16px; letter-spacing: 0.05em; display: inline-block; }
    .alert-box { background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; margin-bottom: 24px; font-size: 13px; color: #92400e; }
    .btn-container { text-align: center; margin: 24px 0; }
    .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; }
    .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>TC Tracker Portal</h1>
    </div>
    <div class="content">
      <div class="greeting">Hello, ${escapeHtml(payload.staffName)}!</div>
      <p class="lead">${escapeHtml(adminLabel)} has reset your account password. Below are your new temporary sign-in credentials:</p>
      
      <div class="credentials-box">
        <div style="margin-bottom: 12px;">
          <span class="cred-label">Login ID / Email:</span><br>
          <span class="cred-value" style="font-size: 15px;">${escapeHtml(recipient)}</span>
        </div>
        <div>
          <span class="cred-label">Temporary Password:</span><br>
          <span class="badge-pass cred-value">${escapeHtml(payload.temporaryPassword)}</span>
        </div>
      </div>

      <div class="alert-box">
        <strong>Mandatory Action Required:</strong> For your security, you are required to change this temporary password immediately after signing in.
      </div>

      <div class="btn-container">
        <a href="${escapeHtml(loginUrl)}" class="btn" target="_blank" rel="noopener noreferrer">Sign In &amp; Set New Password</a>
      </div>
    </div>
    <div class="footer">
      Automated credential reset notification &bull; TC Tracker Internal Portal
    </div>
  </div>
</body>
</html>
`.trim();

    let deliveryStatus: 'Pending' | 'Sent' | 'Failed' = 'Pending';
    let errorMessage = '';
    let sentAt = '';

    if (recipient) {
      const sendResult = await this.sendDirectEmail({
        fromName: 'TC Tracker Security',
        to: recipient,
        subject: emailSubject,
        text: textBody,
        html: htmlBody,
      });

      if (sendResult.success) {
        deliveryStatus = 'Sent';
        sentAt = new Date().toISOString();
      } else {
        deliveryStatus = 'Failed';
        errorMessage = sendResult.errorMessage || 'Password reset email transmission failure';
      }
    } else {
      deliveryStatus = 'Failed';
      errorMessage = 'Recipient staff email is required.';
    }

    const logRecord: EmailLogRow = {
      EmailLogID: logId,
      RelatedLeaveRequestID: 'ADMIN_PASSWORD_RESET',
      RecipientEmail: recipient || 'unknown@domain.local',
      DeliveryStatus: deliveryStatus,
      ErrorMessage: errorMessage,
      AttemptedAt: attemptedAt,
      SentAt: sentAt,
    };

    if (googleSheetsService.isLiveApiEnabled()) {
      try {
        await googleSheetsService.appendSheetRow(SHEET_NAMES.EMAIL_LOGS, [
          logRecord.EmailLogID,
          logRecord.RelatedLeaveRequestID,
          logRecord.RecipientEmail,
          logRecord.DeliveryStatus,
          logRecord.ErrorMessage,
          logRecord.AttemptedAt,
          logRecord.SentAt,
        ]);
      } catch (sheetErr: any) {
        console.error('[EmailService Error] Failed to append email log:', sheetErr.message);
      }
    }

    this.mockEmailLogs.push(logRecord);

    return {
      dispatched: deliveryStatus === 'Sent',
      log: logRecord,
    };
  }

  /**
   * Send unified password reset email supporting BOTH strategies:
   * Strategy A: 1-Click Cryptographic Reset Link
   * Strategy B: 6-Digit One-Time Password (OTP) Code
   */
  public async sendPasswordResetEmail(
    payload: PasswordResetEmailPayload
  ): Promise<{ dispatched: boolean; log: EmailLogRow }> {
    const logId = `EML-RST-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const attemptedAt = new Date().toISOString();
    const recipient = (payload.staffEmail || '').trim().toLowerCase();
    const expiryMins = payload.expiresInMinutes || 15;
    const emailSubject = 'TC Tracker — Password Reset Request';

    const textBody = `
============================================================
TC TRACKER — PASSWORD RESET REQUEST
============================================================

Hello ${payload.staffName},

A password reset was requested for your TC Tracker account.

CHOOSE EITHER METHOD TO RESET YOUR PASSWORD:

METHOD 1: ONE-CLICK RESET LINK
Click or copy this link into your browser:
${payload.resetLink}

METHOD 2: 6-DIGIT VERIFICATION CODE (OTP)
Enter this verification code on the reset page:
>>> ${payload.otpCode} <<<

IMPORTANT:
- Both the link and code will expire in ${expiryMins} minutes.
- If you did not request this password reset, no action is needed;
  your password remains unchanged and secure.
============================================================
`.trim();

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .card { background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; max-width: 600px; margin: 0 auto; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #0284c7, #2563eb); color: #ffffff; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .content { padding: 24px; }
    .greeting { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #0f172a; }
    .lead { font-size: 14px; line-height: 1.5; color: #475569; margin-bottom: 24px; }
    .method-card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin-bottom: 20px; text-align: center; }
    .method-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 10px; }
    .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; }
    .otp-display { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 30px; font-weight: 800; letter-spacing: 6px; color: #1e3a8a; background: #e0e7ff; padding: 10px 20px; border-radius: 6px; display: inline-block; margin: 6px 0; }
    .notice { font-size: 13px; color: #64748b; line-height: 1.5; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px; }
    .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>TC Tracker Password Reset</h1>
    </div>
    <div class="content">
      <div class="greeting">Hello ${escapeHtml(payload.staffName)},</div>
      <p class="lead">We received a request to reset the password for your TC Tracker account. You can reset it using either of the two methods below:</p>
      
      <!-- Strategy A: Reset Link -->
      <div class="method-card">
        <div class="method-title">Option 1: One-Click Reset Link</div>
        <div style="margin: 12px 0;">
          <a href="${escapeHtml(payload.resetLink)}" class="btn" target="_blank" rel="noopener noreferrer">Reset My Password</a>
        </div>
        <div style="font-size: 12px; color: #94a3b8; word-break: break-all; margin-top: 8px;">
          Or copy URL: <a href="${escapeHtml(payload.resetLink)}" style="color: #3b82f6;">${escapeHtml(payload.resetLink)}</a>
        </div>
      </div>

      <!-- Strategy B: 6-Digit OTP -->
      <div class="method-card">
        <div class="method-title">Option 2: 6-Digit Verification Code</div>
        <div>
          <span class="otp-display">${escapeHtml(payload.otpCode)}</span>
        </div>
        <div style="font-size: 12px; color: #64748b; margin-top: 6px;">
          Enter this code directly on the reset password screen.
        </div>
      </div>

      <div class="notice">
        <strong>Security Notice:</strong>
        This code and link are valid for <strong>${escapeHtml(expiryMins)} minutes</strong>. If you did not request a password reset, you can safely ignore this message.
      </div>
    </div>
    <div class="footer">
      Automated security alert &bull; TC Tracker Authentication Services
    </div>
  </div>
</body>
</html>
`.trim();

    let deliveryStatus: 'Pending' | 'Sent' | 'Failed' = 'Pending';
    let errorMessage = '';
    let sentAt = '';

    if (recipient) {
      const sendResult = await this.sendDirectEmail({
        fromName: 'TC Tracker Security',
        to: recipient,
        subject: emailSubject,
        text: textBody,
        html: htmlBody,
      });

      if (sendResult.success) {
        deliveryStatus = 'Sent';
        sentAt = new Date().toISOString();
      } else {
        deliveryStatus = 'Failed';
        errorMessage = sendResult.errorMessage || 'Password reset email transmission failure';
      }
    } else {
      deliveryStatus = 'Failed';
      errorMessage = 'Recipient staff email is required.';
    }

    const logRecord: EmailLogRow = {
      EmailLogID: logId,
      RelatedLeaveRequestID: 'PASSWORD_RESET',
      RecipientEmail: recipient || 'unknown@domain.local',
      DeliveryStatus: deliveryStatus,
      ErrorMessage: errorMessage,
      AttemptedAt: attemptedAt,
      SentAt: sentAt,
    };

    if (googleSheetsService.isLiveApiEnabled()) {
      try {
        await googleSheetsService.appendSheetRow(SHEET_NAMES.EMAIL_LOGS, [
          logRecord.EmailLogID,
          logRecord.RelatedLeaveRequestID,
          logRecord.RecipientEmail,
          logRecord.DeliveryStatus,
          logRecord.ErrorMessage,
          logRecord.AttemptedAt,
          logRecord.SentAt,
        ]);
      } catch (sheetErr: any) {
        console.error('[EmailService Error] Failed to append email log:', sheetErr.message);
      }
    }

    this.mockEmailLogs.push(logRecord);

    return {
      dispatched: deliveryStatus === 'Sent',
      log: logRecord,
    };
  }

  /**
   * Retrieve all email logs (Admin view).
   */
  public async getAllEmailLogs(): Promise<EmailLogRow[]> {
    if (googleSheetsService.isLiveApiEnabled()) {
      try {
        return await googleSheetsService.getSheetRecords<EmailLogRow>(SHEET_NAMES.EMAIL_LOGS);
      } catch (err: any) {
        console.error('[EmailService Error] Failed to fetch email logs:', err.message);
        return [...this.mockEmailLogs];
      }
    }
    return [...this.mockEmailLogs];
  }

  /**
   * Live diagnostic verification of the email connection for Admin inspection on deployment.
   */
  public async verifyConnection(): Promise<{
    configured: boolean;
    gmailUser?: string;
    hasAppPassword: boolean;
    authMethod: 'Google Apps Script (HTTPS)' | 'Gmail App Password (SMTP)' | 'Custom SMTP' | 'Gmail OAuth2' | 'None';
    verified: boolean;
    portUsed?: number;
    error?: string;
    troubleshooting?: string;
  }> {
    this.reloadEnv(true);
    const gmailUser = process.env.GMAIL_USER?.replace(/^["']|["']$/g, '').trim();
    const rawPass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS;
    const hasAppPassword = Boolean(rawPass && rawPass.trim());
    const isConfigured = this.isEmailConfigured();
    const provider = this.getActiveProvider();

    if (!isConfigured || !provider) {
      return {
        configured: false,
        gmailUser: gmailUser ? `${gmailUser.substring(0, 2)}***@${gmailUser.split('@')[1] || ''}` : undefined,
        hasAppPassword,
        authMethod: 'None',
        verified: false,
        error: 'Email service credentials not configured.',
        troubleshooting: 'Please set APPS_SCRIPT_URL (recommended for cloud hosting) or GMAIL_USER and GMAIL_APP_PASSWORD in your hosting environment variables.',
      };
    }

    if (provider === 'google_script') {
      const scriptUrl = (process.env.APPS_SCRIPT_URL || process.env.GOOGLE_APPS_SCRIPT_URL)?.trim() || '';
      try {
        const res = await fetch(scriptUrl, { method: 'GET', redirect: 'follow' });
        if (res.ok) {
          return {
            configured: true,
            hasAppPassword: false,
            authMethod: 'Google Apps Script (HTTPS)',
            verified: true,
            portUsed: 443,
          };
        } else {
          return {
            configured: true,
            hasAppPassword: false,
            authMethod: 'Google Apps Script (HTTPS)',
            verified: false,
            portUsed: 443,
            error: `Google Apps Script returned HTTP ${res.status}`,
            troubleshooting: 'Please verify that your Google Apps Script Web App is deployed with "Execute as: Me" and "Who has access: Anyone".',
          };
        }
      } catch (err: any) {
        return {
          configured: true,
          hasAppPassword: false,
          authMethod: 'Google Apps Script (HTTPS)',
          verified: false,
          portUsed: 443,
          error: `Google Apps Script connection error: ${err.message}`,
          troubleshooting: 'Ensure the APPS_SCRIPT_URL is reachable and deployed as a Web App.',
        };
      }
    }

    if (provider === 'gmail_api') {
      return {
        configured: true,
        hasAppPassword: false,
        authMethod: 'Gmail OAuth2',
        verified: true,
        portUsed: 443,
      };
    }

    // SMTP Fallback
    const authMethod = (gmailUser && hasAppPassword)
      ? 'Gmail App Password (SMTP)'
      : process.env.SMTP_HOST
      ? 'Custom SMTP'
      : 'Gmail OAuth2';

    const maskedUser = gmailUser
      ? `${gmailUser.substring(0, 2)}***@${gmailUser.split('@')[1] || ''}`
      : undefined;

    // Test primary port first, then alternative port
    const primaryPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465;
    const fallbackPort = primaryPort === 465 ? 587 : 465;
    const portsToTry = [primaryPort, fallbackPort];

    let lastError = '';
    for (const port of portsToTry) {
      const transporterObj = this.getNodemailerTransporter(port);
      if (!transporterObj) continue;

      try {
        await transporterObj.transporter.verify();
        return {
          configured: true,
          gmailUser: maskedUser,
          hasAppPassword,
          authMethod,
          verified: true,
          portUsed: port,
        };
      } catch (err: any) {
        lastError = this.formatSmtpError(err);
      }
    }

    return {
      configured: true,
      gmailUser: maskedUser,
      hasAppPassword,
      authMethod,
      verified: false,
      error: lastError,
      troubleshooting: lastError.includes('535')
        ? 'Google rejected your App Password. Confirm that 2-Step Verification is active on that Google account, generate a new 16-character App Password at https://myaccount.google.com/apppasswords, and check Google Security Alerts to approve sign-in from your cloud deployment.'
        : lastError.includes('Timed Out')
        ? 'Connection to Google SMTP timed out on ports 465 and 587. The hosting platform firewall blocks outbound SMTP. Recommended Solution: Add APPS_SCRIPT_URL in your hosting environment variables (e.g., Render Dashboard) to send emails via Google Apps Script (HTTPS port 443) without firewall blocking.'
        : 'Verify your email settings and network connectivity.',
    };
  }
}

export const emailService = new EmailService();
