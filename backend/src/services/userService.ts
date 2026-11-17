import { googleSheetsService } from './googleSheets.service.js';
import { SHEET_NAMES, VALID_ROLES, ValidRole } from '../config/sheets.config.js';
import { UserRow } from '../types/database.types.js';
import { activityLogService } from './activityLog.service.js';
import { validateDate, validateEmail, validateRole } from '../validation/sheetValidators.js';
import {
  generateRandomPassword,
  generateOtp,
  generateCryptoToken,
  hashPassword,
  verifyPassword,
  needsRehash,
  hashToken,
  validatePasswordStrength,
} from '../utils/password.util.js';
import { emailService } from './email.service.js';
import { config } from '../config/env.config.js';

export interface AuthenticatedUserContext {
  userId: string;
  fullName: string;
  email: string;
  role: ValidRole;
  isActive: boolean;
  mustChangePassword?: boolean;
  passwordChangedAt?: string;
}

/**
 * Strips password hashes, reset tokens, and OTP attempts from user row objects
 * before persisting to ActivityLogs or exposing externally.
 */
export function sanitizeUserForLog(user: UserRow | Partial<UserRow>): Record<string, any> {
  const sanitized: Record<string, any> = { ...user };
  delete sanitized.PasswordHash;
  delete sanitized.ResetToken;
  delete sanitized.ResetOtp;
  delete sanitized.ResetTokenExpires;
  delete sanitized.ResetOtpAttempts;
  return sanitized;
}

/**
 * Sanitizes user records for public API responses, ensuring sensitive credentials
 * and tokens are never leaked to client browsers.
 */
export function sanitizeUserResponse(user: UserRow | Partial<UserRow>): Record<string, any> {
  const sanitized: Record<string, any> = { ...user };
  delete sanitized.PasswordHash;
  delete sanitized.ResetToken;
  delete sanitized.ResetOtp;
  delete sanitized.ResetTokenExpires;
  delete sanitized.ResetOtpAttempts;
  return sanitized;
}

export interface CreateUserData {
  fullName: string;
  email: string;
  role: ValidRole;
  joiningDate: string;
  isActive?: boolean;
}

export interface UpdateUserData {
  fullName?: string;
  email?: string;
  role?: ValidRole;
  joiningDate?: string;
  isActive?: boolean;
}

export class UserService {
  // Keyed by UserID to store unique user records in-memory
  private cache = new Map<string, { user: UserRow; cachedAt: number }>();
  private cachedRecords: UserRow[] = [];
  private lastAllUsersFetch: number = 0;
  private isMockMode = false;
  private readonly CACHE_TTL_MS = 15 * 1000; // 15 seconds

  /**
   * Helper to parse Boolean from Google Sheets string ("TRUE", "true", true, "1")
   * Returns false for all other values ("FALSE", "false", "", null, undefined).
   */
  public parseIsActive(val: any): boolean {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val === 1;
    if (typeof val === 'string') {
      const lower = val.trim().toLowerCase();
      return lower === 'true' || lower === '1' || lower === 'yes';
    }
    return false;
  }

  /**
   * Invalidate in-memory cache
   */
  public clearCache(): void {
    this.cache.clear();
    this.cachedRecords = [];
    this.lastAllUsersFetch = 0;
    this.isMockMode = false;
  }

  /**
   * Fetch all users from Google Sheets or mock data
   */
  public async getAllUsers(): Promise<UserRow[]> {
    if (this.isMockMode || !googleSheetsService.isLiveApiEnabled()) {
      // In dev or test environments without live credentials, return distinct cached users
      return Array.from(this.cache.values()).map((c) => c.user);
    }

    const now = Date.now();
    if (this.cachedRecords.length > 0 && now - this.lastAllUsersFetch < this.CACHE_TTL_MS) {
      return [...this.cachedRecords];
    }

    try {
      const records = await googleSheetsService.getSheetRecords<UserRow>(SHEET_NAMES.USERS);
      this.cachedRecords = records;
      this.lastAllUsersFetch = now;
      // Refresh cache keyed by UserID
      for (const record of records) {
        if (record.UserID) {
          this.cache.set(record.UserID.trim(), { user: record, cachedAt: now });
        }
      }
      return records;
    } catch (error: any) {
      console.error('[UserService Error] Failed to fetch users from Google Sheets:', error?.message);
      throw new UserVerificationError('Database service error during user lookup.', 503);
    }
  }

  /**
   * Look up a user by email (normalized: trimmed & lowercase).
   * Safely rejects duplicate normalized emails instead of picking an arbitrary row.
   */
  public async getUserByEmail(email: string): Promise<UserRow | null> {
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail) return null;

    const allUsers = await this.getAllUsers();
    const matchingUsers = allUsers.filter(
      (u) => (u.Email || '').trim().toLowerCase() === normalizedEmail
    );

    if (matchingUsers.length > 1) {
      throw new UserVerificationError(
        'Integrity error: Multiple user accounts registered with the same email. Please contact the administrator.',
        409
      );
    }

    if (matchingUsers.length === 1) {
      const user = matchingUsers[0];
      this.cache.set(user.UserID.trim(), { user, cachedAt: Date.now() });
      return user;
    }

