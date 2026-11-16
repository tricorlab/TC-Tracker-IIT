import { Request, Response } from 'express';
import { holidayService } from '../services/holiday.service.js';

export class HolidayController {
  public async getHolidays(req: Request, res: Response): Promise<void> {
    try {
      const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
      const holidays = year
        ? await holidayService.getHolidaysByYear(year)
        : await holidayService.getAllHolidays();
      res.json({ success: true, holidays, data: holidays });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async createHoliday(req: Request, res: Response): Promise<void> {
    try {
      const { holidayName, holidayDate, description } = req.body;
      const createdBy = req.user!.userId;
      const holiday = await holidayService.createHoliday({
        holidayName,
        holidayDate,
        description,
        createdBy,
      });
      res.status(201).json({
        success: true,
        message: 'Holiday scheduled successfully.',
        data: holiday,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async updateHoliday(req: Request, res: Response): Promise<void> {
    try {
      const holidayId = req.params.id;
      const { holidayName, holidayDate, description } = req.body;
      const updatedBy = req.user!.userId;
      const updated = await holidayService.updateHoliday(
        holidayId,
        { holidayName, holidayDate, description },
        updatedBy
      );
      res.json({
        success: true,
        message: 'Holiday updated successfully.',
        data: updated,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  public async deleteHoliday(req: Request, res: Response): Promise<void> {
    try {
      const holidayId = req.params.id;
      const deletedBy = req.user!.userId;
      await holidayService.deleteHoliday(holidayId, deletedBy);
      res.json({
        success: true,
        message: 'Holiday removed successfully.',
      });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
}

export const holidayController = new HolidayController();
