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

  const gmailUser = process.env.GMAIL_USER?.trim();
  const gmailPass = (process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS)?.trim();
  const adminGmail = (process.env.ADMIN_GMAIL || process.env.ADMIN_EMAIL)?.trim();

  // Masked diagnostic display (protecting user credentials)
  const maskEmail = (em?: string) => {
    if (!em) return '<NOT SET>';
    const parts = em.split('@');
    if (parts.length < 2) return '***';
    const name = parts[0];
    const visible = name.length > 2 ? name.substring(0, 2) : name[0];
    return `${visible}***@${parts[1]}`;
  };

  console.log(`GMAIL_USER         : ${maskEmail(gmailUser)}`);
  console.log(`GMAIL_APP_PASSWORD : ${gmailPass ? `CONFIGURED (${gmailPass.length} chars, spaces removed: ${gmailPass.replace(/\s+/g, '').length})` : '<NOT SET>'}`);
  console.log(`ADMIN_GMAIL        : ${maskEmail(adminGmail)}`);
  console.log(`isEmailConfigured  : ${emailService.isEmailConfigured()}`);
  console.log('----------------------------------------------------');

  if (!emailService.isEmailConfigured()) {
    console.error('ERROR: Email is not fully configured. Please ensure GMAIL_USER and GMAIL_APP_PASSWORD are set in backend/.env');
    process.exit(1);
  }

  const transporterObj = emailService.getNodemailerTransporter();
  if (!transporterObj) {
    console.error('ERROR: Failed to initialize Nodemailer transporter.');
    process.exit(1);
  }

  console.log(`Verifying SMTP connection to Google Mail server (${transporterObj.from})...`);

  try {
    await transporterObj.transporter.verify();
    console.log('SUCCESS: Nodemailer successfully authenticated with Gmail SMTP servers!');
  } catch (verifyErr: any) {
    console.error(`SMTP Verification Failed: ${verifyErr.message}`);
    if (verifyErr.code === 'EAUTH') {
      console.error('Hint: Google rejected authentication. Verify that 2-Step Verification is active and the 16-character App Password is correct.');
    }
    process.exit(1);
  }

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

    try {
      const info = await transporterObj.transporter.sendMail({
        from: `"TC Tracker Leave Management" <${transporterObj.from}>`,
        to: adminGmail,
        replyTo: testPayload.staffEmail ? `"${testPayload.staffName}" <${testPayload.staffEmail}>` : undefined,
        subject: 'TC Tracker — New Leave Request (Configuration Verification)',
        text: textBody,
        html: htmlBody,
      });

      console.log(`SUCCESS: Test formal leave email delivered to Admin's Gmail!`);
      console.log(`Message ID: ${info.messageId}`);
      console.log(`Accepted: ${JSON.stringify(info.accepted)}`);
    } catch (sendErr: any) {
      console.error(`Send Email Failed: ${sendErr.message}`);
      process.exit(1);
    }
  } else {
    console.log('NOTE: ADMIN_GMAIL is not explicitly set; emails will target active Admins from the Users worksheet.');
  }

  console.log('====================================================');
  console.log('Verification completed successfully!');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('Fatal error during email verification:', err);
  process.exit(1);
});
