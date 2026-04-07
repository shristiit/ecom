import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@backend/config/env.js';
import { query } from '@backend/db/pool.js';

export interface AuthUser {
  id: string;
  tenantId: string;
  roleId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authGuard(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing token' });
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as any;
    const { sub, tenantId, roleId } = payload;

    const userRes = await query(
      `SELECT id, tenant_id, role_id, email FROM users WHERE id = $1 AND status = 'active'`,
      [sub]
    );
    if (userRes.rowCount === 0) return res.status(401).json({ message: 'User not found' });

    req.user = {
      id: userRes.rows[0].id,
      tenantId: userRes.rows[0].tenant_id,
      roleId: userRes.rows[0].role_id,
      email: userRes.rows[0].email,
    };
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.tenantId) return res.status(401).json({ message: 'Missing tenant' });
  next();
}

export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthenticated' });
    const roleRes = await query(
      `SELECT permissions FROM roles WHERE id = $1 AND tenant_id = $2`,
      [req.user.roleId, req.user.tenantId]
    );
    if (roleRes.rowCount === 0) return res.status(403).json({ message: 'Role not found' });
    const permissions: string[] = roleRes.rows[0].permissions ?? [];
    if (!permissions.includes(permission)) return res.status(403).json({ message: 'Forbidden' });
    next();
  };
}
