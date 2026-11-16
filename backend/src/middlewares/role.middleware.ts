import { Request, Response, NextFunction } from 'express';
import { ValidRole } from '../config/sheets.config.js';

/**
 * Reusable role-based access control (RBAC) middleware.
 * Verifies that the authenticated user possesses one of the allowed roles.
 */
export function requireRole(allowedRoles: ValidRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. User context not established.',
      });
      return;
    }

    const currentRole = req.user.role;

    if (!allowedRoles.includes(currentRole)) {
      res.status(403).json({
        success: false,
        message: `Forbidden: Access requires one of the following roles: [${allowedRoles.join(', ')}]. Current role: '${currentRole}'.`,
      });
      return;
    }

    next();
  };
}

/**
 * Staff-level access (Accessible by Staff and Admin)
 */
export const requireStaff = requireRole(['Staff', 'Admin']);

/**
 * Management / Admin-level access (Accessible ONLY by Admin)
 */
export const requireManager = requireRole(['Admin']);

/**
 * Admin-level access (Accessible ONLY by Admin)
 */
export const requireAdmin = requireRole(['Admin']);
