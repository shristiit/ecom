import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { evaluateGovernance } from './governance.js';

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
  const { sizeId, locationId } = req.query as any;
  if (!sizeId || !locationId) return res.status(400).json({ message: 'sizeId and locationId required' });
  const result = await pool.query(
    `SELECT * FROM stock_balances WHERE tenant_id = $1 AND size_id = $2 AND location_id = $3`,
    [req.user!.tenantId, sizeId, locationId]
  );
  res.json(result.rows[0] ?? { on_hand: 0, reserved: 0 });
}

export async function movements(req: Request, res: Response) {
  const { sizeId, from, to } = req.query as any;
  const result = await pool.query(
    `SELECT * FROM inventory_transactions
     WHERE tenant_id = $1
     AND ($2::uuid IS NULL OR size_id = $2)
     AND ($3::timestamptz IS NULL OR recorded_time >= $3)
     AND ($4::timestamptz IS NULL OR recorded_time <= $4)
     ORDER BY recorded_time DESC
     LIMIT 200`,
    [req.user!.tenantId, sizeId ?? null, from ?? null, to ?? null]
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
