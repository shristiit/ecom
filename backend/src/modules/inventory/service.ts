import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '@backend/db/pool.js';
import { evaluateGovernance } from '@backend/modules/inventory/governance.js';

const baseWriteSchema = z.object({
  sizeId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unit: z.string().default('unit'),
  reason: z.string().optional().default(''),
  eventTime: z.string().datetime().optional(),
  confirm: z.boolean().default(false),
  approvalId: z.string().uuid().optional(),
});

const transferSchema = z.object({
  sizeId: z.string().uuid(),
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unit: z.string().default('unit'),
  reason: z.string().optional().default(''),
  eventTime: z.string().datetime().optional(),
  confirm: z.boolean().default(false),
  approvalId: z.string().uuid().optional(),
});

export async function stockOnHand(req: Request, res: Response) {
  const { sizeId, locationId, sku } = req.query as { sizeId?: string; locationId?: string; sku?: string };

  if (sizeId && locationId) {
    const result = await pool.query(
      `SELECT * FROM stock_balances WHERE tenant_id = $1 AND size_id = $2 AND location_id = $3`,
      [req.user!.tenantId, sizeId, locationId]
    );
    return res.json(result.rows[0] ?? { on_hand: 0, reserved: 0 });
  }

  const result = await pool.query(
    `SELECT
       sb.size_id,
       sb.location_id,
       sb.on_hand,
       sb.reserved,
       (sb.on_hand - sb.reserved) AS available,
       sz.sku_id,
       sk.sku_code,
       p.id AS product_id,
       p.name AS product_name,
       l.code AS location_code
     FROM stock_balances sb
     JOIN sku_sizes sz ON sz.id = sb.size_id
     JOIN skus sk ON sk.id = sz.sku_id
     JOIN products p ON p.id = sk.product_id
     JOIN locations l ON l.id = sb.location_id
     WHERE sb.tenant_id = $1
       AND ($2::text IS NULL OR sb.location_id::text = $2::text)
       AND ($3::text IS NULL OR sk.sku_code ILIKE '%' || $3::text || '%')
     ORDER BY sb.updated_at DESC
     LIMIT 500`,
    [req.user!.tenantId, locationId ?? null, sku ?? null]
  );

  return res.json(result.rows);
}

export async function movements(req: Request, res: Response) {
  const { sizeId, from, to, movementType } = req.query as { sizeId?: string; from?: string; to?: string; movementType?: string };
  const result = await pool.query(
    `SELECT
       it.*,
       sk.sku_code,
       u.email AS actor_email,
       lf.code AS from_location_code,
       lt.code AS to_location_code
     FROM inventory_transactions it
     JOIN skus sk ON sk.id = it.sku_id
     LEFT JOIN users u ON u.id = it.created_by
     LEFT JOIN locations lf ON lf.id = it.from_location_id
     LEFT JOIN locations lt ON lt.id = it.to_location_id
     WHERE it.tenant_id = $1
     AND ($2::text IS NULL OR it.size_id::text = $2::text)
     AND ($3::timestamptz IS NULL OR it.recorded_time >= $3)
     AND ($4::timestamptz IS NULL OR it.recorded_time <= $4)
     AND ($5::text IS NULL OR it.type::text = $5::text)
     ORDER BY it.recorded_time DESC
     LIMIT 200`,
    [req.user!.tenantId, sizeId ?? null, from ?? null, to ?? null, movementType ?? null]
  );
  res.json(result.rows);
}

export async function listReceipts(req: Request, res: Response) {
  const result = await pool.query(
    `SELECT
       r.id,
       r.po_id,
       r.location_id,
       l.code AS location_code,
       r.status,
       r.created_at,
       po.supplier_id,
       s.name AS supplier_name,
       COUNT(rl.id)::int AS line_count
     FROM receipts r
     LEFT JOIN purchase_orders po ON po.id = r.po_id
     LEFT JOIN suppliers s ON s.id = po.supplier_id
     LEFT JOIN locations l ON l.id = r.location_id
     LEFT JOIN receipt_lines rl ON rl.receipt_id = r.id AND rl.tenant_id = r.tenant_id
     WHERE r.tenant_id = $1
     GROUP BY r.id, r.po_id, r.location_id, l.code, r.status, r.created_at, po.supplier_id, s.name
     ORDER BY r.created_at DESC
     LIMIT 300`,
    [req.user!.tenantId]
  );

  res.json(result.rows);
}

export async function receive(req: Request, res: Response) {
  try {
    const result = await executeReceive(req.user!.id, req.user!.tenantId, req.body);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? 'Failed' });
  }
}

export async function adjust(req: Request, res: Response) {
  try {
    const result = await executeAdjust(req.user!.id, req.user!.tenantId, req.body);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? 'Failed' });
  }
}

export async function writeOff(req: Request, res: Response) {
  try {
    const result = await executeWriteOff(req.user!.id, req.user!.tenantId, req.body);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? 'Failed' });
  }
}

export async function cycleCount(req: Request, res: Response) {
  try {
    const result = await executeCycleCount(req.user!.id, req.user!.tenantId, req.body);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? 'Failed' });
  }
}

export async function transfer(req: Request, res: Response) {
  try {
    const result = await executeTransfer(req.user!.id, req.user!.tenantId, req.body);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? 'Failed' });
  }
}

export async function executeReceive(actorId: string, tenantId: string, body: any) {
  return handleSimpleMove(actorId, tenantId, body, 'receive');
}

