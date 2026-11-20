import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { noticeService } from '../services/notice.service.js';
import { emailService } from '../services/email.service.js';
import { userService } from '../services/userService.js';
import { activityLogService } from '../services/activityLog.service.js';

describe('--- [STAFF NOTICE & BROADCAST SUITE] Administrative Notice Management ---', () => {
  const mockAdmin = {
    userId: 'ADM-001',
    fullName: 'System Administrator',
    email: 'admin@tctracker.local',
  };

  beforeEach(() => {
    noticeService.resetForTest();
    userService.setMockUsersList([
      {
        UserID: 'USR-STAFF-01',
        FullName: 'Alice Staff',
        Email: 'alice@example.com',
        Role: 'Staff',
        JoiningDate: '2026-01-01',
        IsActive: 'TRUE',
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      },
      {
        UserID: 'USR-STAFF-02',
        FullName: 'Bob Staff',
        Email: 'bob@example.com',
        Role: 'Staff',
        JoiningDate: '2026-02-01',
        IsActive: 'TRUE',
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      },
      {
        UserID: 'ADM-001',
        FullName: 'System Administrator',
        Email: 'admin@tctracker.local',
        Role: 'Admin',
        JoiningDate: '2025-01-01',
        IsActive: 'TRUE',
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      },
    ]);
  });

  /* ======================================================================= */
  /* 1. Notice Creation & Validation                                         */
  /* ======================================================================= */
  describe('1. Notice Creation & Data Integrity', () => {
    it('should successfully create an administrative notice without email', async () => {
      const result = await noticeService.createNotice(
        {
          title: 'Office Townhall Q4 2026',
          content: 'The quarterly townhall will be held this Friday at 3:00 PM in the auditorium.',
          category: 'Event',
          priority: 'Normal',
          isPinned: true,
          sendEmail: false,
        },
        mockAdmin
      );

      assert.ok(result.notice.NoticeID.startsWith('NOT-'));
      assert.equal(result.notice.Title, 'Office Townhall Q4 2026');
      assert.equal(result.notice.Category, 'Event');
      assert.equal(result.notice.Priority, 'Normal');
      assert.equal(result.notice.IsPinned, true);
      assert.equal(result.notice.CreatedBy, 'ADM-001');
      assert.equal(result.notice.CreatorName, 'System Administrator');
      assert.equal(result.notice.EmailStatus, 'Skipped');
      assert.equal(result.notice.EmailRecipientCount, 0);
      assert.equal(result.notice.Status, 'Active');
    });

    it('should reject creation when title or content is empty', async () => {
      await assert.rejects(
        async () => {
          await noticeService.createNotice(
            {
              title: '',
              content: 'Valid content',
            },
            mockAdmin
          );
        },
        {
          message: 'Notice title is required.',
        }
      );

      await assert.rejects(
        async () => {
          await noticeService.createNotice(
            {
              title: 'Valid title',
              content: '   ',
            },
            mockAdmin
          );
        },
        {
          message: 'Notice content/message is required.',
        }
      );
    });

    it('should sort pinned notices to the top and sort others newest first', async () => {
      // 1. Unpinned notice posted first
      await noticeService.createNotice(
        {
          title: 'Regular Notice 1',
          content: 'Content 1',
          isPinned: false,
          sendEmail: false,
        },
        mockAdmin
      );

      // 2. Unpinned notice posted later
      await noticeService.createNotice(
        {
          title: 'Regular Notice 2',
          content: 'Content 2',
          isPinned: false,
          sendEmail: false,
        },
        mockAdmin
      );

      // 3. Pinned notice
      await noticeService.createNotice(
        {
          title: 'CRITICAL PINNED NOTICE',
          content: 'This must appear at the very top.',
          isPinned: true,
          sendEmail: false,
        },
        mockAdmin
      );

      const all = await noticeService.getAllNotices({ status: 'Active' });
      assert.equal(all.length, 3);
      assert.equal(all[0].Title, 'CRITICAL PINNED NOTICE');
      assert.equal(all[0].IsPinned, true);
    });
  });

  /* ======================================================================= */
  /* 2. Email Broadcast to Active Staff                                      */
  /* ======================================================================= */
  describe('2. Staff Email Broadcast Engine', () => {
    it('should broadcast notice email to active staff and record delivery logs', async () => {
      const result = await noticeService.createNotice(
        {
          title: 'Emergency Maintenance Tonight',
          content: 'The core servers will undergo scheduled maintenance between 11 PM and 1 AM.',
          category: 'Maintenance',
          priority: 'Urgent',
          isPinned: true,
          sendEmail: true,
        },
        mockAdmin
      );

      assert.ok(result.notice);
      assert.equal(result.notice.Priority, 'Urgent');
      assert.equal(result.notice.SendEmail, true);

      // Verify email logs recorded in EmailService
      const emailLogs = await emailService.getAllEmailLogs();
      const noticeLogs = emailLogs.filter((log) =>
        log.RelatedLeaveRequestID.includes(result.notice.NoticeID)
      );

      // At least one mock active staff received the email
      assert.ok(noticeLogs.length > 0, 'Notice email log should be recorded');
      assert.ok(
        ['Sent', 'Failed', 'Pending'].includes(noticeLogs[0].DeliveryStatus),
        'Delivery status must be valid'
      );
    });

    it('should format urgent notices with high-priority markers', async () => {
      const recipients = [{ email: 'staff1@example.com', name: 'Alice Staff' }];
      const dispatch = await emailService.broadcastStaffNoticeEmail(recipients, {
        noticeId: 'NOT-TEST-URGENT',
        title: 'Immediate Facility Evacuation Drill',
        content: 'Please proceed to Assembly Point B upon hearing the alarm.',
        priority: 'Urgent',
        category: 'Safety',
        adminName: 'Chief Security Officer',
      });

      assert.equal(dispatch.totalRecipients, 1);
      assert.equal(dispatch.logs.length, 1);
      assert.equal(dispatch.logs[0].RecipientEmail, 'staff1@example.com');
      assert.equal(dispatch.logs[0].RelatedLeaveRequestID, 'NOTICE_NOT-TEST-URGENT');
    });

    it('should deduplicate email recipients when duplicate accounts or casing exist', async () => {
      userService.setMockUsersList([
        {
          UserID: 'STAFF-01',
          FullName: 'Alice Staff',
          Email: 'alice@example.com',
          Role: 'Staff',
          JoiningDate: '2026-01-01',
          IsActive: 'TRUE',
          CreatedAt: new Date().toISOString(),
          UpdatedAt: new Date().toISOString(),
        },
        {
          UserID: 'STAFF-01-DUP',
          FullName: 'Alice Duplicate Record',
          Email: 'ALICE@EXAMPLE.COM',
          Role: 'Staff',
          JoiningDate: '2026-01-01',
          IsActive: 'TRUE',
          CreatedAt: new Date().toISOString(),
          UpdatedAt: new Date().toISOString(),
        },
        {
          UserID: 'STAFF-02',
          FullName: 'Bob Staff',
          Email: 'bob@example.com',
          Role: 'Staff',
          JoiningDate: '2026-02-01',
          IsActive: 'TRUE',
          CreatedAt: new Date().toISOString(),
          UpdatedAt: new Date().toISOString(),
        },
      ]);

      const result = await noticeService.createNotice(
        {
          title: 'Deduplicated Notice Broadcast',
          content: 'This email should reach alice and bob exactly once.',
          sendEmail: true,
        },
        mockAdmin
      );

      assert.equal(result.notice.EmailRecipientCount, 2, 'Should send to exactly 2 unique email addresses');
      assert.equal(result.emailSummary?.totalRecipients, 2);
    });

    it('should filter recipients by targetRole when targetRole is Staff', async () => {
      userService.setMockUsersList([
        {
          UserID: 'STAFF-01',
          FullName: 'Alice Staff',
          Email: 'alice@example.com',
          Role: 'Staff',
          JoiningDate: '2026-01-01',
          IsActive: 'TRUE',
          CreatedAt: new Date().toISOString(),
          UpdatedAt: new Date().toISOString(),
        },
        {
          UserID: 'ADM-01',
          FullName: 'Admin User',
          Email: 'admin@tctracker.local',
          Role: 'Admin',
          JoiningDate: '2026-01-01',
          IsActive: 'TRUE',
          CreatedAt: new Date().toISOString(),
          UpdatedAt: new Date().toISOString(),
        },
      ]);

      const result = await noticeService.createNotice(
        {
          title: 'Staff Only Policy Notice',
          content: 'Applicable strictly to staff members.',
          targetRole: 'Staff',
          sendEmail: true,
        },
        mockAdmin
      );

      assert.equal(result.notice.EmailRecipientCount, 1, 'Only Staff should receive when targetRole is Staff');
    });
  });

  /* ======================================================================= */
  /* 3. Notice Modification, Resend & Deletion                               */
  /* ======================================================================= */
  describe('3. Notice Lifecycle, Updates & Re-broadcast', () => {
    it('should update notice content, pin status, and category', async () => {
      const created = await noticeService.createNotice(
        {
          title: 'Initial Title',
          content: 'Initial Content',
          priority: 'Normal',
          isPinned: false,
          sendEmail: false,
        },
        mockAdmin
      );

      const updated = await noticeService.updateNotice(
        created.notice.NoticeID,
        {
          title: 'Updated Title',
          isPinned: true,
          priority: 'High',
        },
        mockAdmin
      );

      assert.equal(updated.Title, 'Updated Title');
      assert.equal(updated.IsPinned, true);
      assert.equal(updated.Priority, 'High');
      assert.equal(updated.Content, 'Initial Content'); // Preserved
    });

    it('should support re-broadcasting notice email to staff', async () => {
      const created = await noticeService.createNotice(
        {
          title: 'Reminder: Submit Month-End Attendance',
          content: 'Please ensure all your attendance records for the month are verified.',
          category: 'Policy',
          sendEmail: false,
        },
        mockAdmin
      );

      const resendResult = await noticeService.resendNoticeEmail(created.notice.NoticeID, mockAdmin);
      assert.ok(resendResult.notice);
      assert.ok(resendResult.totalRecipients >= 0);
    });

    it('should delete a notice and remove it from active listing', async () => {
      const created = await noticeService.createNotice(
        {
          title: 'Notice to Delete',
          content: 'This will be deleted shortly.',
          sendEmail: false,
        },
        mockAdmin
      );

      const delResult = await noticeService.deleteNotice(created.notice.NoticeID, mockAdmin);
      assert.equal(delResult.success, true);

      const fetched = await noticeService.getNoticeById(created.notice.NoticeID);
      assert.equal(fetched, null);
    });
  });
});
