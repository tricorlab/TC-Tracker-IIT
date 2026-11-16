import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { leaveService } from '../services/leave.service.js';
import { emailService } from '../services/email.service.js';
import { userService } from '../services/userService.js';
import { UserRow } from '../types/database.types.js';

describe('--- [LEAVE NOTIFICATION TEST SUITE] Email Notifications to Admin & Manager ---', () => {
  const staffUser: UserRow = {
    UserID: 'USR-STAFF-100',
    FullName: 'Alice Staff',
    Email: 'alice@institution.edu',
    Role: 'Staff',
    JoiningDate: '2025-01-01',
    IsActive: 'TRUE',
    CreatedAt: '2025-01-01T00:00:00Z',
    UpdatedAt: '2025-01-01T00:00:00Z',
  };

  const adminUser: UserRow = {
    UserID: 'USR-ADMIN-100',
    FullName: 'Arthur Admin',
    Email: 'admin@institution.edu',
    Role: 'Admin',
    JoiningDate: '2024-01-01',
    IsActive: 'TRUE',
    CreatedAt: '2024-01-01T00:00:00Z',
    UpdatedAt: '2024-01-01T00:00:00Z',
  };

  const managerUser: UserRow = {
    UserID: 'USR-MGR-100',
    FullName: 'Mary Admin',
    Email: 'manager@institution.edu',
    Role: 'Admin',
    JoiningDate: '2024-01-01',
    IsActive: 'TRUE',
    CreatedAt: '2024-01-01T00:00:00Z',
    UpdatedAt: '2024-01-01T00:00:00Z',
  };

  const savedAdminGmail = process.env.ADMIN_GMAIL;
  const savedAdminEmail = process.env.ADMIN_EMAIL;

  beforeEach(() => {
    delete process.env.ADMIN_GMAIL;
    delete process.env.ADMIN_EMAIL;
    leaveService.clearMockData();
    emailService.clearMockEmailLogs();
    emailService.setCustomDispatcher(null);

    userService.setMockUser(staffUser);
    userService.setMockUser(adminUser);
    userService.setMockUser(managerUser);

    leaveService.setMockBalances([
      {
        LeaveBalanceID: 'BAL-2026-STAFF-100',
        UserID: 'USR-STAFF-100',
        CalendarYear: 2026,
        EarnedLeave: 15.0,
        CarriedForward: 0,
        UsedLeave: 0,
        AvailableLeave: 15.0,
        UpdatedAt: new Date().toISOString(),
      },
    ]);
  });

  it('1. Staff leave request is saved and notifications are dispatched to both Admin and Manager', async () => {
    const dispatchedEmails: Array<{ to: string; subject: string; text: string; html: string }> = [];

    emailService.setCustomDispatcher(async (opts) => {
      dispatchedEmails.push(opts);
    });

    const result = await leaveService.submitLeaveRequest('USR-STAFF-100', {
      leaveType: 'Annual',
      startDate: '2026-11-09',
      endDate: '2026-11-11',
      reason: 'Personal travel and rest',
    });

    // 1. Leave request is saved
    assert.ok(result.request.LeaveRequestID);
    assert.equal(result.request.UserID, 'USR-STAFF-100');
    assert.equal(result.request.NotificationStatus, 'Sent');
    assert.equal(result.calculatedDays, 3);

    // 2. Verified saved in user's requests ledger
    const saved = await leaveService.getUserRequests('USR-STAFF-100');
    assert.equal(saved.length, 1);
    assert.equal(saved[0].LeaveRequestID, result.request.LeaveRequestID);

    // 3. Emails dispatched to both Admin and Manager
    assert.equal(dispatchedEmails.length, 2);
    const recipients = dispatchedEmails.map((d) => d.to);
    assert.ok(recipients.includes('admin@institution.edu'), 'Must notify Admin');
    assert.ok(recipients.includes('manager@institution.edu'), 'Must notify Manager');

    // 4. Verify Subject line
    for (const msg of dispatchedEmails) {
      assert.equal(msg.subject, 'TC Tracker — New Leave Request');
      // Verify required details in HTML and text
      assert.ok(msg.html.includes('Alice Staff'));
      assert.ok(msg.html.includes('alice@institution.edu'));
      assert.ok(msg.html.includes('2026-11-09'));
      assert.ok(msg.html.includes('2026-11-11'));
      assert.ok(msg.html.includes('3 day(s)'));
      assert.ok(msg.html.includes('Personal travel and rest'));
      assert.ok(msg.html.includes(result.request.LeaveRequestID));

      assert.ok(msg.text.includes('Alice Staff'));
      assert.ok(msg.text.includes('alice@institution.edu'));

      // Verify no approval/rejection buttons exist
      assert.equal(msg.html.includes('Approve'), false);
      assert.equal(msg.html.includes('Reject'), false);
    }
  });

  it('2. If Admin and Manager email addresses are identical, send only one email (deduplication)', async () => {
    // Both Admin and Manager have identical email
    const singleInboxAdmin: UserRow = {
      ...adminUser,
      Email: 'management@institution.edu',
    };
    const singleInboxManager: UserRow = {
      ...managerUser,
      Email: 'MANAGEMENT@institution.edu', // Case insensitive deduplication
    };

    userService.setMockUser(singleInboxAdmin);
    userService.setMockUser(singleInboxManager);

    const dispatchedEmails: string[] = [];
    emailService.setCustomDispatcher(async (opts) => {
      dispatchedEmails.push(opts.to);
    });

    const result = await leaveService.submitLeaveRequest('USR-STAFF-100', {
      leaveType: 'Casual',
      startDate: '2026-11-16',
      endDate: '2026-11-17',
      reason: 'Urgent errand',
    });

    assert.ok(result.request.LeaveRequestID);
    // Exactly 1 email sent despite 2 management accounts having the same email address
    assert.equal(dispatchedEmails.length, 1);
    assert.equal(dispatchedEmails[0], 'management@institution.edu');

    // Exactly 1 log entry in EmailLogs
    const logs = emailService.getMockEmailLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].RecipientEmail, 'management@institution.edu');
    assert.equal(logs[0].DeliveryStatus, 'Sent');
  });

  it('3. Inactive Admin or Manager accounts are excluded from notifications', async () => {
    const inactiveManager: UserRow = {
      ...managerUser,
      IsActive: 'FALSE',
      Email: 'inactive.mgr@institution.edu',
    };
    userService.setMockUser(inactiveManager);

    const dispatchedEmails: string[] = [];
    emailService.setCustomDispatcher(async (opts) => {
      dispatchedEmails.push(opts.to);
    });

    await leaveService.submitLeaveRequest('USR-STAFF-100', {
      leaveType: 'Casual',
      startDate: '2026-11-18',
      endDate: '2026-11-18',
      reason: 'Doctor checkup',
    });

    // Only active Admin should receive email; inactive manager excluded
    assert.equal(dispatchedEmails.length, 1);
    assert.equal(dispatchedEmails[0], 'admin@institution.edu');
    assert.ok(!dispatchedEmails.includes('inactive.mgr@institution.edu'));
  });

  it('4. Email transmission failure does NOT delete or roll back the saved leave request', async () => {
    // Simulate SMTP/API connection failure
    emailService.setCustomDispatcher(async () => {
      throw new Error('ECONNREFUSED: Connection refused by mail server');
    });

    const result = await leaveService.submitLeaveRequest('USR-STAFF-100', {
      leaveType: 'Medical',
      startDate: '2026-11-23',
      endDate: '2026-11-25',
      reason: 'Medical treatment',
    });

    // Leave request was successfully preserved in the ledger
    assert.ok(result.request.LeaveRequestID);
    assert.equal(result.request.NotificationStatus, 'Failed');
    assert.equal(result.emailNotification?.sent, false);

    // Request is queryable in user requests
    const saved = await leaveService.getUserRequests('USR-STAFF-100');
    assert.equal(saved.length, 1);
    assert.equal(saved[0].LeaveRequestID, result.request.LeaveRequestID);

    // Logs recorded as Failed with sanitized error message
    const logs = emailService.getMockEmailLogs();
    assert.equal(logs.length, 2);
    for (const log of logs) {
      assert.equal(log.DeliveryStatus, 'Failed');
      assert.ok(log.ErrorMessage.includes('ECONNREFUSED'));
      assert.equal(log.SentAt, '');
    }
  });

  it('5. EmailLogs records delivery outcomes (success/failure) with timestamps', async () => {
    emailService.setCustomDispatcher(async (opts) => {
      if (opts.to === 'manager@institution.edu') {
        throw new Error('Mailbox quota exceeded for manager');
      }
    });

    const result = await leaveService.submitLeaveRequest('USR-STAFF-100', {
      leaveType: 'Casual',
      startDate: '2026-11-30',
      endDate: '2026-11-30',
      reason: 'Day off',
    });

    assert.ok(result.request.LeaveRequestID);

    const logs = emailService.getMockEmailLogs();
    const adminLog = logs.find((l) => l.RecipientEmail === 'admin@institution.edu');
    const mgrLog = logs.find((l) => l.RecipientEmail === 'manager@institution.edu');

    assert.ok(adminLog);
    assert.equal(adminLog.DeliveryStatus, 'Sent');
    assert.ok(adminLog.SentAt.length > 0);
    assert.equal(adminLog.ErrorMessage, '');

    assert.ok(mgrLog);
    assert.equal(mgrLog.DeliveryStatus, 'Failed');
    assert.equal(mgrLog.SentAt, '');
    assert.ok(mgrLog.ErrorMessage.includes('Mailbox quota exceeded'));
  });

  it('6. Staff cannot manipulate recipients via frontend or submission parameters', async () => {
    const dispatchedEmails: string[] = [];
    emailService.setCustomDispatcher(async (opts) => {
      dispatchedEmails.push(opts.to);
    });

    // Attempt to pass malicious recipient overrides in request data
    const maliciousPayload: any = {
      leaveType: 'Annual',
      startDate: '2026-12-01',
      endDate: '2026-12-02',
      reason: 'Holiday',
      recipientEmail: 'attacker@evil.com',
      to: 'external@spoofed.com',
      adminEmail: 'hacker@malicious.com',
    };

    await leaveService.submitLeaveRequest('USR-STAFF-100', maliciousPayload);

    // Recipients must strictly match the authorized Admin & Manager from Users worksheet
    assert.ok(!dispatchedEmails.includes('attacker@evil.com'));
    assert.ok(!dispatchedEmails.includes('external@spoofed.com'));
    assert.ok(!dispatchedEmails.includes('hacker@malicious.com'));
    assert.ok(dispatchedEmails.includes('admin@institution.edu'));
    assert.ok(dispatchedEmails.includes('manager@institution.edu'));
  });

  it('7. HTML and plain-text templates include all required fields and informational notice', () => {
    const payload = {
      leaveRequestId: 'LRQ-2026-999',
      staffName: 'Bob Staff',
      staffEmail: 'bob@institution.edu',
      leaveType: 'Emergency',
      startDate: '2026-12-10',
      endDate: '2026-12-12',
      calculatedDays: 3,
      reason: 'Family emergency',
      submittedAt: '2026-12-05T08:30:00.000Z',
    };

    const html = emailService.generateHtmlEmail(payload);
    const text = emailService.generatePlainTextEmail(payload);

    for (const body of [html, text]) {
      assert.ok(body.includes('Bob Staff'), 'Must include staff name');
      assert.ok(body.includes('bob@institution.edu'), 'Must include staff email');
      assert.ok(body.includes('LRQ-2026-999'), 'Must include leaveRequestId');
      assert.ok(body.includes('Emergency'), 'Must include leaveType');
      assert.ok(body.includes('2026-12-10'), 'Must include startDate');
      assert.ok(body.includes('2026-12-12'), 'Must include endDate');
      assert.ok(body.includes('3 day(s)'), 'Must include calculatedDays');
      assert.ok(body.includes('Family emergency'), 'Must include reason');
      assert.ok(body.includes('2026-12-05T08:30:00.000Z'), 'Must include submittedAt');
      assert.ok(body.includes('informational notification'), 'Must include informational policy notice');
      assert.ok(body.includes('without an approval or rejection workflow'), 'Must explicitly mention no approval/rejection workflow');
    }
  });

  it('8. ADMIN_GMAIL environment variable is included in recipients list', async () => {
    const originalAdminGmail = process.env.ADMIN_GMAIL;
    process.env.ADMIN_GMAIL = 'head.admin@gmail.com';

    try {
      const dispatchedEmails: string[] = [];
      emailService.setCustomDispatcher(async (opts) => {
        dispatchedEmails.push(opts.to);
      });

      await leaveService.submitLeaveRequest('USR-STAFF-100', {
        leaveType: 'Casual',
        startDate: '2026-12-15',
        endDate: '2026-12-16',
        reason: 'Personal work',
      });

      // Must include head.admin@gmail.com alongside database admins
      assert.ok(dispatchedEmails.includes('head.admin@gmail.com'), 'Must send to ADMIN_GMAIL');
      assert.ok(dispatchedEmails.includes('admin@institution.edu'), 'Must send to database Admin');
    } finally {
      if (originalAdminGmail !== undefined) {
        process.env.ADMIN_GMAIL = originalAdminGmail;
      } else {
        delete process.env.ADMIN_GMAIL;
      }
    }
  });

  it('9. isEmailConfigured recognizes Gmail App Password and Nodemailer transporter creation', () => {
    const origUser = process.env.GMAIL_USER;
    const origPass = process.env.GMAIL_APP_PASSWORD;

    try {
      process.env.GMAIL_USER = 'institute.leave@gmail.com';
      process.env.GMAIL_APP_PASSWORD = 'abcd efgh ijkl mnop';

      assert.strictEqual(emailService.isEmailConfigured(), true);
      const transporterObj = emailService.getNodemailerTransporter();
      assert.ok(transporterObj);
      assert.strictEqual(transporterObj.from, 'institute.leave@gmail.com');
      assert.ok(transporterObj.transporter);
    } finally {
      if (origUser !== undefined) process.env.GMAIL_USER = origUser;
      else delete process.env.GMAIL_USER;
      if (origPass !== undefined) process.env.GMAIL_APP_PASSWORD = origPass;
      else delete process.env.GMAIL_APP_PASSWORD;
    }
  });

  it('10. Formal email contains formal institutional letterhead, salutation, and sign-off', () => {
    const payload = {
      leaveRequestId: 'LRQ-2026-FORMAL-01',
      staffName: 'Dr. Sarah Connor',
      staffEmail: 'sarah.connor@institution.edu',
      leaveType: 'Casual Leave',
      startDate: '2026-12-20',
      endDate: '2026-12-22',
      calculatedDays: 3,
      reason: 'Attending Academic Conference',
      submittedAt: '2026-12-14T09:00:00.000Z',
    };

    const html = emailService.generateHtmlEmail(payload);
    const text = emailService.generatePlainTextEmail(payload);

    // Verify formal salutation
    assert.ok(html.includes('Dear Administrator'), 'HTML must have formal salutation');
    assert.ok(text.includes('Dear Administrator'), 'Text must have formal salutation');

    // Verify formal sign-off
    assert.ok(html.includes('Yours faithfully'), 'HTML must have formal sign-off');
    assert.ok(text.includes('Yours faithfully'), 'Text must have formal sign-off');

    // Verify formal header and title
    assert.ok(html.includes('TC Tracker &bull; Leave Management'), 'HTML must include formal title');
    assert.ok(text.includes('TC TRACKER — FORMAL LEAVE APPLICATION'), 'Text must include formal title');
  });

  after(() => {
    if (savedAdminGmail !== undefined) process.env.ADMIN_GMAIL = savedAdminGmail;
    else delete process.env.ADMIN_GMAIL;
    if (savedAdminEmail !== undefined) process.env.ADMIN_EMAIL = savedAdminEmail;
    else delete process.env.ADMIN_EMAIL;
  });
});
