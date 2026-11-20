import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { googleSheetsService } from './googleSheets.service.js';
import { userService } from './userService.js';
import { emailService } from './email.service.js';
import { activityLogService } from './activityLog.service.js';
import { NoticeRow } from '../types/database.types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const NOTICES_FILE = path.join(DATA_DIR, 'notices.json');

export const NOTICES_SHEET_NAME = 'Notices';
export const NOTICE_HEADERS = [
  'NoticeID',
  'Title',
  'Content',
  'Category',
  'Priority',
  'TargetRole',
  'CreatedBy',
  'CreatorName',
  'CreatedAt',
  'ExpiresAt',
  'IsPinned',
  'SendEmail',
  'EmailStatus',
  'EmailRecipientCount',
  'Status',
] as const;

export interface CreateNoticeDTO {
  title: string;
  content: string;
  category?: string;
  priority?: 'Normal' | 'High' | 'Urgent';
  targetRole?: 'All' | 'Staff' | 'Admin';
  expiresAt?: string;
  isPinned?: boolean;
  sendEmail?: boolean;
}

export interface UpdateNoticeDTO {
  title?: string;
  content?: string;
  category?: string;
  priority?: 'Normal' | 'High' | 'Urgent';
  targetRole?: 'All' | 'Staff' | 'Admin';
  expiresAt?: string;
  isPinned?: boolean;
  status?: 'Active' | 'Archived';
}

export class NoticeService {
  private notices: NoticeRow[] = [];
  private isInitialized = false;

  constructor() {
    this.loadFromDisk();
  }

