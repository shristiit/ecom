import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { query } from '../../db/pool.js';

const roleSchema = z.object({
  name: z.string().min(2),
  permissions: z.array(z.string()).default([]),
});

const policySchema = z.object({
  name: z.string().min(2),
  rules: z.array(z.object({ type: z.string(), params: z.record(z.any()) })).default([]),
});

const userStatusSchema = z.object({
  status: z.enum(['active', 'disabled']),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8),
});

export async function listUsers(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20) || 20));
  const offset = (page - 1) * pageSize;

  const search = String(req.query.search ?? '').trim();
  const roleId = String(req.query.roleId ?? '').trim();
  const status = String(req.query.status ?? '').trim();

  const totalRes = await query(
    `SELECT COUNT(*)::int AS total
     FROM users u
     WHERE u.tenant_id = $1
       AND ($2::text = '' OR u.email ILIKE '%' || $2 || '%' OR u.username ILIKE '%' || $2 || '%')
       AND ($3::text = '' OR u.role_id::text = $3)
       AND ($4::text = '' OR u.status::text = $4)`,
    [req.user!.tenantId, search, roleId, status],
  );

  const rows = await query(
    `SELECT
       u.id,
       u.tenant_id,
       u.email,
       u.username,
       u.status,
       u.last_login_at,
       u.created_at,
       u.updated_at,
       r.id AS role_id,
       r.name AS role_name,
       r.permissions
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.tenant_id = $1
       AND ($2::text = '' OR u.email ILIKE '%' || $2 || '%' OR u.username ILIKE '%' || $2 || '%')
       AND ($3::text = '' OR u.role_id::text = $3)
       AND ($4::text = '' OR u.status::text = $4)
     ORDER BY u.updated_at DESC
     LIMIT $5 OFFSET $6`,
    [req.user!.tenantId, search, roleId, status, pageSize, offset],
  );

  res.json({
    items: rows.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      email: row.email,
      fullName: row.username,
      status: row.status,
      roles: [{ id: row.role_id, name: row.role_name }],
      permissions: row.permissions ?? [],
      lastActiveAt: row.last_login_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    total: Number(totalRes.rows[0]?.total ?? rows.rows.length),
    page,
    pageSize,
  });
}

export async function getUser(req: Request, res: Response) {
  const rowRes = await query(
    `SELECT
       u.id,
       u.tenant_id,
       u.email,
       u.username,
       u.status,
       u.last_login_at,
       u.created_at,
       u.updated_at,
       r.id AS role_id,
       r.name AS role_name,
       r.permissions
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.tenant_id = $1 AND u.id = $2`,
    [req.user!.tenantId, req.params.id],
  );

  if (rowRes.rowCount === 0) return res.status(404).json({ message: 'Not found' });
  const row = rowRes.rows[0];

  const auditRes = await query(
    `SELECT id, created_at, why FROM audit_records
     WHERE tenant_id = $1 AND who = $2
     ORDER BY created_at DESC
     LIMIT 25`,
    [req.user!.tenantId, req.params.id],
  );

  res.json({
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    fullName: row.username,
    status: row.status,
    roles: [{ id: row.role_id, name: row.role_name }],
    permissions: row.permissions ?? [],
    lastActiveAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recentAudit: auditRes.rows,
  });
}

export async function updateUserStatus(req: Request, res: Response) {
  const parsed = userStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  const result = await query(
    `UPDATE users SET status = $1, updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3
     RETURNING id, status`,
    [parsed.data.status, req.params.id, req.user!.tenantId],
  );

  if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
  res.json(result.rows[0]);
}

export async function resetUserPassword(req: Request, res: Response) {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const result = await query(
    `UPDATE users SET password_hash = $1, updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3
     RETURNING id`,
    [passwordHash, req.params.id, req.user!.tenantId],
  );

  if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
  res.json({ ok: true });
}

export async function listRoles(req: Request, res: Response) {
  const rows = await query(
    `SELECT id, name, permissions FROM roles WHERE tenant_id = $1 ORDER BY name`,
    [req.user!.tenantId]
  );
  res.json(rows.rows);
}

export async function createRole(req: Request, res: Response) {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const { name, permissions } = parsed.data;
  const result = await query(
    `INSERT INTO roles (tenant_id, name, permissions) VALUES ($1, $2, $3) RETURNING id, name, permissions`,
    [req.user!.tenantId, name, permissions]
  );
  res.status(201).json(result.rows[0]);
}

export async function updateRole(req: Request, res: Response) {
  const parsed = roleSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const { name, permissions } = parsed.data;
  const result = await query(
    `UPDATE roles SET name = COALESCE($1, name), permissions = COALESCE($2, permissions), updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4 RETURNING id, name, permissions`,
    [name ?? null, permissions ?? null, req.params.id, req.user!.tenantId]
  );
  if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
  res.json(result.rows[0]);
}

export async function deleteRole(req: Request, res: Response) {
  await query(`DELETE FROM roles WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.user!.tenantId]);
  res.status(204).send();
}

export async function listPolicies(req: Request, res: Response) {
  const rows = await query(
    `SELECT id, name, rules FROM policies WHERE tenant_id = $1 ORDER BY name`,
    [req.user!.tenantId]
  );
  res.json(rows.rows);
}

export async function createPolicy(req: Request, res: Response) {
  const parsed = policySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const { name, rules } = parsed.data;
  const result = await query(
    `INSERT INTO policies (tenant_id, name, rules) VALUES ($1, $2, $3) RETURNING id, name, rules`,
    [req.user!.tenantId, name, rules]
  );
  res.status(201).json(result.rows[0]);
}

export async function updatePolicy(req: Request, res: Response) {
  const parsed = policySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const { name, rules } = parsed.data;
  const result = await query(
    `UPDATE policies SET name = COALESCE($1, name), rules = COALESCE($2, rules), updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4 RETURNING id, name, rules`,
    [name ?? null, rules ?? null, req.params.id, req.user!.tenantId]
  );
  if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
  res.json(result.rows[0]);
}

export async function deletePolicy(req: Request, res: Response) {
  await query(`DELETE FROM policies WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.user!.tenantId]);
  res.status(204).send();
}
