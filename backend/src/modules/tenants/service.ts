import { Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';

const schema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
});

export async function createTenant(req: Request, res: Response) {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const { name, slug } = parsed.data;
  const result = await query(
    `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id, name, slug`,
    [name, slug]
  );
  res.status(201).json(result.rows[0]);
}

export async function getTenant(req: Request, res: Response) {
  const result = await query(`SELECT id, name, slug, status FROM tenants WHERE id = $1`, [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
  res.json(result.rows[0]);
}
