import { Request, Response, NextFunction } from 'express';
import { query } from '@backend/db/pool.js';
import {
  getTenantControlState,
  getReadAccessDenial,
  recordTenantAuditEvent,
  getWriteAccessDenial,
  type TenantControlState,
} from '@backend/modules/platform/control-plane.js';
import { verifyToken } from '@backend/utils/jwt.js';

export interface AuthUser {
  principalType: 'tenant_user' | 'platform_admin';
  id: string;
  tenantId: string;
  tenantSlug: string;
  tenantLifecycleStatus: string;
  roleId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      tenantAccess?: TenantControlState;
    }
  }
}

export async function authGuard(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing token' });
    const token = header.slice(7);
    const payload = verifyToken(token);
    const principalType = payload.principalType ?? 'tenant_user';

    if (principalType === 'platform_admin') {
      const adminRes = await query(
        `SELECT id, email FROM platform_admins WHERE id = $1 AND status = 'active'`,
        [payload.sub],
      );
      if (adminRes.rowCount === 0) return res.status(401).json({ message: 'Platform admin not found' });

      req.user = {
        principalType: 'platform_admin',
        id: adminRes.rows[0].id,
        tenantId: '',
        tenantSlug: '',
        tenantLifecycleStatus: '',
        roleId: '',
        email: adminRes.rows[0].email,
      };
      next();
      return;
    }

    const userRes = await query(
      `SELECT u.id, u.tenant_id, u.role_id, u.email, t.slug, t.lifecycle_status
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1 AND u.status = 'active'`,
      [payload.sub],
    );
    if (userRes.rowCount === 0) return res.status(401).json({ message: 'User not found' });

    req.user = {
      principalType: 'tenant_user',
      id: userRes.rows[0].id,
      tenantId: userRes.rows[0].tenant_id,
      tenantSlug: userRes.rows[0].slug,
      tenantLifecycleStatus: userRes.rows[0].lifecycle_status,
      roleId: userRes.rows[0].role_id,
      email: userRes.rows[0].email,
    };
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function requireTenantUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.principalType !== 'tenant_user' || !req.user.tenantId || !req.user.roleId) {
    return res.status(403).json({ message: 'Tenant user access required' });
  }
  next();
}

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.principalType !== 'platform_admin') {
    return res.status(403).json({ message: 'Platform admin access required' });
  }
  next();
}

export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.principalType !== 'tenant_user' || !req.user.tenantId) {
    return res.status(401).json({ message: 'Missing tenant' });
  }
  next();
}

async function loadTenantAccess(req: Request) {
  if (!req.user || req.user.principalType !== 'tenant_user' || !req.user.tenantId) {
    throw new Error('Tenant access requested for non-tenant principal');
  }
  if (!req.tenantAccess) {
    req.tenantAccess = await getTenantControlState(req.user.tenantId);
  }
  return req.tenantAccess;
}

export function requireTenantFeatureAccess(feature?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || req.user.principalType !== 'tenant_user') {
      return res.status(401).json({ message: 'Unauthenticated' });
    }
    const access = await loadTenantAccess(req);
    const denial = getReadAccessDenial(access, feature);
    if (denial) {
      await recordTenantAuditEvent({
        tenantId: req.user.tenantId,
        actorType: 'tenant_user',
        actorId: req.user.id,
        eventType: 'tenant.access.denied',
        payload: { code: denial.code, feature: feature ?? null, path: req.path, method: req.method },
      });
      return res.status(403).json({ message: denial.message, code: denial.code });
    }
    next();
  };
}

export function requireActiveTenantAccess(feature?: string) {
  return requireTenantFeatureAccess(feature);
}

export function requireTenantWriteAccess(options?: { feature?: string }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || req.user.principalType !== 'tenant_user') {
      return res.status(401).json({ message: 'Unauthenticated' });
    }
    const access = await loadTenantAccess(req);
    const denial = getWriteAccessDenial(access, options?.feature);
    if (denial) {
      await recordTenantAuditEvent({
        tenantId: req.user.tenantId,
        actorType: 'tenant_user',
        actorId: req.user.id,
        eventType: 'tenant.write.denied',
        payload: { code: denial.code, feature: options?.feature ?? null, path: req.path, method: req.method },
      });
      return res.status(403).json({ message: denial.message, code: denial.code });
    }
    next();
  };
}

export function requireTenantPermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || req.user.principalType !== 'tenant_user' || !req.user.roleId || !req.user.tenantId) {
      return res.status(401).json({ message: 'Unauthenticated' });
    }
    const roleRes = await query(
      `SELECT permissions FROM roles WHERE id = $1 AND tenant_id = $2`,
      [req.user.roleId, req.user.tenantId],
    );
    if (roleRes.rowCount === 0) return res.status(403).json({ message: 'Role not found' });
    const permissions: string[] = roleRes.rows[0].permissions ?? [];
    if (!permissions.includes(permission)) return res.status(403).json({ message: 'Forbidden' });
    next();
  };
}

export const requirePermission = requireTenantPermission;
