import { Request, Response, NextFunction } from 'express';

export type UserRole = 'STAFF' | 'MANAGER' | 'ADMIN';

/**
 * Role-based authorization middleware.
 * Verifies that the authenticated user possesses one of the allowed roles.
 * Note: User role lookup will be integrated with the Google Sheets Users table in Phase 2.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized: User not authenticated',
      });
      return;
    }

    const userRole = (req.user.role as UserRole) || 'STAFF';

    if (!allowedRoles.includes(userRole)) {
      res.status(403).json({
        success: false,
        message: `Forbidden: Requires one of the following roles: [${allowedRoles.join(', ')}]`,
      });
      return;
    }

    next();
  };
}
