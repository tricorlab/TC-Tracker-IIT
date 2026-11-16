import { Request, Response } from 'express';
import { userService, UserVerificationError } from '../services/userService.js';

export class UserController {
  /**
   * Get all registered users (Accessible to Admin).
   */
  public async getAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const users = await userService.getAllUsers();
      res.json({ success: true, data: users });
    } catch (err: any) {
      const status = err instanceof UserVerificationError ? err.statusCode : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  /**
   * Create a new user (Admin only: Staff or Admin).
   * - Staff cannot access.
   */
  public async createUser(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: 'Unauthorized session.' });
        return;
      }

      const { fullName, email, role, joiningDate, isActive } = req.body;
      const newUser = await userService.createUser(req.user, {
        fullName,
        email,
        role,
        joiningDate,
        isActive,
      });

      res.status(201).json({
        success: true,
        data: newUser,
        message: 'User created successfully.',
      });
    } catch (err: any) {
      const status = err instanceof UserVerificationError ? err.statusCode : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  /**
   * Update an existing user (Admin only).
   * Safeguards against self-demotion and deactivating last active Admin.
   */
  public async updateUser(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: 'Unauthorized session.' });
        return;
      }

      const { id } = req.params;
      const { fullName, email, role, joiningDate, isActive } = req.body;

      const updatedUser = await userService.updateUser(req.user, id, {
        fullName,
        email,
        role,
        joiningDate,
        isActive,
      });

      res.json({
        success: true,
        data: updatedUser,
        message: 'User updated successfully.',
      });
    } catch (err: any) {
      const status = err instanceof UserVerificationError ? err.statusCode : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }
}

export const userController = new UserController();
