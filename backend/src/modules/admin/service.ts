import { Request, Response } from 'express';
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
