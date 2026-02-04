import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';

const lineSchema = z.object({
  sizeId: z.string().uuid(),
  qty: z.number().int().positive(),
  unitCost: z.number().int().nonnegative(),
});

const poSchema = z.object({
  supplierId: z.string().uuid(),
  expectedDate: z.string().datetime().optional(),
  lines: z.array(lineSchema).min(1),
});

const receiveSchema = z.object({
  locationId: z.string().uuid(),
  lines: z.array(lineSchema).min(1),
  confirm: z.boolean().default(false),
});

export async function createPO(req: Request, res: Response) {
  const parsed = poSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const body = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const poRes = await client.query(
      `INSERT INTO purchase_orders (tenant_id, supplier_id, status, expected_date, created_by)
       VALUES ($1,$2,'draft',$3,$4) RETURNING id`,
      [req.user!.tenantId, body.supplierId, body.expectedDate ?? null, req.user!.id]
    );
    const poId = poRes.rows[0].id;
    for (const line of body.lines) {
      await client.query(
        `INSERT INTO purchase_order_lines (tenant_id, po_id, size_id, qty, unit_cost)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.user!.tenantId, poId, line.sizeId, line.qty, line.unitCost]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ id: poId });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ message: err.message ?? 'Failed' });
  } finally {
    client.release();
  }
}

export async function updatePO(req: Request, res: Response) {
  const parsed = poSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const body = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const poRes = await client.query(
      `UPDATE purchase_orders SET supplier_id = COALESCE($1,supplier_id), expected_date = COALESCE($2,expected_date), updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4 AND status = 'draft' RETURNING id`,
      [body.supplierId ?? null, body.expectedDate ?? null, req.params.id, req.user!.tenantId]
    );
    if (poRes.rowCount === 0) throw new Error('PO not found or not editable');
    if (body.lines) {
      await client.query(`DELETE FROM purchase_order_lines WHERE po_id = $1 AND tenant_id = $2`, [req.params.id, req.user!.tenantId]);
      for (const line of body.lines as any[]) {
        await client.query(
          `INSERT INTO purchase_order_lines (tenant_id, po_id, size_id, qty, unit_cost)
           VALUES ($1,$2,$3,$4,$5)`,
          [req.user!.tenantId, req.params.id, line.sizeId, line.qty, line.unitCost]
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

export async function receivePO(req: Request, res: Response) {
  const parsed = receiveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const body = parsed.data;
  if (!body.confirm) return res.status(400).json({ message: 'Confirmation required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const poRes = await client.query(
      `SELECT id FROM purchase_orders WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user!.tenantId]
    );
    if (poRes.rowCount === 0) throw new Error('PO not found');

    const receiptRes = await client.query(
      `INSERT INTO receipts (tenant_id, po_id, location_id, status, created_by)
       VALUES ($1,$2,$3,'partial',$4) RETURNING id`,
      [req.user!.tenantId, req.params.id, body.locationId, req.user!.id]
    );
    const receiptId = receiptRes.rows[0].id;

    for (const line of body.lines) {
      await client.query(
        `INSERT INTO receipt_lines (tenant_id, receipt_id, size_id, qty, unit_cost)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.user!.tenantId, receiptId, line.sizeId, line.qty, line.unitCost]
      );

      await client.query(
        `INSERT INTO stock_balances (tenant_id, size_id, location_id, on_hand, reserved)
         VALUES ($1,$2,$3,$4,0)
         ON CONFLICT (tenant_id, size_id, location_id)
         DO UPDATE SET on_hand = stock_balances.on_hand + EXCLUDED.on_hand, updated_at = NOW()`,
        [req.user!.tenantId, line.sizeId, body.locationId, line.qty]
      );

      const metaRes = await client.query(
        `SELECT s.sku_id, k.product_id FROM sku_sizes s JOIN skus k ON s.sku_id = k.id
         WHERE s.id = $1 AND s.tenant_id = $2`,
        [line.sizeId, req.user!.tenantId]
      );

      await client.query(
        `INSERT INTO inventory_transactions
         (tenant_id, type, size_id, sku_id, product_id, from_location_id, to_location_id, quantity, unit, reason, event_time, recorded_time, created_by, confirmed_by, approved_by, before_after)
         VALUES ($1,'receive',$2,$3,$4,NULL,$5,$6,'unit','PO Receive',NOW(),NOW(),$7,$7,NULL,$8)`,
        [req.user!.tenantId, line.sizeId, metaRes.rows[0].sku_id, metaRes.rows[0].product_id, body.locationId, line.qty, req.user!.id, { before: null, after: null }]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ receiptId });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ message: err.message ?? 'Failed' });
  } finally {
    client.release();
  }
}

export async function closePO(req: Request, res: Response) {
  await pool.query(
    `UPDATE purchase_orders SET status = 'closed', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.user!.tenantId]
  );
  res.json({ id: req.params.id, status: 'closed' });
}
