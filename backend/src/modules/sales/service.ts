import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';

const lineSchema = z.object({
  sizeId: z.string().uuid(),
  qty: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
});

const invoiceSchema = z.object({
  customerId: z.string().uuid(),
  lines: z.array(lineSchema).min(1),
});

const dispatchSchema = z.object({
  locationId: z.string().uuid(),
  confirm: z.boolean().default(false),
});

export async function createInvoice(req: Request, res: Response) {
  const parsed = invoiceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const body = parsed.data;
  const total = body.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invRes = await client.query(
      `INSERT INTO invoices (tenant_id, customer_id, status, total, created_by)
       VALUES ($1,$2,'draft',$3,$4) RETURNING id`,
      [req.user!.tenantId, body.customerId, total, req.user!.id]
    );
    const id = invRes.rows[0].id;
    for (const line of body.lines) {
      await client.query(
        `INSERT INTO invoice_lines (tenant_id, invoice_id, size_id, qty, unit_price)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.user!.tenantId, id, line.sizeId, line.qty, line.unitPrice]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ id });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ message: err.message ?? 'Failed' });
  } finally {
    client.release();
  }
}

export async function updateInvoice(req: Request, res: Response) {
  const parsed = invoiceSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const body = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invRes = await client.query(
      `UPDATE invoices SET customer_id = COALESCE($1, customer_id), updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3 AND status = 'draft' RETURNING id`,
      [body.customerId ?? null, req.params.id, req.user!.tenantId]
    );
    if (invRes.rowCount === 0) throw new Error('Invoice not found or not editable');
    if (body.lines) {
      await client.query(`DELETE FROM invoice_lines WHERE invoice_id = $1 AND tenant_id = $2`, [req.params.id, req.user!.tenantId]);
      for (const line of body.lines as any[]) {
        await client.query(
          `INSERT INTO invoice_lines (tenant_id, invoice_id, size_id, qty, unit_price)
           VALUES ($1,$2,$3,$4,$5)`,
          [req.user!.tenantId, req.params.id, line.sizeId, line.qty, line.unitPrice]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ id: req.params.id });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ message: err.message ?? 'Failed' });
  } finally {
    client.release();
  }
}

export async function dispatchInvoice(req: Request, res: Response) {
  const parsed = dispatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const body = parsed.data;
  if (!body.confirm) return res.status(400).json({ message: 'Confirmation required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invRes = await client.query(
      `SELECT id FROM invoices WHERE id = $1 AND tenant_id = $2 AND status IN ('draft','sent')`,
      [req.params.id, req.user!.tenantId]
    );
    if (invRes.rowCount === 0) throw new Error('Invoice not found');

    const linesRes = await client.query(
      `SELECT size_id, qty FROM invoice_lines WHERE invoice_id = $1 AND tenant_id = $2`,
      [req.params.id, req.user!.tenantId]
    );

    for (const line of linesRes.rows) {
      const balRes = await client.query(
        `SELECT on_hand FROM stock_balances WHERE tenant_id = $1 AND size_id = $2 AND location_id = $3 FOR UPDATE`,
        [req.user!.tenantId, line.size_id, body.locationId]
      );
      const before = balRes.rowCount ? Number(balRes.rows[0].on_hand) : 0;
      if (before < line.qty) throw new Error('Insufficient stock');

      await client.query(
        `UPDATE stock_balances SET on_hand = on_hand - $1, updated_at = NOW()
         WHERE tenant_id = $2 AND size_id = $3 AND location_id = $4`,
        [line.qty, req.user!.tenantId, line.size_id, body.locationId]
      );

      const metaRes = await client.query(
        `SELECT s.sku_id, k.product_id FROM sku_sizes s JOIN skus k ON s.sku_id = k.id
         WHERE s.id = $1 AND s.tenant_id = $2`,
        [line.size_id, req.user!.tenantId]
      );

      await client.query(
        `INSERT INTO inventory_transactions
         (tenant_id, type, size_id, sku_id, product_id, from_location_id, to_location_id, quantity, unit, reason, event_time, recorded_time, created_by, confirmed_by, approved_by, before_after)
         VALUES ($1,'sale',$2,$3,$4,$5,NULL,$6,'unit','Invoice dispatch',NOW(),NOW(),$7,$7,NULL,$8)`,
        [req.user!.tenantId, line.size_id, metaRes.rows[0].sku_id, metaRes.rows[0].product_id, body.locationId, line.qty, req.user!.id, { before, after: before - line.qty }]
      );
    }

    await client.query(`UPDATE invoices SET status = 'sent', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.user!.tenantId]);
    await client.query('COMMIT');
    res.json({ id: req.params.id, status: 'sent' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ message: err.message ?? 'Failed' });
  } finally {
    client.release();
  }
}

export async function cancelInvoice(req: Request, res: Response) {
  await pool.query(
    `UPDATE invoices SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.user!.tenantId]
  );
  res.json({ id: req.params.id, status: 'cancelled' });
}
