import { Request, Response } from 'express';
import { noticeService } from '../services/notice.service.js';

export class NoticeController {
  /**
   * GET /api/notices
   * Retrieve all notices (active by default). Accessible by authenticated Staff and Admin.
   */
  public async getNotices(req: Request, res: Response): Promise<void> {
    try {
      const status = (req.query.status as any) || 'Active';
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const category = req.query.category as string | undefined;

      const notices = await noticeService.getAllNotices({
        status,
        limit,
        category,
      });

      res.status(200).json({
        success: true,
        count: notices.length,
        data: notices,
      });
    } catch (err: any) {
      console.error('[NoticeController Error] Failed to fetch notices:', err.message);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve notices.',
        error: err.message,
      });
    }
  }

  /**
   * GET /api/notices/:id
   * Retrieve single notice by NoticeID.
   */
  public async getNoticeById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const notice = await noticeService.getNoticeById(id);

      if (!notice) {
        res.status(404).json({
          success: false,
          message: `Notice not found with ID ${id}.`,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: notice,
      });
    } catch (err: any) {
      console.error('[NoticeController Error] Failed to fetch notice:', err.message);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve notice.',
        error: err.message,
      });
    }
  }

  /**
   * POST /api/notices
   * Create a new official staff notice and broadcast email to active staff. Admin only.
   */
  public async createNotice(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({ success: false, message: 'Authentication required.' });
        return;
      }

      const { title, content, category, priority, targetRole, expiresAt, isPinned, sendEmail } = req.body;

      if (!title || typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ success: false, message: 'Title is required for the notice.' });
        return;
      }

      if (!content || typeof content !== 'string' || !content.trim()) {
        res.status(400).json({ success: false, message: 'Notice message/content is required.' });
        return;
      }

      const result = await noticeService.createNotice(
        {
          title,
          content,
          category,
          priority,
          targetRole,
          expiresAt,
          isPinned,
          sendEmail,
        },
        {
          userId: user.userId || user.UserID || 'ADMIN',
          fullName: user.fullName || user.FullName || 'Administrator',
          email: user.email || user.Email,
        }
      );

      res.status(201).json({
        success: true,
        message: `Notice "${result.notice.Title}" published successfully${
          result.notice.SendEmail
            ? ` and emailed to ${result.notice.EmailRecipientCount} staff members.`
            : '.'
        }`,
        data: result.notice,
        emailSummary: result.emailSummary,
      });
    } catch (err: any) {
      console.error('[NoticeController Error] Failed to create notice:', err.message);
      res.status(400).json({
        success: false,
        message: err.message || 'Failed to create notice.',
      });
    }
  }

  /**
   * PUT /api/notices/:id
   * Update an existing notice. Admin only.
   */
  public async updateNotice(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      const { id } = req.params;

      const updated = await noticeService.updateNotice(id, req.body, {
        userId: user.userId || user.UserID || 'ADMIN',
      });

      res.status(200).json({
        success: true,
        message: 'Notice updated successfully.',
        data: updated,
      });
    } catch (err: any) {
      console.error('[NoticeController Error] Failed to update notice:', err.message);
      const statusCode = err.message.includes('not found') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        message: err.message || 'Failed to update notice.',
      });
    }
  }

  /**
   * DELETE /api/notices/:id
   * Delete or archive a notice. Admin only.
   */
  public async deleteNotice(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      const { id } = req.params;

      const result = await noticeService.deleteNotice(id, {
        userId: user.userId || user.UserID || 'ADMIN',
      });

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (err: any) {
      console.error('[NoticeController Error] Failed to delete notice:', err.message);
      const statusCode = err.message.includes('not found') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        message: err.message || 'Failed to delete notice.',
      });
    }
  }

  /**
   * POST /api/notices/:id/resend
   * Re-send or broadcast notice email to active staff. Admin only.
   */
  public async resendNoticeEmail(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      const { id } = req.params;

      const result = await noticeService.resendNoticeEmail(id, {
        userId: user.userId || user.UserID || 'ADMIN',
        fullName: user.fullName || user.FullName || 'Administrator',
      });

      res.status(200).json({
        success: true,
        message: `Notice email broadcast sent to ${result.sentCount} active staff members.`,
        data: result,
      });
    } catch (err: any) {
      console.error('[NoticeController Error] Failed to resend notice email:', err.message);
      const statusCode = err.message.includes('not found') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        message: err.message || 'Failed to resend notice email.',
      });
    }
  }
}

export const noticeController = new NoticeController();
