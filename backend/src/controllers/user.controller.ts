import { Request, Response } from 'express';
import { userService, UserVerificationError, sanitizeUserResponse } from '../services/userService.js';

export class UserController {
  /**
   * Get all registered users (Accessible to Admin).
   * Sensitive security fields (PasswordHash, ResetToken, ResetOtp) are sanitized before sending.
   */
  public async getAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const users = await userService.getAllUsers();
      res.json({ success: true, data: users.map(sanitizeUserResponse) });
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

      const emailDispatched = (newUser as any).emailDispatched;
      const emailError = (newUser as any).emailError;

      res.status(201).json({
        success: true,
        data: sanitizeUserResponse(newUser),
        emailDispatched,
        emailError,
        message: emailDispatched
          ? 'User created successfully and welcome credentials email sent.'
          : emailError
          ? `User created successfully, but welcome email could not be sent: ${emailError}`
          : 'User created successfully.',
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
        data: sanitizeUserResponse(updatedUser),
        message: 'User updated successfully.',
      });
    } catch (err: any) {
      const status = err instanceof UserVerificationError ? err.statusCode : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  /**
   * Delete or deactivate a user (Admin only).
   * - permanent=true (query or body) executes permanent hard delete.
   * - Default executes soft delete (deactivation).
   */
  public async deleteUser(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: 'Unauthorized session.' });
        return;
      }

      const { id } = req.params;
      const permanent = req.query.permanent === 'true' || req.body?.permanent === true;

      const result = await userService.deleteUser(req.user, id, { permanent });
      res.json(result);
    } catch (err: any) {
      const status = err instanceof UserVerificationError ? err.statusCode : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }
}

export const userController = new UserController();
