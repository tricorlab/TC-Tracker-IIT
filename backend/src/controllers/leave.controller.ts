import { Request, Response } from 'express';
import { leaveService } from '../services/leave.service.js';
import { leavePolicyService } from '../services/leavePolicy.service.js';

export class LeaveController {
  public async previewCalculation(req: Request, res: Response): Promise<void> {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      if (!startDate || !endDate) {
        res.status(400).json({ success: false, message: 'startDate and endDate are required.' });
        return;
      }

      const calculation = await leavePolicyService.calculateLeaveDays(startDate, endDate);
      res.json({ success: true, data: calculation });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async submitRequest(req: Request, res: Response): Promise<void> {
    try {
      const { leaveType, startDate, endDate, reason, remarks } = req.body;
      const userId = req.user!.userId; // Always from session

      const result = await leaveService.submitLeaveRequest(userId, {
        leaveType,
        startDate,
        endDate,
        reason,
        remarks,
      });

      res.status(201).json({
        success: true,
        message: 'Leave request submitted successfully (informational).',
        data: result,
        request: result.request,
        warning: result.warning,
        calculatedDays: result.calculatedDays,
        availableBalance: result.availableBalance,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async getMyRequests(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const requests = await leaveService.getUserRequests(userId);
      res.json({ success: true, data: requests, requests });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async getAllRequests(_req: Request, res: Response): Promise<void> {
    try {
      const requests = await leaveService.getAllEnrichedRequests();
      res.json({ success: true, data: requests, requests });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async getBalance(req: Request, res: Response): Promise<void> {
    try {
      let targetUserId = req.query.userId as string;
      const currentUser = req.user!;

      if (currentUser.role === 'Staff' || !targetUserId) {
        targetUserId = currentUser.userId;
      }

      const year = req.query.year ? parseInt(req.query.year as string, 10) : new Date().getUTCFullYear();
      const asOfDate = req.query.asOfDate as string | undefined;
      const balance = await leaveService.getUserBalance(targetUserId, year, asOfDate);
      res.json({ success: true, data: balance, balance });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async getAllBalances(req: Request, res: Response): Promise<void> {
    try {
      const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
      const asOfDate = req.query.asOfDate as string | undefined;
      const balances = await leaveService.getAllBalances(year, asOfDate);
      res.json({ success: true, data: balances, balances });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async adjustBalance(req: Request, res: Response): Promise<void> {
    try {
      const { userId, calendarYear, earnedLeave, carriedForward, usedLeave, reason } = req.body;
      const adminId = req.user!.userId;

      const adjusted = await leaveService.adjustBalance(adminId, {
        userId,
        calendarYear: parseInt(calendarYear, 10),
        earnedLeave: earnedLeave !== undefined ? parseFloat(earnedLeave) : undefined,
        carriedForward: carriedForward !== undefined ? parseFloat(carriedForward) : undefined,
        usedLeave: usedLeave !== undefined ? parseFloat(usedLeave) : undefined,
        reason,
      });

      res.json({
        success: true,
        message: 'Leave balance adjusted successfully.',
        data: adjusted,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async getPolicy(_req: Request, res: Response): Promise<void> {
    try {
      const policy = await leavePolicyService.getPolicy();
      res.json({ success: true, data: policy });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async updatePolicy(req: Request, res: Response): Promise<void> {
    try {
      const updatedBy = req.user!.userId;
      const updated = await leavePolicyService.updatePolicy(req.body, updatedBy);
      res.json({
        success: true,
        message: 'Leave policy updated successfully.',
        data: updated,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async previewYearTransition(req: Request, res: Response): Promise<void> {
    try {
      const sourceYear = parseInt(req.query.sourceYear as string, 10);
      const destinationYear = parseInt(req.query.destinationYear as string, 10);
      if (isNaN(sourceYear) || isNaN(destinationYear)) {
        res.status(400).json({
          success: false,
          message: 'Valid sourceYear and destinationYear parameters are required.',
        });
        return;
      }
      const preview = await leaveService.previewYearTransition(sourceYear, destinationYear);
      res.json({ success: true, data: preview });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async executeYearTransition(req: Request, res: Response): Promise<void> {
    try {
      const { sourceYear, destinationYear, confirm } = req.body;
      const sYear = parseInt(sourceYear, 10);
      const dYear = parseInt(destinationYear, 10);
      if (isNaN(sYear) || isNaN(dYear)) {
        res.status(400).json({
          success: false,
          message: 'Valid sourceYear and destinationYear are required in the request body.',
        });
        return;
      }
      if (!confirm) {
        res.status(400).json({
          success: false,
          message: 'Explicit admin confirmation (confirm: true) is required to execute year transition.',
        });
        return;
      }
      const adminId = req.user!.userId;
      const result = await leaveService.executeYearTransition(
        adminId,
        sYear,
        dYear,
        Boolean(confirm)
      );
      res.json({
        success: true,
        message: `Year transition from ${sYear} to ${dYear} executed successfully for ${result.processedCount} employee(s).`,
        data: result,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async allocateSpecialLeave(req: Request, res: Response): Promise<void> {
    try {
      const adminId = req.user!.userId;
      const { userIds, criticalSection, startDate, endDate, reason, exemptFromBalance, autoMarkPresent, remarks } = req.body;

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        res.status(400).json({ success: false, message: 'At least one employee must be selected.' });
        return;
      }
      if (!criticalSection || !String(criticalSection).trim()) {
        res.status(400).json({ success: false, message: 'Critical section/reason is required.' });
        return;
      }
      if (!startDate || !endDate) {
        res.status(400).json({ success: false, message: 'startDate and endDate are required.' });
        return;
      }
      if (!reason || !String(reason).trim()) {
        res.status(400).json({ success: false, message: 'A justification reason is required for administrative allocation.' });
        return;
      }

      const result = await leaveService.allocateSpecialLeave(adminId, {
        userIds,
        criticalSection: String(criticalSection).trim(),
        startDate: String(startDate).trim(),
        endDate: String(endDate).trim(),
        reason: String(reason).trim(),
        exemptFromBalance: exemptFromBalance !== false,
        autoMarkPresent: autoMarkPresent !== false,
        remarks: remarks ? String(remarks).trim() : undefined,
      });

      const attendanceNote = result.autoMarkedAttendanceDays
        ? ` and attendance auto-marked Present for ${result.autoMarkedAttendanceDays} working day(s)`
        : '';

      res.status(201).json({
        success: true,
        message: `Special leave allocated successfully for ${result.allocatedCount} employee(s)${attendanceNote}.`,
        data: result,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async cancelRequest(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ success: false, message: 'Leave request ID is required.' });
        return;
      }
      const currentUser = req.user!;
      const reason = req.body?.reason as string | undefined;

      const updated = await leaveService.cancelLeaveRequest(currentUser, id, reason);
      res.json({
        success: true,
        message: 'Leave request withdrawn successfully.',
        data: updated,
        request: updated,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || 400;
      res.status(statusCode).json({ success: false, message: err.message });
    }
  }
}

export const leaveController = new LeaveController();