export async function executeAdjust(actorId: string, tenantId: string, body: any) {
  return handleSimpleMove(actorId, tenantId, body, 'adjust');
}

export async function executeWriteOff(actorId: string, tenantId: string, body: any) {
  return handleSimpleMove(actorId, tenantId, body, 'write_off');
}

export async function executeCycleCount(actorId: string, tenantId: string, body: any) {
  return handleSimpleMove(actorId, tenantId, body, 'cycle_count');
}

export async function executeTransfer(actorId: string, tenantId: string, body: any) {
  const parsed = transferSchema.safeParse(body);
  if (!parsed.success) throw new Error('Invalid payload');
  const data = parsed.data;
  if (!data.confirm) throw new Error('Confirmation required');

  const governance = await evaluateGovernance(tenantId, 'transfer', data.quantity);
  if (governance.requiresApproval && !data.approvalId) {
    throw new Error('Approval required');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sizeRes = await client.query(
      `SELECT s.id as size_id, s.sku_id, k.product_id
       FROM sku_sizes s JOIN skus k ON s.sku_id = k.id
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [data.sizeId, tenantId]
    );
    if (sizeRes.rowCount === 0) throw new Error('Invalid size');

    const now = new Date();
    const eventTime = data.eventTime ? new Date(data.eventTime) : now;

    const fromBal = await client.query(
      `SELECT on_hand FROM stock_balances WHERE tenant_id = $1 AND size_id = $2 AND location_id = $3 FOR UPDATE`,
      [tenantId, data.sizeId, data.fromLocationId]
    );
    const fromOnHand = fromBal.rowCount ? Number(fromBal.rows[0].on_hand) : 0;
    if (fromOnHand < data.quantity) throw new Error('Insufficient stock');

    await upsertBalance(client, tenantId, data.sizeId, data.fromLocationId, -data.quantity);
    await upsertBalance(client, tenantId, data.sizeId, data.toLocationId, data.quantity);

    const txRes = await client.query(
      `INSERT INTO inventory_transactions
       (tenant_id, type, size_id, sku_id, product_id, from_location_id, to_location_id, quantity, unit, reason, event_time, recorded_time, created_by, confirmed_by, approved_by, before_after)
       VALUES ($1,'transfer',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,$14)
       RETURNING id`,
      [
        tenantId,
        data.sizeId,
        sizeRes.rows[0].sku_id,
        sizeRes.rows[0].product_id,
        data.fromLocationId,
        data.toLocationId,
        data.quantity,
        data.unit,
        data.reason,
        eventTime,
        now,
        actorId,
        data.approvalId ?? null,
        { before: fromOnHand, after: fromOnHand - data.quantity },
      ]
    );

    await client.query('COMMIT');
    return { transactionId: txRes.rows[0].id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function handleSimpleMove(actorId: string, tenantId: string, body: any, type: 'receive' | 'adjust' | 'write_off' | 'cycle_count') {
  const parsed = baseWriteSchema.safeParse(body);
  if (!parsed.success) throw new Error('Invalid payload');
  const data = parsed.data;
  if (!data.confirm) throw new Error('Confirmation required');

  const governance = await evaluateGovernance(tenantId, type, data.quantity);
  if (governance.requiresApproval && !data.approvalId) {
    throw new Error('Approval required');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sizeRes = await client.query(
      `SELECT s.id as size_id, s.sku_id, k.product_id
       FROM sku_sizes s JOIN skus k ON s.sku_id = k.id
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [data.sizeId, tenantId]
    );
    if (sizeRes.rowCount === 0) throw new Error('Invalid size');

    const now = new Date();
    const eventTime = data.eventTime ? new Date(data.eventTime) : now;

    const balRes = await client.query(
      `SELECT on_hand FROM stock_balances WHERE tenant_id = $1 AND size_id = $2 AND location_id = $3 FOR UPDATE`,
      [tenantId, data.sizeId, data.locationId]
    );
    const before = balRes.rowCount ? Number(balRes.rows[0].on_hand) : 0;
    const delta = type === 'write_off' ? -data.quantity : data.quantity;
    const after = before + delta;
    if (after < 0) throw new Error('Stock cannot go below zero');

    await upsertBalance(client, tenantId, data.sizeId, data.locationId, delta);

    const txRes = await client.query(
      `INSERT INTO inventory_transactions
       (tenant_id, type, size_id, sku_id, product_id, from_location_id, to_location_id, quantity, unit, reason, event_time, recorded_time, created_by, confirmed_by, approved_by, before_after)
       VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10,$11,$12,$12,$13,$14)
       RETURNING id`,
      [
        tenantId,
        type,
        data.sizeId,
        sizeRes.rows[0].sku_id,
        sizeRes.rows[0].product_id,
        data.locationId,
        data.quantity,
        data.unit,
        data.reason,
        eventTime,
        now,
        actorId,
        data.approvalId ?? null,
        { before, after },
      ]
    );

    await client.query('COMMIT');
    return { transactionId: txRes.rows[0].id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function upsertBalance(client: any, tenantId: string, sizeId: string, locationId: string, delta: number) {
  await client.query(
    `INSERT INTO stock_balances (tenant_id, size_id, location_id, on_hand, reserved)
     VALUES ($1,$2,$3,$4,0)
     ON CONFLICT (tenant_id, size_id, location_id)
     DO UPDATE SET on_hand = stock_balances.on_hand + EXCLUDED.on_hand, updated_at = NOW()`,
    [tenantId, sizeId, locationId, delta]
  );
}
