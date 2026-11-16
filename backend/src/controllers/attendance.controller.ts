import { Request, Response } from 'express';
import { attendanceService } from '../services/attendance.service.js';

export class AttendanceController {
  public async getDaily(req: Request, res: Response): Promise<void> {
    try {
      const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
      const data = await attendanceService.getDailyAttendance(date);
      res.json({
        success: true,
        ...data,
        data,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async markDaily(req: Request, res: Response): Promise<void> {
    try {
      const { date, entries } = req.body;
      const markedBy = req.user!.userId;
      const result = await attendanceService.markDailyAttendance(date, entries, markedBy);
      res.json({
        success: true,
        message: `Attendance marked successfully for ${result.savedCount} employee(s).`,
        savedCount: result.savedCount,
        data: result,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async getMonthly(req: Request, res: Response): Promise<void> {
    try {
      let targetUserId = req.query.userId as string;
      const currentUser = req.user!;

      // Staff can only view their own records
      if (currentUser.role === 'Staff' || !targetUserId) {
        targetUserId = currentUser.userId;
      }

      const year = req.query.year ? parseInt(req.query.year as string, 10) : new Date().getUTCFullYear();
      const month = req.query.month ? parseInt(req.query.month as string, 10) : new Date().getUTCMonth() + 1;

      const summary = await attendanceService.getMonthlyAttendanceSummary(targetUserId, year, month);
      res.json({ success: true, summary, data: summary });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async getHistory(req: Request, res: Response): Promise<void> {
    try {
      let targetUserId = req.query.userId as string;
      const currentUser = req.user!;

      // Staff can only view their own records
      if (currentUser.role === 'Staff' || !targetUserId) {
        targetUserId = currentUser.userId;
      }

      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const history = await attendanceService.getEmployeeAttendanceHistory(targetUserId, startDate, endDate);
      res.json({ success: true, history, data: history });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
}

export const attendanceController = new AttendanceController();