    return null;
  }

  /**
   * Look up a user by UserID.
   * Safely rejects duplicate IDs.
   */
  public async getUserById(userId: string): Promise<UserRow | null> {
    const trimmedId = (userId || '').trim();
    if (!trimmedId) return null;

    const allUsers = await this.getAllUsers();
    const matchingUsers = allUsers.filter(
      (u) => (u.UserID || '').trim() === trimmedId
    );

    if (matchingUsers.length > 1) {
      throw new UserVerificationError(
        'Integrity error: Multiple user accounts found with the same UserID. Please contact the administrator.',
        409
      );
    }

    if (matchingUsers.length === 1) {
      const user = matchingUsers[0];
      this.cache.set(user.UserID.trim(), { user, cachedAt: Date.now() });
      return user;
    }

    return null;
  }

  /**
   * Verify an employee by email against Google Sheets rules:
   * 1. Must exist in Users sheet.
   * 2. IsActive must be true.
   * 3. Role must be Staff or Admin.
   *
   * Fails securely: No default user, no fallback role.
   */
  public async verifyActiveUserByEmail(email: string): Promise<AuthenticatedUserContext> {
    const user = await this.getUserByEmail(email);

    if (!user) {
      throw new UserVerificationError(
        'Your account is not registered in TC Tracker. Please contact the administrator.',
        401
      );
    }

    const isActive = this.parseIsActive(user.IsActive);
    if (!isActive) {
      throw new UserVerificationError(
        'Your account is inactive. Please contact the administrator.',
        401
      );
    }

    const rawRole = (user.Role || '').trim();
    if (!VALID_ROLES.includes(rawRole as ValidRole)) {
      throw new UserVerificationError(
        'Invalid account role. Please contact the administrator.',
        403
      );
    }

    return {
      userId: user.UserID.trim(),
      fullName: user.FullName.trim(),
      email: (user.Email || '').trim().toLowerCase(),
      role: rawRole as ValidRole,
      isActive: true,
      mustChangePassword: this.parseIsActive(user.MustChangePassword),
      passwordChangedAt: user.PasswordChangedAt || undefined,
    };
  }

  /**
   * Verify an employee by UserID against Google Sheets rules.
   * Resolves the user's CURRENT role directly from the source of truth.
   */
  public async verifyActiveUserById(userId: string): Promise<AuthenticatedUserContext> {
    const user = await this.getUserById(userId);

    if (!user) {
      throw new UserVerificationError(
        'Your account is not registered in TC Tracker. Please contact the administrator.',
        401
      );
    }

    const isActive = this.parseIsActive(user.IsActive);
    if (!isActive) {
      throw new UserVerificationError(
        'Your account is inactive. Please contact the administrator.',
        401
      );
    }

    const rawRole = (user.Role || '').trim();
    if (!VALID_ROLES.includes(rawRole as ValidRole)) {
      throw new UserVerificationError(
        'Invalid account role. Please contact the administrator.',
        403
      );
    }

    return {
      userId: user.UserID.trim(),
      fullName: user.FullName.trim(),
      email: (user.Email || '').trim().toLowerCase(),
      role: rawRole as ValidRole,
      isActive: true,
      mustChangePassword: this.parseIsActive(user.MustChangePassword),
      passwordChangedAt: user.PasswordChangedAt || undefined,
    };
  }

  /**
   * Create a new user with strict RBAC:
   * - Only Admin can create users (Staff or Admin).
   * - Staff cannot create users (403 Forbidden).
   * - Normalizes email and checks uniqueness.
   * - Logs to ActivityLogs.
   */
  public async createUser(
    creatorUser: AuthenticatedUserContext,
    data: CreateUserData
  ): Promise<UserRow> {
    if (creatorUser.role !== 'Admin') {
      throw new UserVerificationError('You do not have permission to create users.', 403);
    }

    if (!data.fullName || typeof data.fullName !== 'string' || !data.fullName.trim()) {
      throw new UserVerificationError('Full name is required.', 400);
    }

    const normalizedEmail = (data.email || '').trim().toLowerCase();
    const emailVal = validateEmail(normalizedEmail);
    if (!emailVal.isValid) {
      throw new UserVerificationError(emailVal.errors.join(' '), 400);
    }

    const roleVal = validateRole(data.role);
    if (!roleVal.isValid) {
      throw new UserVerificationError(roleVal.errors.join(' '), 400);
    }

    const dateVal = validateDate(data.joiningDate, 'JoiningDate');
    if (!dateVal.isValid) {
      throw new UserVerificationError(dateVal.errors.join(' '), 400);
    }

    const allUsers = await this.getAllUsers();
    const emailExists = allUsers.some(
      (u) => (u.Email || '').trim().toLowerCase() === normalizedEmail
    );
    if (emailExists) {
      throw new UserVerificationError(`Email '${normalizedEmail}' already exists.`, 409);
    }

    const newUserId = `USR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const idExists = allUsers.some((u) => (u.UserID || '').trim() === newUserId);
    if (idExists) {
      throw new UserVerificationError('Integrity error: UserID collision. Please retry.', 409);
    }

    const isActive = data.isActive !== undefined ? this.parseIsActive(data.isActive) : true;
    const now = new Date().toISOString();

    // Generate secure temporary random password for onboarding
    const tempPassword = generateRandomPassword(10);
    const passwordHash = await hashPassword(tempPassword);

    const newUser: UserRow = {
      UserID: newUserId,
      FullName: data.fullName.trim(),
      Email: normalizedEmail,
      Role: data.role,
      JoiningDate: data.joiningDate.trim(),
      IsActive: isActive ? 'TRUE' : 'FALSE',
      CreatedAt: now,
      UpdatedAt: now,
      PasswordHash: passwordHash,
      MustChangePassword: 'TRUE',
      ResetToken: '',
      ResetOtp: '',
      ResetTokenExpires: '',
      ResetOtpAttempts: 0,
      PasswordChangedAt: now,
    };

    if (googleSheetsService.isLiveApiEnabled()) {
      try {
        await googleSheetsService.appendSheetRow(SHEET_NAMES.USERS, [
          newUser.UserID,
          newUser.FullName,
          newUser.Email,
          newUser.Role,
          newUser.JoiningDate,
          newUser.IsActive,
          newUser.CreatedAt,
          newUser.UpdatedAt,
          newUser.PasswordHash || '',
          newUser.MustChangePassword || 'TRUE',
          newUser.ResetToken || '',
          newUser.ResetOtp || '',
          newUser.ResetTokenExpires || '',
          newUser.ResetOtpAttempts !== undefined ? String(newUser.ResetOtpAttempts) : '0',
          newUser.PasswordChangedAt || '',
        ]);
      } catch (err: any) {
        console.error('[UserService Error] Failed to append user to Google Sheets:', err.message);
        throw new UserVerificationError(`Database error creating user: ${err.message}`, 503);
      }
    }

    this.cache.set(newUser.UserID, { user: newUser, cachedAt: Date.now() });
    this.lastAllUsersFetch = 0;
    this.cachedRecords = [];

    // Dispatch welcome onboarding email with login ID and temporary password
    let emailDispatched = false;
    let emailError: string | null = null;
    try {
      const emailResult = await emailService.sendWelcomeCredentialsEmail({
        staffName: newUser.FullName,
        staffEmail: newUser.Email,
        temporaryPassword: tempPassword,
        loginUrl: `${config.frontendUrl}/login`,
      });
      emailDispatched = emailResult.dispatched;
      if (!emailResult.dispatched) {
        emailError = emailResult.log?.ErrorMessage || 'Email delivery failed';
        console.warn(`[UserService] Welcome onboarding email to ${newUser.Email} was not sent: ${emailError}`);
      } else {
        console.log(`[UserService] Welcome onboarding email sent successfully to ${newUser.Email}`);
      }
    } catch (emailErr: any) {
      emailError = emailErr.message;
      console.error('[UserService] Failed to dispatch welcome onboarding email:', emailErr.message);
    }

    await activityLogService.logActivity({
      performedBy: creatorUser.userId,
      action: 'USER_CREATED',
      entityType: 'User',
      entityID: newUser.UserID,
      newValue: JSON.stringify(sanitizeUserForLog(newUser)),
      reason: `Created ${newUser.Role} user: ${newUser.FullName} (${newUser.Email})`,
    });

    return {
      ...newUser,
      emailDispatched,
      emailError,
      // Pass temporaryPassword transiently for administrative feedback / testing
      ...(tempPassword ? { temporaryPassword: tempPassword } : {}),
    } as any;
  }

  /**
   * Update an existing user (Admin only):
   * - Non-Admin users (Staff) rejected with 403 Forbidden.
   * - Self-role change prevented with 403.
   * - Last active Admin protected with 400 (cannot deactivate or demote).
   * - Logs previous and new values to ActivityLogs.
   */
  public async updateUser(
    modifierUser: AuthenticatedUserContext,
    targetUserId: string,
    updates: UpdateUserData
  ): Promise<UserRow> {
    if (modifierUser.role !== 'Admin') {
      throw new UserVerificationError('Only Administrators can edit user accounts.', 403);
    }

    const allUsers = await this.getAllUsers();
    const targetUser = allUsers.find(
      (u) => (u.UserID || '').trim() === targetUserId.trim()
    );

    if (!targetUser) {
      throw new UserVerificationError('User not found.', 404);
    }

    // Safeguard 1: Self-role modification prevented
    if (
      modifierUser.userId === targetUser.UserID.trim() &&
      updates.role !== undefined &&
      updates.role !== targetUser.Role
    ) {
      throw new UserVerificationError('Administrators cannot change their own role.', 403);
    }

    // Safeguard 2: Last active Admin protection
    const isCurrentlyActiveAdmin =
      targetUser.Role === 'Admin' && this.parseIsActive(targetUser.IsActive);

    if (isCurrentlyActiveAdmin) {
      const activeAdmins = allUsers.filter(
        (u) => u.Role === 'Admin' && this.parseIsActive(u.IsActive)
      );
      const isDeactivating =
        updates.isActive !== undefined && !this.parseIsActive(updates.isActive);
      const isDemoting = updates.role !== undefined && updates.role !== 'Admin';

      if ((isDeactivating || isDemoting) && activeAdmins.length <= 1) {
        throw new UserVerificationError(
          'Cannot deactivate or demote the last active Administrator.',
          400
        );
      }
    }

    // Validate fields if provided
    if (updates.fullName !== undefined) {
      if (!updates.fullName || typeof updates.fullName !== 'string' || !updates.fullName.trim()) {
        throw new UserVerificationError('Full name cannot be empty.', 400);
      }
    }

    if (updates.email !== undefined) {
      const normalizedEmail = updates.email.trim().toLowerCase();
      const emailVal = validateEmail(normalizedEmail);
      if (!emailVal.isValid) {
        throw new UserVerificationError(emailVal.errors.join(' '), 400);
      }
      const duplicate = allUsers.find(
        (u) =>
          u.UserID.trim() !== targetUserId.trim() &&
          (u.Email || '').trim().toLowerCase() === normalizedEmail
      );
      if (duplicate) {
        throw new UserVerificationError(
          `Email '${normalizedEmail}' is already registered to another user.`,
          409
        );
      }
    }

    if (updates.role !== undefined) {
      const roleVal = validateRole(updates.role);
      if (!roleVal.isValid) {
        throw new UserVerificationError(roleVal.errors.join(' '), 400);
      }
    }

    if (updates.joiningDate !== undefined) {
      const dateVal = validateDate(updates.joiningDate, 'JoiningDate');
      if (!dateVal.isValid) {
        throw new UserVerificationError(dateVal.errors.join(' '), 400);
      }
    }

    const now = new Date().toISOString();
    const updatedUser: UserRow = {
      UserID: targetUser.UserID,
      FullName: updates.fullName !== undefined ? updates.fullName.trim() : targetUser.FullName,
      Email: updates.email !== undefined ? updates.email.trim().toLowerCase() : targetUser.Email,
      Role: updates.role !== undefined ? updates.role : targetUser.Role,
      JoiningDate: updates.joiningDate !== undefined ? updates.joiningDate.trim() : targetUser.JoiningDate,
      IsActive:
        updates.isActive !== undefined
            ? this.parseIsActive(updates.isActive)
            ? 'TRUE'
            : 'FALSE'
          : targetUser.IsActive,
      CreatedAt: targetUser.CreatedAt,
      UpdatedAt: now,
      PasswordHash: targetUser.PasswordHash || '',
      MustChangePassword: targetUser.MustChangePassword || 'FALSE',
      ResetToken: targetUser.ResetToken || '',
      ResetOtp: targetUser.ResetOtp || '',
      ResetTokenExpires: targetUser.ResetTokenExpires || '',
      ResetOtpAttempts: targetUser.ResetOtpAttempts !== undefined ? targetUser.ResetOtpAttempts : 0,
      PasswordChangedAt: targetUser.PasswordChangedAt || '',
    };

    if (googleSheetsService.isLiveApiEnabled()) {
      const actualRow = await googleSheetsService.findRowIndexByColumnValue(
        SHEET_NAMES.USERS,
        'A',
        targetUserId
      );
      const userIdx = allUsers.findIndex(
        (u) => u.UserID.trim() === targetUserId.trim()
      );
      const sheetRowIndex = actualRow !== -1 ? actualRow : (userIdx !== -1 ? userIdx + 2 : -1);

      if (sheetRowIndex !== -1) {
        try {
          await googleSheetsService.updateSheetRange(
            `${SHEET_NAMES.USERS}!A${sheetRowIndex}:O${sheetRowIndex}`,
            [
              [
                updatedUser.UserID,
                updatedUser.FullName,
                updatedUser.Email,
                updatedUser.Role,
                updatedUser.JoiningDate,
                updatedUser.IsActive,
                updatedUser.CreatedAt,
                updatedUser.UpdatedAt,
                updatedUser.PasswordHash || '',
                updatedUser.MustChangePassword || '',
                updatedUser.ResetToken || '',
                updatedUser.ResetOtp || '',
                updatedUser.ResetTokenExpires || '',
                updatedUser.ResetOtpAttempts !== undefined ? String(updatedUser.ResetOtpAttempts) : '',
                updatedUser.PasswordChangedAt || '',
              ],
            ]
          );
        } catch (err: any) {
          console.error('[UserService Error] Failed to update user in Google Sheets:', err.message);
          throw new UserVerificationError(`Database error updating user: ${err.message}`, 503);
        }
      }
    }

    this.cache.set(updatedUser.UserID, { user: updatedUser, cachedAt: Date.now() });
    this.lastAllUsersFetch = 0;
    this.cachedRecords = [];

    await activityLogService.logActivity({
      performedBy: modifierUser.userId,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityID: updatedUser.UserID,
      previousValue: JSON.stringify(sanitizeUserForLog(targetUser)),
      newValue: JSON.stringify(sanitizeUserForLog(updatedUser)),
      reason: `Updated details for ${updatedUser.FullName}`,
    });

    return updatedUser;
  }

  /**
   * Delete or deactivate a user account (Admin only).
   *
   * Strategies supported:
   * - Soft Delete (default): Sets IsActive = 'FALSE'. Preserves historical attendance,
   *   leave logs, and audit trails for institutional compliance, while immediately
   *   blocking login access.
   * - Hard Delete (permanent = true): Physically deletes the user row from the Users worksheet.
   *
   * Safeguards enforced:
   * 1. Administrators cannot delete or deactivate their own account (403).
   * 2. Cannot delete or deactivate the last active Administrator (400).
   * 3. Comprehensive audit logging in ActivityLogs.
   */
  public async deleteUser(
    modifierUser: AuthenticatedUserContext,
    targetUserId: string,
    options?: { permanent?: boolean }
  ): Promise<{ success: boolean; message: string; mode: 'deactivated' | 'deleted' }> {
    if (modifierUser.role !== 'Admin') {
      throw new UserVerificationError('Only Administrators can delete or deactivate user accounts.', 403);
    }

    const allUsers = await this.getAllUsers();
    const targetUser = allUsers.find(
      (u) => (u.UserID || '').trim() === targetUserId.trim()
    );

    if (!targetUser) {
      throw new UserVerificationError('User not found.', 404);
    }

    // Safeguard 1: Self-deletion / deactivation prevention
    if (modifierUser.userId === targetUser.UserID.trim()) {
      throw new UserVerificationError('Administrators cannot delete or deactivate their own account.', 403);
    }

    // Safeguard 2: Last active Admin protection
    const isCurrentlyActiveAdmin =
      targetUser.Role === 'Admin' && this.parseIsActive(targetUser.IsActive);

    if (isCurrentlyActiveAdmin) {
      const activeAdmins = allUsers.filter(
        (u) => u.Role === 'Admin' && this.parseIsActive(u.IsActive)
      );
      if (activeAdmins.length <= 1) {
        throw new UserVerificationError(
          'Cannot delete or deactivate the last active Administrator.',
          400
        );
      }
    }

    const isPermanent = Boolean(options?.permanent);

    if (isPermanent) {
      // Hard Delete: Physically remove row from Google Sheets Users worksheet
      if (googleSheetsService.isLiveApiEnabled()) {
        const actualRow = await googleSheetsService.findRowIndexByColumnValue(
          SHEET_NAMES.USERS,
          'A',
          targetUserId
        );
        const userIdx = allUsers.findIndex(
          (u) => u.UserID.trim() === targetUserId.trim()
        );
        const sheetRowIndex = actualRow !== -1 ? actualRow : (userIdx !== -1 ? userIdx + 2 : -1);

        if (sheetRowIndex !== -1) {
          try {
            await googleSheetsService.deleteSheetRow(SHEET_NAMES.USERS, sheetRowIndex);
          } catch (err: any) {
            console.error('[UserService Error] Failed to delete user from Google Sheets:', err.message);
            throw new UserVerificationError(`Database error deleting user: ${err.message}`, 503);
          }
        }
      }

      // Evict from in-memory caches
      this.cache.delete(targetUserId.trim());
      this.cachedRecords = this.cachedRecords.filter(
        (u) => u.UserID.trim() !== targetUserId.trim()
      );
      this.lastAllUsersFetch = 0;

      await activityLogService.logActivity({
        performedBy: modifierUser.userId,
        action: 'USER_DELETED',
        entityType: 'User',
        entityID: targetUser.UserID,
        previousValue: JSON.stringify(sanitizeUserForLog(targetUser)),
        reason: `Admin ${modifierUser.fullName} permanently deleted user ${targetUser.FullName} (${targetUser.Email})`,
      });

      return {
        success: true,
        message: `User '${targetUser.FullName}' was permanently deleted from the database.`,
        mode: 'deleted',
      };
    } else {
      // Soft Delete (Deactivation): Sets IsActive = 'FALSE'
      const updatedUser: UserRow = {
        ...targetUser,
        IsActive: 'FALSE',
        UpdatedAt: new Date().toISOString(),
      };

      if (googleSheetsService.isLiveApiEnabled()) {
        const actualRow = await googleSheetsService.findRowIndexByColumnValue(
          SHEET_NAMES.USERS,
          'A',
          targetUserId
        );
        const userIdx = allUsers.findIndex(
          (u) => u.UserID.trim() === targetUserId.trim()
        );
        const sheetRowIndex = actualRow !== -1 ? actualRow : (userIdx !== -1 ? userIdx + 2 : -1);

        if (sheetRowIndex !== -1) {
          try {
            await googleSheetsService.updateSheetRange(
              `${SHEET_NAMES.USERS}!F${sheetRowIndex}:H${sheetRowIndex}`,
              [['FALSE', targetUser.CreatedAt, updatedUser.UpdatedAt]]
            );
          } catch (err: any) {
            console.error('[UserService Error] Failed to deactivate user in Google Sheets:', err.message);
            throw new UserVerificationError(`Database error deactivating user: ${err.message}`, 503);
          }
        }
      }

      this.cache.set(targetUserId.trim(), { user: updatedUser, cachedAt: Date.now() });
      this.lastAllUsersFetch = 0;
      this.cachedRecords = [];

      await activityLogService.logActivity({
        performedBy: modifierUser.userId,
        action: 'USER_DEACTIVATED',
        entityType: 'User',
        entityID: targetUser.UserID,
        previousValue: JSON.stringify(sanitizeUserForLog(targetUser)),
        newValue: JSON.stringify(sanitizeUserForLog(updatedUser)),
        reason: `Admin ${modifierUser.fullName} deactivated user ${targetUser.FullName} (${targetUser.Email})`,
      });

      return {
        success: true,
        message: `User '${targetUser.FullName}' was deactivated successfully. Historical records remain preserved.`,
        mode: 'deactivated',
      };
    }
  }

  /**
   * Persist in-memory and Google Sheets row updates for an existing user.
   */
  public async persistUserRow(updatedUser: UserRow): Promise<void> {
    this.cache.set(updatedUser.UserID.trim(), { user: updatedUser, cachedAt: Date.now() });
    this.lastAllUsersFetch = 0;
    this.cachedRecords = [];

    if (!googleSheetsService.isLiveApiEnabled()) {
      return;
    }

    const actualRow = await googleSheetsService.findRowIndexByColumnValue(
      SHEET_NAMES.USERS,
      'A',
      updatedUser.UserID
    );
    const allUsers = await this.getAllUsers();
    const userIdx = allUsers.findIndex(
      (u) => (u.UserID || '').trim() === updatedUser.UserID.trim()
    );
    const sheetRowIndex = actualRow !== -1 ? actualRow : (userIdx !== -1 ? userIdx + 2 : -1);

    if (sheetRowIndex !== -1) {
      try {
        await googleSheetsService.updateSheetRange(
          `${SHEET_NAMES.USERS}!A${sheetRowIndex}:O${sheetRowIndex}`,
          [
            [
              updatedUser.UserID,
              updatedUser.FullName,
              updatedUser.Email,
              updatedUser.Role,
              updatedUser.JoiningDate,
              updatedUser.IsActive,
              updatedUser.CreatedAt,
              updatedUser.UpdatedAt,
              updatedUser.PasswordHash || '',
              updatedUser.MustChangePassword || '',
              updatedUser.ResetToken || '',
              updatedUser.ResetOtp || '',
              updatedUser.ResetTokenExpires || '',
              updatedUser.ResetOtpAttempts !== undefined ? String(updatedUser.ResetOtpAttempts) : '',
              updatedUser.PasswordChangedAt || '',
            ],
          ]
        );
      } catch (err: any) {
        console.error('[UserService Error] Failed to persist user row to Google Sheets:', err.message);
        throw new UserVerificationError(`Database error saving user credentials: ${err.message}`, 503);
      }
    }
  }

  /**
   * Authenticate employee via Email and Password.
   * Verifies account exists, isActive, role validity, and checks bcrypt/scrypt hash.
   */
  public async loginWithPassword(
    email: string,
    plainPassword: string
  ): Promise<AuthenticatedUserContext> {
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail || !plainPassword) {
      throw new UserVerificationError('Email and password are required.', 400);
    }

    const user = await this.getUserByEmail(normalizedEmail);
    if (!user) {
      throw new UserVerificationError('Invalid email or password.', 401);
    }

    const isActive = this.parseIsActive(user.IsActive);
    if (!isActive) {
      throw new UserVerificationError('Your account is inactive. Please contact the administrator.', 401);
    }

    const rawRole = (user.Role || '').trim();
    if (!VALID_ROLES.includes(rawRole as ValidRole)) {
      throw new UserVerificationError('Invalid account role. Please contact the administrator.', 403);
    }

    if (!user.PasswordHash || user.PasswordHash.trim().length === 0) {
      throw new UserVerificationError('Invalid email or password.', 401);
    }

    const isMatch = await verifyPassword(plainPassword, user.PasswordHash);
    if (!isMatch) {
      throw new UserVerificationError('Invalid email or password.', 401);
    }

    // Transparent zero-downtime hash migration:
    // If the account is using a legacy v1 unpeppered hash, upgrade it to peppered v2 in the background
    if (needsRehash(user.PasswordHash)) {
      const upgradedHash = await hashPassword(plainPassword);
      const rehashedUser: UserRow = {
        ...user,
        PasswordHash: upgradedHash,
        UpdatedAt: new Date().toISOString(),
      };
      this.persistUserRow(rehashedUser).catch((err) => {
        console.warn(`[UserService] Transparent password rehash failed for ${user.UserID}:`, err?.message);
      });
    }

    const mustChange = this.parseIsActive(user.MustChangePassword);

    return {
      userId: user.UserID.trim(),
      fullName: user.FullName.trim(),
      email: (user.Email || '').trim().toLowerCase(),
      role: rawRole as ValidRole,
      isActive: true,
      mustChangePassword: mustChange,
      passwordChangedAt: user.PasswordChangedAt || undefined,
    };
  }

  /**
   * Change user password (for first-time forced change or user settings).
   */
  public async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new UserVerificationError('User account not found.', 404);
    }

    const isActive = this.parseIsActive(user.IsActive);
    if (!isActive) {
      throw new UserVerificationError('Your account is inactive.', 401);
    }

    // If an existing password hash is present, verify current password
    if (user.PasswordHash && user.PasswordHash.trim().length > 0) {
      const isCurrentValid = await verifyPassword(currentPassword, user.PasswordHash);
      if (!isCurrentValid) {
        throw new UserVerificationError('Current password is incorrect.', 400);
      }
    }

    // Validate new password strength
    const strength = validatePasswordStrength(newPassword);
    if (!strength.isValid) {
      throw new UserVerificationError(strength.errors.join(' '), 400);
    }

    if (currentPassword && currentPassword === newPassword) {
      throw new UserVerificationError('New password must be different from your current password.', 400);
    }

    const newHash = await hashPassword(newPassword);
    const now = new Date().toISOString();

    const updatedUser: UserRow = {
      ...user,
      PasswordHash: newHash,
      MustChangePassword: 'FALSE',
      ResetToken: '',
      ResetOtp: '',
      ResetTokenExpires: '',
      ResetOtpAttempts: 0,
      PasswordChangedAt: now,
      UpdatedAt: now,
    };

    await this.persistUserRow(updatedUser);

    await activityLogService.logActivity({
      performedBy: user.UserID,
      action: 'USER_PASSWORD_CHANGED',
      entityType: 'User',
      entityID: user.UserID,
      reason: `Password updated for ${user.FullName}`,
    });
  }

  /**
   * Create a password reset request. Generates BOTH:
   * - Strategy A: 32-byte cryptographic reset link token
   * - Strategy B: 6-digit numeric OTP code
   * Valid for 15 minutes.
   */
  public async createPasswordResetRequest(
    email: string
  ): Promise<{ success: boolean; message: string; debugToken?: string; debugOtp?: string }> {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const genericResponse = {
      success: true,
      message: 'If an account exists with this email address, a password reset link and verification code have been sent.',
    };

    if (!normalizedEmail) {
      return genericResponse;
    }

    let user: UserRow | null = null;
    try {
      user = await this.getUserByEmail(normalizedEmail);
    } catch {
      return genericResponse;
    }

    if (!user || !this.parseIsActive(user.IsActive)) {
      return genericResponse;
    }

    const rawToken = generateCryptoToken();
    const rawOtp = generateOtp(6);
    const tokenHash = hashToken(rawToken);
    const otpHash = hashToken(rawOtp);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins
    const now = new Date().toISOString();

    const updatedUser: UserRow = {
      ...user,
      ResetToken: tokenHash,
      ResetOtp: otpHash,
      ResetTokenExpires: expiresAt,
      ResetOtpAttempts: 0,
      UpdatedAt: now,
    };

    await this.persistUserRow(updatedUser);

    const resetLink = `${config.frontendUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.Email)}`;

    try {
      await emailService.sendPasswordResetEmail({
        staffName: user.FullName,
        staffEmail: user.Email,
        resetLink,
        otpCode: rawOtp,
        expiresInMinutes: 15,
      });
    } catch (err: any) {
      console.error('[UserService] Failed to dispatch password reset email:', err.message);
    }

    await activityLogService.logActivity({
      performedBy: 'SYSTEM',
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'User',
      entityID: user.UserID,
      reason: `Password reset requested for ${user.FullName} (${user.Email})`,
    });

    return {
      ...genericResponse,
      ...(process.env.NODE_ENV === 'test' ? { debugToken: rawToken, debugOtp: rawOtp } : {}),
    };
  }

  /**
   * Reset user password using either Strategy A (Token from link) or Strategy B (6-Digit OTP).
   * Enforces brute-force lockout: invalid attempts are tracked (max 5) before invalidating the code.
   */
  public async resetPasswordWithTokenOrOtp(
    email: string,
    tokenOrOtp: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const cleanTokenOrOtp = (tokenOrOtp || '').trim();

    if (!normalizedEmail || !cleanTokenOrOtp || !newPassword) {
      throw new UserVerificationError('Email, verification code/token, and new password are required.', 400);
    }

    const user = await this.getUserByEmail(normalizedEmail);
    if (!user) {
      throw new UserVerificationError('Invalid or expired password reset request.', 400);
    }

    if (!this.parseIsActive(user.IsActive)) {
      throw new UserVerificationError('Account is inactive. Please contact the administrator.', 401);
    }

    if (!user.ResetTokenExpires) {
      throw new UserVerificationError('No active password reset request found. Please request a new one.', 400);
    }

    const now = new Date();
    const expiry = new Date(user.ResetTokenExpires);
    if (now > expiry) {
      throw new UserVerificationError('Password reset link or verification code has expired. Please request a new one.', 400);
    }

    // Check brute-force lockout threshold
    const currentAttempts = Number(user.ResetOtpAttempts) || 0;
    if (currentAttempts >= 5) {
      throw new UserVerificationError(
        'Too many failed verification attempts. This password reset request has been invalidated. Please request a new code.',
        400
      );
    }

    // Verify token or OTP against stored hashes
    const providedHash = hashToken(cleanTokenOrOtp);
    const matchesToken = user.ResetToken && user.ResetToken.trim() === providedHash;
    const matchesOtp = user.ResetOtp && user.ResetOtp.trim() === providedHash;

    if (!matchesToken && !matchesOtp) {
      const nextAttempts = currentAttempts + 1;
      if (nextAttempts >= 5) {
        // Invalidate reset tokens permanently upon reaching 5 failed attempts
        await this.persistUserRow({
          ...user,
          ResetToken: '',
          ResetOtp: '',
          ResetTokenExpires: '',
          ResetOtpAttempts: 0,
          UpdatedAt: new Date().toISOString(),
        });

        await activityLogService.logActivity({
          performedBy: 'SYSTEM',
          action: 'PASSWORD_RESET_LOCKED',
          entityType: 'User',
          entityID: user.UserID,
          reason: `Too many failed password reset attempts for ${user.FullName} (${user.Email}). Reset code invalidated.`,
        });

        throw new UserVerificationError(
          'Too many failed verification attempts. This password reset request has been invalidated. Please request a new code.',
          400
        );
      } else {
        await this.persistUserRow({
          ...user,
          ResetOtpAttempts: nextAttempts,
          UpdatedAt: new Date().toISOString(),
        });

        const remaining = 5 - nextAttempts;
        throw new UserVerificationError(
          `Invalid verification code or reset link. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before code is invalidated.`,
          400
        );
      }
    }

    // Validate new password strength
    const strength = validatePasswordStrength(newPassword);
    if (!strength.isValid) {
      throw new UserVerificationError(strength.errors.join(' '), 400);
    }

    const newHash = await hashPassword(newPassword);
    const nowIso = new Date().toISOString();

    const updatedUser: UserRow = {
      ...user,
      PasswordHash: newHash,
      MustChangePassword: 'FALSE',
      ResetToken: '',
      ResetOtp: '',
      ResetTokenExpires: '',
      ResetOtpAttempts: 0,
      PasswordChangedAt: nowIso,
      UpdatedAt: nowIso,
    };

    await this.persistUserRow(updatedUser);

    await activityLogService.logActivity({
      performedBy: user.UserID,
      action: 'PASSWORD_RESET_COMPLETED',
      entityType: 'User',
      entityID: user.UserID,
      reason: `Password successfully reset via ${matchesToken ? 'link token' : 'OTP'} for ${user.FullName}`,
    });

    return {
      success: true,
      message: 'Password has been reset successfully. You may now sign in with your new password.',
    };
  }

  /**
   * Strategy C: Administrative Reset Fallback.
   * Admin generates a fresh temporary password for an employee and emails them.
   */
  public async adminResetPassword(
    adminUser: AuthenticatedUserContext,
    targetUserId: string
  ): Promise<{ success: boolean; temporaryPassword: string; message: string }> {
    if (adminUser.role !== 'Admin') {
      throw new UserVerificationError('Only Administrators can reset staff passwords.', 403);
    }

    const user = await this.getUserById(targetUserId);
    if (!user) {
      throw new UserVerificationError('User account not found.', 404);
    }

    const tempPassword = generateRandomPassword(10);
    const passwordHash = await hashPassword(tempPassword);
    const nowIso = new Date().toISOString();

    const updatedUser: UserRow = {
      ...user,
      PasswordHash: passwordHash,
      MustChangePassword: 'TRUE',
      ResetToken: '',
      ResetOtp: '',
      ResetTokenExpires: '',
      ResetOtpAttempts: 0,
      PasswordChangedAt: nowIso,
      UpdatedAt: nowIso,
    };

    await this.persistUserRow(updatedUser);

    // Send credentials email
    try {
      await emailService.sendWelcomeCredentialsEmail({
        staffName: user.FullName,
        staffEmail: user.Email,
        temporaryPassword: tempPassword,
        loginUrl: `${config.frontendUrl}/login`,
      });
    } catch (err: any) {
      console.error('[UserService] Failed to dispatch admin-reset email:', err.message);
    }

    await activityLogService.logActivity({
      performedBy: adminUser.userId,
      action: 'ADMIN_PASSWORD_RESET',
      entityType: 'User',
      entityID: user.UserID,
      reason: `Admin ${adminUser.fullName} reset password for ${user.FullName} (${user.Email})`,
    });

    return {
      success: true,
      temporaryPassword: tempPassword,
      message: `Password has been reset and emailed to ${user.Email}.`,
    };
  }

  /**
   * Direct injection method for testing without live Google Sheets.
   */
  public setMockUser(user: UserRow): void {
    this.isMockMode = true;
    const now = Date.now();
    this.cache.set(user.UserID.trim(), { user, cachedAt: now });
  }

  /**
   * Mock users collection setter for testing duplicate email scenarios.
   */
  public setMockUsersList(users: UserRow[]): void {
    this.isMockMode = true;
    this.clearCache();
    this.isMockMode = true;
    users.forEach((u) => {
      this.cache.set(u.UserID.trim(), { user: u, cachedAt: Date.now() });
    });
  }
}

export class UserVerificationError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'UserVerificationError';
    this.statusCode = statusCode;
  }
}

export const userService = new UserService();
