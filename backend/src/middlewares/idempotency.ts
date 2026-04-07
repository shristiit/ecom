import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { query } from '@backend/db/pool.js';

export function idempotencyGuard(getTenantId: (req: Request) => string | null) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const method = req.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next();

    const key = String(req.headers['idempotency-key'] ?? '').trim();
    if (!key) return res.status(400).json({ message: 'Idempotency-Key header required' });

    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant required for idempotency' });

    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(req.body ?? {}))
      .update(method)
      .update(req.originalUrl)
      .digest('hex');

    const existing = await query(
      `SELECT status_code, response_body, request_hash FROM idempotency_keys WHERE tenant_id = $1 AND key = $2`,
      [tenantId, key]
    );

    if (existing.rowCount) {
      const row = existing.rows[0];
      if (row.request_hash !== requestHash) {
        return res.status(409).json({ message: 'Idempotency-Key reuse with different payload' });
      }
      return res.status(row.status_code).json(row.response_body);
    }

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    const store = (body: any) => {
      const statusCode = res.statusCode ?? 200;
      query(
        `INSERT INTO idempotency_keys (tenant_id, key, method, path, request_hash, status_code, response_body)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [tenantId, key, method, req.originalUrl, requestHash, statusCode, body ?? {}]
      ).catch(() => undefined);
    };

    res.json = (body: any) => {
      store(body);
      return originalJson(body);
    };
    res.send = (body: any) => {
      store(body);
      return originalSend(body);
    };

    next();
  };
}
