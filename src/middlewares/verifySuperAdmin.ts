import { Request, Response, NextFunction } from 'express';

/**
 * Only admins with role_id "1" (super admin — see scripts/createAdmin.ts) may access these routes.
 * Runs after verifyAdmin (expects req.user.id and req.user.role_id from decoded JWT + DB load).
 */
export function verifySuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const roleRaw = req.user?.role_id as string | number | bigint | undefined;
  const roleStr =
    roleRaw !== undefined && roleRaw !== null ? String(roleRaw).trim() : '';
  if (roleStr !== '1') {
    res.status(403).json({ status: false, msg: 'Super admin access required' });
    return;
  }
  next();
}
