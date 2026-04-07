import { Request, Response } from 'express';
import { z } from 'zod';
import { query } from '@backend/db/pool.js';

const locationSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  type: z.string().min(2),
  address: z.string().optional().default(''),
  status: z.enum(['active', 'inactive']).default('active'),
});

const partySchema = z.object({
  name: z.string().min(2),
  email: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  address: z.string().optional().default(''),
  status: z.enum(['active', 'inactive']).default('active'),
});

const categorySchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
});

export async function listLocations(req: Request, res: Response) {
  const rows = await query(`SELECT * FROM locations WHERE tenant_id = $1 ORDER BY name`, [req.user!.tenantId]);
  res.json(rows.rows);
}

export async function createLocation(req: Request, res: Response) {
  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const l = parsed.data;
  const rows = await query(
    `INSERT INTO locations (tenant_id, name, code, type, address, status)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user!.tenantId, l.name, l.code, l.type, l.address, l.status]
  );
  res.status(201).json(rows.rows[0]);
}

export async function updateLocation(req: Request, res: Response) {
  const parsed = locationSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const l = parsed.data;
  const rows = await query(
    `UPDATE locations SET
      name = COALESCE($1,name), code = COALESCE($2,code), type = COALESCE($3,type),
      address = COALESCE($4,address), status = COALESCE($5,status), updated_at = NOW()
     WHERE id = $6 AND tenant_id = $7 RETURNING *`,
    [l.name ?? null, l.code ?? null, l.type ?? null, l.address ?? null, l.status ?? null, req.params.id, req.user!.tenantId]
  );
  if (rows.rowCount === 0) return res.status(404).json({ message: 'Not found' });
  res.json(rows.rows[0]);
}

export async function deleteLocation(req: Request, res: Response) {
  await query(`DELETE FROM locations WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.user!.tenantId]);
  res.status(204).send();
}

export async function listSuppliers(req: Request, res: Response) {
  const rows = await query(`SELECT * FROM suppliers WHERE tenant_id = $1 ORDER BY name`, [req.user!.tenantId]);
  res.json(rows.rows);
}

export async function createSupplier(req: Request, res: Response) {
  const parsed = partySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const p = parsed.data;
  const rows = await query(
    `INSERT INTO suppliers (tenant_id, name, email, phone, address, status)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user!.tenantId, p.name, p.email, p.phone, p.address, p.status]
  );
  res.status(201).json(rows.rows[0]);
}

export async function updateSupplier(req: Request, res: Response) {
  const parsed = partySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const p = parsed.data;
  const rows = await query(
    `UPDATE suppliers SET
      name = COALESCE($1,name), email = COALESCE($2,email), phone = COALESCE($3,phone),
      address = COALESCE($4,address), status = COALESCE($5,status), updated_at = NOW()
     WHERE id = $6 AND tenant_id = $7 RETURNING *`,
    [p.name ?? null, p.email ?? null, p.phone ?? null, p.address ?? null, p.status ?? null, req.params.id, req.user!.tenantId]
  );
  if (rows.rowCount === 0) return res.status(404).json({ message: 'Not found' });
  res.json(rows.rows[0]);
}

export async function deleteSupplier(req: Request, res: Response) {
  await query(`DELETE FROM suppliers WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.user!.tenantId]);
  res.status(204).send();
}

export async function listCustomers(req: Request, res: Response) {
  const rows = await query(`SELECT * FROM customers WHERE tenant_id = $1 ORDER BY name`, [req.user!.tenantId]);
  res.json(rows.rows);
}

export async function createCustomer(req: Request, res: Response) {
  const parsed = partySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const p = parsed.data;
  const rows = await query(
    `INSERT INTO customers (tenant_id, name, email, phone, address, status)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user!.tenantId, p.name, p.email, p.phone, p.address, p.status]
  );
  res.status(201).json(rows.rows[0]);
}

export async function updateCustomer(req: Request, res: Response) {
  const parsed = partySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const p = parsed.data;
  const rows = await query(
    `UPDATE customers SET
      name = COALESCE($1,name), email = COALESCE($2,email), phone = COALESCE($3,phone),
      address = COALESCE($4,address), status = COALESCE($5,status), updated_at = NOW()
     WHERE id = $6 AND tenant_id = $7 RETURNING *`,
    [p.name ?? null, p.email ?? null, p.phone ?? null, p.address ?? null, p.status ?? null, req.params.id, req.user!.tenantId]
  );
  if (rows.rowCount === 0) return res.status(404).json({ message: 'Not found' });
  res.json(rows.rows[0]);
}

export async function deleteCustomer(req: Request, res: Response) {
  await query(`DELETE FROM customers WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.user!.tenantId]);
  res.status(204).send();
}

export async function listCategories(req: Request, res: Response) {
  const rows = await query(`SELECT * FROM categories WHERE tenant_id = $1 ORDER BY name`, [req.user!.tenantId]);
  res.json(rows.rows);
}

export async function createCategory(req: Request, res: Response) {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const c = parsed.data;
  const rows = await query(
    `INSERT INTO categories (tenant_id, name, slug) VALUES ($1,$2,$3) RETURNING *`,
    [req.user!.tenantId, c.name, c.slug]
  );
  res.status(201).json(rows.rows[0]);
}

export async function updateCategory(req: Request, res: Response) {
  const parsed = categorySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const c = parsed.data;
  const rows = await query(
    `UPDATE categories SET name = COALESCE($1,name), slug = COALESCE($2,slug), updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4 RETURNING *`,
    [c.name ?? null, c.slug ?? null, req.params.id, req.user!.tenantId]
  );
  if (rows.rowCount === 0) return res.status(404).json({ message: 'Not found' });
  res.json(rows.rows[0]);
}

export async function deleteCategory(req: Request, res: Response) {
  await query(`DELETE FROM categories WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.user!.tenantId]);
  res.status(204).send();
}
