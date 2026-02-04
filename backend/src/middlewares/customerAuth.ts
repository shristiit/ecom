import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import { query } from '../db/pool.js';

export interface CustomerAuth {
  id: string;
  tenantId: string;
  role: 'owner' | 'staff' | 'customer';
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      customer?: CustomerAuth;
    }
  }
}

export async function customerAuthGuard(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing token' });
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload.type !== 'customer') return res.status(401).json({ message: 'Invalid token type' });

    const result = await query(
      `SELECT id, tenant_id, role, email FROM customers WHERE id = $1 AND status = 'active'`,
      [payload.sub]
    );
    if (result.rowCount === 0) return res.status(401).json({ message: 'Customer not found' });

    const row = result.rows[0];
    req.customer = {
      id: row.id,
      tenantId: row.tenant_id,
      role: row.role,
      email: row.email,
    };
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function requireCustomerRole(roles: Array<'owner' | 'staff' | 'customer'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.customer) return res.status(401).json({ message: 'Unauthenticated' });
    if (!roles.includes(req.customer.role)) return res.status(403).json({ message: 'Forbidden' });
    next();
  };
}
