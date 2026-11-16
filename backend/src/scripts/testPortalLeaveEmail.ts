import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { emailService } from '../services/email.service.js';

async function main() {
  console.log('Testing live leave submission notification via emailService...');
  
  const payload = {
    leaveRequestId: 'LRQ-1794637173802-59',
    staffName: 'Staff Member (USR-001)',
    staffEmail: 'akshaysreedharan07@gmail.com',
    leaveType: 'Casual',
    startDate: '2026-11-21',
    endDate: '2026-11-23',
    calculatedDays: 2,
    reason: 'due to some personal reason',
    submittedAt: new Date().toISOString(),
  };

  const result = await emailService.sendLeaveSubmissionNotifications(payload);
  console.log(`Dispatched count: ${result.dispatchedCount}`);
  console.log(`Logs generated:`, JSON.stringify(result.logs, null, 2));

  if (result.dispatchedCount > 0) {
    console.log('SUCCESS: Live leave email sent to admin!');
  } else {
    console.error('FAILED: No emails were dispatched.');
  }
}

main().catch(console.error);
