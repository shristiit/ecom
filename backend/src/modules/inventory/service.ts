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
  await handleSimpleMove(req, res, 'receive');
}

export async function adjust(req: Request, res: Response) {
  await handleSimpleMove(req, res, 'adjust');
}

export async function writeOff(req: Request, res: Response) {
  await handleSimpleMove(req, res, 'write_off');
}

export async function cycleCount(req: Request, res: Response) {
  await handleSimpleMove(req, res, 'cycle_count');
}

export async function transfer(req: Request, res: Response) {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const body = parsed.data;
  if (!body.confirm) return res.status(400).json({ message: 'Confirmation required' });

  const governance = await evaluateGovernance(req.user!.tenantId, 'transfer', body.quantity);
  if (governance.requiresApproval && !body.approvalId) {
    return res.status(403).json({ message: 'Approval required', reason: governance.reason });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sizeRes = await client.query(
      `SELECT s.id as size_id, s.sku_id, k.product_id
       FROM sku_sizes s JOIN skus k ON s.sku_id = k.id
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [body.sizeId, req.user!.tenantId]
    );
    if (sizeRes.rowCount === 0) throw new Error('Invalid size');

    const now = new Date();
    const eventTime = body.eventTime ? new Date(body.eventTime) : now;

    const fromBal = await client.query(
      `SELECT on_hand FROM stock_balances WHERE tenant_id = $1 AND size_id = $2 AND location_id = $3 FOR UPDATE`,
      [req.user!.tenantId, body.sizeId, body.fromLocationId]
    );
    const fromOnHand = fromBal.rowCount ? Number(fromBal.rows[0].on_hand) : 0;
    if (fromOnHand < body.quantity) throw new Error('Insufficient stock');

    await upsertBalance(client, req.user!.tenantId, body.sizeId, body.fromLocationId, -body.quantity);
    await upsertBalance(client, req.user!.tenantId, body.sizeId, body.toLocationId, body.quantity);

    const txRes = await client.query(
      `INSERT INTO inventory_transactions
       (tenant_id, type, size_id, sku_id, product_id, from_location_id, to_location_id, quantity, unit, reason, event_time, recorded_time, created_by, confirmed_by, approved_by, before_after)
       VALUES ($1,'transfer',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,$14)
       RETURNING id`,
      [
        req.user!.tenantId,
        body.sizeId,
        sizeRes.rows[0].sku_id,
        sizeRes.rows[0].product_id,
        body.fromLocationId,
        body.toLocationId,
        body.quantity,
        body.unit,
        body.reason,
        eventTime,
        now,
        req.user!.id,
        body.approvalId ?? null,
        { before: fromOnHand, after: fromOnHand - body.quantity },
      ]
    );

    await client.query(
      `INSERT INTO audit_records (tenant_id, transaction_id, request_text, who, approver, before_after, why)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.user!.tenantId, txRes.rows[0].id, '', req.user!.id, body.approvalId ?? null, { before: fromOnHand, after: fromOnHand - body.quantity }, body.reason]
    );

    await client.query('COMMIT');
    res.status(201).json({ transactionId: txRes.rows[0].id });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ message: err.message ?? 'Transfer failed' });
  } finally {
    client.release();
  }
}

async function handleSimpleMove(req: Request, res: Response, type: 'receive' | 'adjust' | 'write_off' | 'cycle_count') {
  const parsed = baseWriteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const body = parsed.data;
  if (!body.confirm) return res.status(400).json({ message: 'Confirmation required' });

  const governance = await evaluateGovernance(req.user!.tenantId, type, body.quantity);
  if (governance.requiresApproval && !body.approvalId) {
    return res.status(403).json({ message: 'Approval required', reason: governance.reason });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sizeRes = await client.query(
      `SELECT s.id as size_id, s.sku_id, k.product_id
       FROM sku_sizes s JOIN skus k ON s.sku_id = k.id
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [body.sizeId, req.user!.tenantId]
    );
    if (sizeRes.rowCount === 0) throw new Error('Invalid size');

    const now = new Date();
    const eventTime = body.eventTime ? new Date(body.eventTime) : now;

    const balRes = await client.query(
      `SELECT on_hand FROM stock_balances WHERE tenant_id = $1 AND size_id = $2 AND location_id = $3 FOR UPDATE`,
      [req.user!.tenantId, body.sizeId, body.locationId]
    );
    const before = balRes.rowCount ? Number(balRes.rows[0].on_hand) : 0;
    const delta = type === 'write_off' ? -body.quantity : body.quantity;
    const after = before + delta;
    if (after < 0) throw new Error('Stock cannot go below zero');

    await upsertBalance(client, req.user!.tenantId, body.sizeId, body.locationId, delta);

    const txRes = await client.query(
      `INSERT INTO inventory_transactions
       (tenant_id, type, size_id, sku_id, product_id, from_location_id, to_location_id, quantity, unit, reason, event_time, recorded_time, created_by, confirmed_by, approved_by, before_after)
       VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10,$11,$12,$12,$13,$14)
       RETURNING id`,
      [
        req.user!.tenantId,
        type,
        body.sizeId,
        sizeRes.rows[0].sku_id,
        sizeRes.rows[0].product_id,
        body.locationId,
        body.quantity,
        body.unit,
        body.reason,
        eventTime,
        now,
        req.user!.id,
        body.approvalId ?? null,
        { before, after },
      ]
    );

    await client.query(
      `INSERT INTO audit_records (tenant_id, transaction_id, request_text, who, approver, before_after, why)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.user!.tenantId, txRes.rows[0].id, '', req.user!.id, body.approvalId ?? null, { before, after }, body.reason]
    );

    await client.query('COMMIT');
    res.status(201).json({ transactionId: txRes.rows[0].id });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ message: err.message ?? 'Failed' });
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
