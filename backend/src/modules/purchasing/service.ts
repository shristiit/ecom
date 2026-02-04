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
  try {
    const result = await executeCreatePO(req.user!.id, req.user!.tenantId, req.body);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? 'Failed' });
  }
}

export async function updatePO(req: Request, res: Response) {
  try {
    const result = await executeUpdatePO(req.user!.id, req.user!.tenantId, req.params.id, req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? 'Failed' });
  }
}

export async function receivePO(req: Request, res: Response) {
  try {
    const result = await executeReceivePO(req.user!.id, req.user!.tenantId, req.params.id, req.body);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? 'Failed' });
  }
}

export async function closePO(req: Request, res: Response) {
  try {
    const result = await executeClosePO(req.user!.id, req.user!.tenantId, req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? 'Failed' });
  }
}

export async function executeCreatePO(actorId: string, tenantId: string, payload: any) {
  const parsed = poSchema.safeParse(payload);
  if (!parsed.success) throw new Error('Invalid payload');
  const body = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const poRes = await client.query(
      `INSERT INTO purchase_orders (tenant_id, supplier_id, status, expected_date, created_by)
       VALUES ($1,$2,'draft',$3,$4) RETURNING id`,
      [tenantId, body.supplierId, body.expectedDate ?? null, actorId]
    );
    const poId = poRes.rows[0].id;
    for (const line of body.lines) {
      await client.query(
        `INSERT INTO purchase_order_lines (tenant_id, po_id, size_id, qty, unit_cost)
         VALUES ($1,$2,$3,$4,$5)`,
        [tenantId, poId, line.sizeId, line.qty, line.unitCost]
      );
    }
    await client.query('COMMIT');
    return { id: poId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function executeUpdatePO(actorId: string, tenantId: string, poId: string, payload: any) {
  const parsed = poSchema.partial().safeParse(payload);
  if (!parsed.success) throw new Error('Invalid payload');
  const body = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const poRes = await client.query(
      `UPDATE purchase_orders SET supplier_id = COALESCE($1,supplier_id), expected_date = COALESCE($2,expected_date), updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4 AND status = 'draft' RETURNING id`,
      [body.supplierId ?? null, body.expectedDate ?? null, poId, tenantId]
    );
    if (poRes.rowCount === 0) throw new Error('PO not found or not editable');
    if (body.lines) {
      await client.query(`DELETE FROM purchase_order_lines WHERE po_id = $1 AND tenant_id = $2`, [poId, tenantId]);
      for (const line of body.lines as any[]) {
        await client.query(
          `INSERT INTO purchase_order_lines (tenant_id, po_id, size_id, qty, unit_cost)
           VALUES ($1,$2,$3,$4,$5)`,
          [tenantId, poId, line.sizeId, line.qty, line.unitCost]
        );
      }
    }
    await client.query('COMMIT');
    return { id: poId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function executeReceivePO(actorId: string, tenantId: string, poId: string, payload: any) {
  const parsed = receiveSchema.safeParse(payload);
  if (!parsed.success) throw new Error('Invalid payload');
  const body = parsed.data;
  if (!body.confirm) throw new Error('Confirmation required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const poRes = await client.query(
      `SELECT id FROM purchase_orders WHERE id = $1 AND tenant_id = $2`,
      [poId, tenantId]
    );
    if (poRes.rowCount === 0) throw new Error('PO not found');

    const receiptRes = await client.query(
      `INSERT INTO receipts (tenant_id, po_id, location_id, status, created_by)
       VALUES ($1,$2,$3,'partial',$4) RETURNING id`,
      [tenantId, poId, body.locationId, actorId]
    );
    const receiptId = receiptRes.rows[0].id;

    for (const line of body.lines) {
      await client.query(
        `INSERT INTO receipt_lines (tenant_id, receipt_id, size_id, qty, unit_cost)
         VALUES ($1,$2,$3,$4,$5)`,
        [tenantId, receiptId, line.sizeId, line.qty, line.unitCost]
      );

      await client.query(
        `INSERT INTO stock_balances (tenant_id, size_id, location_id, on_hand, reserved)
         VALUES ($1,$2,$3,$4,0)
         ON CONFLICT (tenant_id, size_id, location_id)
         DO UPDATE SET on_hand = stock_balances.on_hand + EXCLUDED.on_hand, updated_at = NOW()`,
        [tenantId, line.sizeId, body.locationId, line.qty]
      );
    }

    await client.query('COMMIT');
    return { receiptId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function executeClosePO(actorId: string, tenantId: string, poId: string) {
  await pool.query(
    `UPDATE purchase_orders SET status = 'closed', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
    [poId, tenantId]
  );
  return { id: poId, status: 'closed' };
}
