import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { emailService } from '../services/email.service.js';

async function main() {
  console.log('====================================================');
  console.log('TC Tracker — Email Configuration & Connection Test');
  console.log('====================================================');

  const resendKey = process.env.RESEND_API_KEY?.trim();
  const brevoKey = process.env.BREVO_API_KEY?.trim();
  const gmailUser = process.env.GMAIL_USER?.trim();
  const gmailPass = (process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS)?.trim();
  const adminGmail = (process.env.ADMIN_GMAIL || process.env.ADMIN_EMAIL)?.trim();
  const provider = emailService.getActiveProvider();

  const maskEmail = (em?: string) => {
    if (!em) return '<NOT SET>';
    const parts = em.split('@');
    if (parts.length < 2) return '***';
    const name = parts[0];
    const visible = name.length > 2 ? name.substring(0, 2) : name[0];
    return `${visible}***@${parts[1]}`;
  };

  const maskSecret = (sec?: string) => {
    if (!sec) return '<NOT SET>';
    if (sec.length <= 8) return '********';
    return `${sec.substring(0, 4)}...${sec.substring(sec.length - 4)} (${sec.length} chars)`;
  };

  console.log(`Active Provider    : ${provider ? provider.toUpperCase() : '<NONE>'}`);
  console.log(`RESEND_API_KEY     : ${maskSecret(resendKey)}`);
  console.log(`BREVO_API_KEY      : ${maskSecret(brevoKey)}`);
  console.log(`GMAIL_USER         : ${maskEmail(gmailUser)}`);
  console.log(`GMAIL_APP_PASSWORD : ${gmailPass ? `CONFIGURED (${gmailPass.length} chars)` : '<NOT SET>'}`);
  console.log(`ADMIN_GMAIL        : ${maskEmail(adminGmail)}`);
  console.log(`isEmailConfigured  : ${emailService.isEmailConfigured()}`);
  console.log('----------------------------------------------------');

  if (!emailService.isEmailConfigured()) {
    console.error('ERROR: Email is not fully configured. Please set RESEND_API_KEY (recommended for cloud hosting) or GMAIL_USER and GMAIL_APP_PASSWORD in backend/.env');
    process.exit(1);
  }

  console.log(`Verifying connection for active provider (${provider})...`);
  const diag = await emailService.verifyConnection();

  if (!diag.verified) {
    console.error(`Verification Failed: ${diag.error}`);
    if (diag.troubleshooting) {
      console.error(`Troubleshooting: ${diag.troubleshooting}`);
    }
    process.exit(1);
  }

  console.log(`SUCCESS: ${diag.authMethod} connection verified successfully (Port ${diag.portUsed || 443})!`);

  if (adminGmail) {
    console.log(`Sending a test formal leave notification email to Admin (${maskEmail(adminGmail)})...`);
    const testPayload = {
      leaveRequestId: `TEST-INIT-${Date.now()}`,
      staffName: 'TC Tracker Verification Test',
      staffEmail: gmailUser || 'test@tc-tracker.local',
      leaveType: 'Casual Leave',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
      calculatedDays: 1,
      reason: 'Automated email configuration and connectivity verification',
      submittedAt: new Date().toISOString(),
    };

    const textBody = emailService.generatePlainTextEmail(testPayload);
    const htmlBody = emailService.generateHtmlEmail(testPayload);

    const sendResult = await emailService.sendDirectEmail({
      fromName: 'TC Tracker Leave Management',
      to: adminGmail,
      replyTo: testPayload.staffEmail ? `"${testPayload.staffName}" <${testPayload.staffEmail}>` : undefined,
      subject: 'TC Tracker — New Leave Request (Configuration Verification)',
      text: textBody,
      html: htmlBody,
    });

    if (sendResult.success) {
      console.log(`SUCCESS: Test formal leave email delivered to Admin's email!`);
    } else {
      console.error(`Send Email Failed: ${sendResult.errorMessage}`);
      process.exit(1);
    }
  } else {
    console.log('NOTE: ADMIN_GMAIL is not explicitly set; leave notifications target active Admins from the database.');
  }

  console.log('====================================================');
  console.log('Verification completed successfully!');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('Fatal error during email verification:', err);
  process.exit(1);
});