  /**
   * Safe initialization of data directory and local file persistence.
   */
  private loadFromDisk(): void {
    if (process.env.NODE_ENV === 'test') {
      this.notices = [];
      return;
    }
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(NOTICES_FILE)) {
        const raw = fs.readFileSync(NOTICES_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.notices = parsed;
        }
      }
    } catch (err: any) {
      console.warn('[NoticeService] Could not read local notices file, using empty memory store:', err.message);
      this.notices = [];
    }
  }

  private saveToDisk(): void {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(NOTICES_FILE, JSON.stringify(this.notices, null, 2), 'utf8');
    } catch (err: any) {
      console.warn('[NoticeService] Could not write local notices file:', err.message);
    }
  }

  /**
   * Lazy sync from Google Sheets if live API is enabled and not already initialized.
   */
  public async ensureSheetInitialized(): Promise<void> {
    if (this.isInitialized || !googleSheetsService.isLiveApiEnabled()) {
      return;
    }
    try {
      await googleSheetsService.createWorksheetIfNotExists(NOTICES_SHEET_NAME);
      await googleSheetsService.initializeHeadersIfEmpty(NOTICES_SHEET_NAME, NOTICE_HEADERS);

      const records = await googleSheetsService.getSheetRecords<NoticeRow>(NOTICES_SHEET_NAME);
      if (records && records.length > 0) {
        // Merge records with local cache
        const map = new Map<string, NoticeRow>();
        for (const item of this.notices) map.set(item.NoticeID, item);
        for (const record of records) {
          if (record.NoticeID) {
            map.set(record.NoticeID, {
              NoticeID: record.NoticeID,
              Title: record.Title || '',
              Content: record.Content || '',
              Category: record.Category || 'General',
              Priority: (record.Priority as any) || 'Normal',
              TargetRole: (record.TargetRole as any) || 'All',
              CreatedBy: record.CreatedBy || 'ADMIN',
              CreatorName: record.CreatorName || 'Administrator',
              CreatedAt: record.CreatedAt || new Date().toISOString(),
              ExpiresAt: record.ExpiresAt || '',
              IsPinned: record.IsPinned === true || String(record.IsPinned).toUpperCase() === 'TRUE',
              SendEmail: record.SendEmail === true || String(record.SendEmail).toUpperCase() === 'TRUE',
              EmailStatus: (record.EmailStatus as any) || 'Skipped',
              EmailRecipientCount: Number(record.EmailRecipientCount) || 0,
              Status: (record.Status as any) || 'Active',
            });
          }
        }
        this.notices = Array.from(map.values());
        this.saveToDisk();
      }
      this.isInitialized = true;
    } catch (err: any) {
      console.warn('[NoticeService] Google Sheets sync warning:', err.message);
    }
  }

  /**
   * Retrieve all notices matching optional filters.
   * Pinned notices are sorted to the top, then sorted chronologically by CreatedAt descending.
   */
  public async getAllNotices(filter?: {
    status?: 'Active' | 'Archived' | 'All';
    limit?: number;
    category?: string;
  }): Promise<NoticeRow[]> {
    await this.ensureSheetInitialized();

    const targetStatus = filter?.status || 'Active';
    let filtered = this.notices.filter((n) => {
      if (targetStatus !== 'All' && n.Status !== targetStatus) return false;
      if (filter?.category && filter.category !== 'All' && n.Category !== filter.category) return false;
      return true;
    });

    // Sort: Pinned first, then newest CreatedAt first
    filtered.sort((a, b) => {
      const aPinned = a.IsPinned === true || String(a.IsPinned).toUpperCase() === 'TRUE';
      const bPinned = b.IsPinned === true || String(b.IsPinned).toUpperCase() === 'TRUE';
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime();
    });

    if (filter?.limit && filter.limit > 0) {
      filtered = filtered.slice(0, filter.limit);
    }

    return filtered;
  }

  /**
   * Retrieve single notice by ID.
   */
  public async getNoticeById(noticeId: string): Promise<NoticeRow | null> {
    await this.ensureSheetInitialized();
    const notice = this.notices.find((n) => n.NoticeID === noticeId);
    return notice || null;
  }

  /**
   * Create a new administrative notice, persist it, and broadcast email to all active staff.
   */
  public async createNotice(
    dto: CreateNoticeDTO,
    adminUser: { userId: string; fullName?: string; email?: string }
  ): Promise<{
    notice: NoticeRow;
    emailSummary?: {
      totalRecipients: number;
      sentCount: number;
      failedCount: number;
      errors: string[];
    };
  }> {
    await this.ensureSheetInitialized();

    if (!dto.title || !dto.title.trim()) {
      throw new Error('Notice title is required.');
    }
    if (!dto.content || !dto.content.trim()) {
      throw new Error('Notice content/message is required.');
    }

    const noticeId = `NOT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const nowIso = new Date().toISOString();
    const priority = dto.priority || 'Normal';
    const category = dto.category || 'General';
    const targetRole = dto.targetRole || 'All';
    const isPinned = Boolean(dto.isPinned);
    const sendEmail = dto.sendEmail !== false; // Default true

    let emailStatus: 'Sent' | 'Partial' | 'Failed' | 'Skipped' = 'Skipped';
    let emailRecipientCount = 0;
    let emailSummary: {
      totalRecipients: number;
      sentCount: number;
      failedCount: number;
      errors: string[];
    } | undefined = undefined;

    // Broadcast email to staff if enabled
    if (sendEmail) {
      try {
        const allUsers = await userService.getAllUsers();
        // Filter active users
        const activeRecipients = allUsers.filter((u) => {
          const isActive = u.IsActive === true || String(u.IsActive).toUpperCase() === 'TRUE';
          if (!isActive) return false;
          if (targetRole === 'Staff' && u.Role !== 'Staff') return false;
          if (targetRole === 'Admin' && u.Role !== 'Admin') return false;
          return Boolean(u.Email && u.Email.includes('@'));
        });

        if (activeRecipients.length > 0) {
          const recipientMap = new Map<string, { email: string; name: string }>();
          for (const u of activeRecipients) {
            const normalizedEmail = (u.Email || '').trim().toLowerCase();
            if (normalizedEmail && !recipientMap.has(normalizedEmail)) {
              recipientMap.set(normalizedEmail, {
                email: normalizedEmail,
                name: u.FullName || u.UserID || 'Staff Member',
              });
            }
          }
          const dispatchRecipients = Array.from(recipientMap.values());

          const dispatchResult = await emailService.broadcastStaffNoticeEmail(dispatchRecipients, {
            noticeId,
            title: dto.title.trim(),
            content: dto.content.trim(),
            category,
            priority,
            adminName: adminUser.fullName || adminUser.userId || 'Administrator',
            createdAt: nowIso,
            portalUrl: process.env.PORTAL_URL
              ? `${process.env.PORTAL_URL.replace(/\/$/, '')}/notices`
              : 'http://localhost:5173/notices',
          });

          emailSummary = {
            totalRecipients: dispatchResult.totalRecipients,
            sentCount: dispatchResult.sentCount,
            failedCount: dispatchResult.failedCount,
            errors: dispatchResult.errors,
          };

          emailRecipientCount = dispatchResult.sentCount;
          if (dispatchResult.sentCount === dispatchResult.totalRecipients && dispatchResult.totalRecipients > 0) {
            emailStatus = 'Sent';
          } else if (dispatchResult.sentCount > 0) {
            emailStatus = 'Partial';
          } else {
            emailStatus = 'Failed';
          }
        } else {
          emailStatus = 'Skipped';
        }
      } catch (emailErr: any) {
        console.error('[NoticeService Error] Failed broadcasting notice email:', emailErr.message);
        emailStatus = 'Failed';
        emailSummary = {
          totalRecipients: 0,
          sentCount: 0,
          failedCount: 0,
          errors: [emailErr.message],
        };
      }
    }

    const newNotice: NoticeRow = {
      NoticeID: noticeId,
      Title: dto.title.trim(),
      Content: dto.content.trim(),
      Category: category,
      Priority: priority,
      TargetRole: targetRole,
      CreatedBy: adminUser.userId,
      CreatorName: adminUser.fullName || adminUser.userId || 'Administrator',
      CreatedAt: nowIso,
      ExpiresAt: dto.expiresAt || '',
      IsPinned: isPinned,
      SendEmail: sendEmail,
      EmailStatus: emailStatus,
      EmailRecipientCount: emailRecipientCount,
      Status: 'Active',
    };

    // Save to memory and disk
    this.notices.unshift(newNotice);
    this.saveToDisk();

    // Persist to Google Sheets if live API is enabled
    if (googleSheetsService.isLiveApiEnabled()) {
      try {
        await googleSheetsService.appendSheetRow(NOTICES_SHEET_NAME, [
          newNotice.NoticeID,
          newNotice.Title,
          newNotice.Content,
          newNotice.Category,
          newNotice.Priority,
          newNotice.TargetRole,
          newNotice.CreatedBy,
          newNotice.CreatorName,
          newNotice.CreatedAt,
          newNotice.ExpiresAt || '',
          newNotice.IsPinned ? 'TRUE' : 'FALSE',
          newNotice.SendEmail ? 'TRUE' : 'FALSE',
          newNotice.EmailStatus,
          newNotice.EmailRecipientCount,
          newNotice.Status,
        ]);
      } catch (sheetErr: any) {
        console.error('[NoticeService Error] Failed to append notice to Google Sheets:', sheetErr.message);
      }
    }

    // Activity log
    try {
      await activityLogService.logActivity({
        performedBy: adminUser.userId,
        action: 'CREATE_NOTICE',
        entityType: 'Notice',
        entityID: noticeId,
        newValue: JSON.stringify({
          title: newNotice.Title,
          priority: newNotice.Priority,
          category: newNotice.Category,
          sendEmail: newNotice.SendEmail,
          emailStatus: newNotice.EmailStatus,
          recipientCount: newNotice.EmailRecipientCount,
        }),
        reason: `Published notice: "${newNotice.Title}" (${newNotice.Priority} priority, emailed to ${emailRecipientCount} staff)`,
      });
    } catch (logErr: any) {
      console.warn('[NoticeService] Activity log failed:', logErr.message);
    }

    return { notice: newNotice, emailSummary };
  }

  /**
   * Update an existing notice (edit content, pin/unpin, archive).
   */
  public async updateNotice(
    noticeId: string,
    dto: UpdateNoticeDTO,
    adminUser: { userId: string }
  ): Promise<NoticeRow> {
    await this.ensureSheetInitialized();

    const idx = this.notices.findIndex((n) => n.NoticeID === noticeId);
    if (idx === -1) {
      throw new Error(`Notice not found with ID ${noticeId}`);
    }

    const existing = this.notices[idx];
    const updated: NoticeRow = {
      ...existing,
      Title: dto.title !== undefined ? dto.title.trim() : existing.Title,
      Content: dto.content !== undefined ? dto.content.trim() : existing.Content,
      Category: dto.category !== undefined ? dto.category : existing.Category,
      Priority: dto.priority !== undefined ? dto.priority : existing.Priority,
      TargetRole: dto.targetRole !== undefined ? dto.targetRole : existing.TargetRole,
      ExpiresAt: dto.expiresAt !== undefined ? dto.expiresAt : existing.ExpiresAt,
      IsPinned: dto.isPinned !== undefined ? dto.isPinned : existing.IsPinned,
      Status: dto.status !== undefined ? dto.status : existing.Status,
    };

    this.notices[idx] = updated;
    this.saveToDisk();

    try {
      await activityLogService.logActivity({
        performedBy: adminUser.userId,
        action: 'UPDATE_NOTICE',
        entityType: 'Notice',
        entityID: noticeId,
        previousValue: JSON.stringify({ title: existing.Title, status: existing.Status, pinned: existing.IsPinned }),
        newValue: JSON.stringify({ title: updated.Title, status: updated.Status, pinned: updated.IsPinned }),
        reason: `Updated notice: "${updated.Title}"`,
      });
    } catch {
      // ignore
    }

    return updated;
  }

  /**
   * Re-send or broadcast notice email to active staff.
   */
  public async resendNoticeEmail(
    noticeId: string,
    adminUser: { userId: string; fullName?: string }
  ): Promise<{
    notice: NoticeRow;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    errors: string[];
  }> {
    await this.ensureSheetInitialized();

    const notice = await this.getNoticeById(noticeId);
    if (!notice) {
      throw new Error(`Notice not found with ID ${noticeId}`);
    }

    const allUsers = await userService.getAllUsers();
    const activeRecipients = allUsers.filter((u) => {
      const isActive = u.IsActive === true || String(u.IsActive).toUpperCase() === 'TRUE';
      if (!isActive) return false;
      if (notice.TargetRole === 'Staff' && u.Role !== 'Staff') return false;
      if (notice.TargetRole === 'Admin' && u.Role !== 'Admin') return false;
      return Boolean(u.Email && u.Email.includes('@'));
    });

    const recipientMap = new Map<string, { email: string; name: string }>();
    for (const u of activeRecipients) {
      const normalizedEmail = (u.Email || '').trim().toLowerCase();
      if (normalizedEmail && !recipientMap.has(normalizedEmail)) {
        recipientMap.set(normalizedEmail, {
          email: normalizedEmail,
          name: u.FullName || u.UserID || 'Staff Member',
        });
      }
    }
    const dispatchRecipients = Array.from(recipientMap.values());

    const dispatchResult = await emailService.broadcastStaffNoticeEmail(dispatchRecipients, {
      noticeId: notice.NoticeID,
      title: notice.Title,
      content: notice.Content,
      category: notice.Category,
      priority: notice.Priority,
      adminName: adminUser.fullName || adminUser.userId || notice.CreatorName,
      createdAt: notice.CreatedAt,
      portalUrl: process.env.PORTAL_URL
        ? `${process.env.PORTAL_URL.replace(/\/$/, '')}/notices`
        : 'http://localhost:5173/notices',
    });

    // Update notice status
    let emailStatus: 'Sent' | 'Partial' | 'Failed' | 'Skipped' = 'Skipped';
    if (dispatchResult.sentCount === dispatchResult.totalRecipients && dispatchResult.totalRecipients > 0) {
      emailStatus = 'Sent';
    } else if (dispatchResult.sentCount > 0) {
      emailStatus = 'Partial';
    } else {
      emailStatus = 'Failed';
    }

    notice.EmailStatus = emailStatus;
    notice.EmailRecipientCount = dispatchResult.sentCount;
    this.saveToDisk();

    try {
      await activityLogService.logActivity({
        performedBy: adminUser.userId,
        action: 'RESEND_NOTICE_EMAIL',
        entityType: 'Notice',
        entityID: notice.NoticeID,
        reason: `Re-sent notice email to ${dispatchResult.sentCount} staff members for "${notice.Title}"`,
      });
    } catch {
      // ignore
    }

    return {
      notice,
      totalRecipients: dispatchResult.totalRecipients,
      sentCount: dispatchResult.sentCount,
      failedCount: dispatchResult.failedCount,
      errors: dispatchResult.errors,
    };
  }

  /**
   * Delete or archive a notice.
   */
  public async deleteNotice(
    noticeId: string,
    adminUser: { userId: string }
  ): Promise<{ success: boolean; message: string }> {
    await this.ensureSheetInitialized();

    const idx = this.notices.findIndex((n) => n.NoticeID === noticeId);
    if (idx === -1) {
      throw new Error(`Notice not found with ID ${noticeId}`);
    }

    const removed = this.notices.splice(idx, 1)[0];
    this.saveToDisk();

    try {
      await activityLogService.logActivity({
        performedBy: adminUser.userId,
        action: 'DELETE_NOTICE',
        entityType: 'Notice',
        entityID: noticeId,
        previousValue: JSON.stringify({ title: removed.Title }),
        reason: `Deleted notice: "${removed.Title}"`,
      });
    } catch {
      // ignore
    }

    return { success: true, message: `Notice "${removed.Title}" deleted successfully.` };
  }

  /**
   * Reset / clear mock state for automated test isolation.
   */
  public resetForTest(): void {
    this.notices = [];
    this.isInitialized = false;
  }
}

export const noticeService = new NoticeService();
