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

function parsePagination(input: Request['query']) {
  const page = Math.max(1, Number(input.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20) || 20));
  return { page, pageSize };
}

export async function listPOs(req: Request, res: Response) {
  const { page, pageSize } = parsePagination(req.query);
  const offset = (page - 1) * pageSize;
  const { status, supplierId } = req.query as { status?: string; supplierId?: string };

  const totalRes = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM purchase_orders po
     WHERE po.tenant_id = $1
       AND ($2::text IS NULL OR po.status::text = $2::text)
       AND ($3::text IS NULL OR po.supplier_id::text = $3::text)`,
    [req.user!.tenantId, status ?? null, supplierId ?? null],
  );

  const rowsRes = await pool.query(
    `SELECT
       po.id,
       po.supplier_id,
       s.name AS supplier_name,
       po.status,
       po.expected_date,
       po.created_at,
       po.updated_at,
       COUNT(pol.id)::int AS line_count,
       COALESCE(SUM(pol.qty * pol.unit_cost), 0)::bigint AS total_cost
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     LEFT JOIN purchase_order_lines pol ON pol.po_id = po.id AND pol.tenant_id = po.tenant_id
     WHERE po.tenant_id = $1
       AND ($2::text IS NULL OR po.status::text = $2::text)
       AND ($3::text IS NULL OR po.supplier_id::text = $3::text)
     GROUP BY po.id, po.supplier_id, s.name, po.status, po.expected_date, po.created_at, po.updated_at
     ORDER BY po.updated_at DESC
     LIMIT $4 OFFSET $5`,
    [req.user!.tenantId, status ?? null, supplierId ?? null, pageSize, offset],
  );

  const items = rowsRes.rows.map((row) => ({
    id: row.id,
    number: `PO-${String(row.id).slice(0, 8).toUpperCase()}`,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    status: row.status,
    currency: 'USD',
    lines: [],
    orderedAt: row.created_at,
    expectedAt: row.expected_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lineCount: Number(row.line_count ?? 0),
    totalCost: Number(row.total_cost ?? 0),
  }));

  res.json({
    items,
    pagination: {
      page,
      pageSize,
      total: Number(totalRes.rows[0]?.total ?? items.length),
    },
  });
}

export async function getPO(req: Request, res: Response) {
  const poRes = await pool.query(
    `SELECT
       po.id,
       po.supplier_id,
       s.name AS supplier_name,
       po.status,
       po.expected_date,
       po.created_at,
       po.updated_at
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     WHERE po.id = $1 AND po.tenant_id = $2`,
    [req.params.id, req.user!.tenantId],
  );
  if (poRes.rowCount === 0) {
    return res.status(404).json({ message: 'PO not found' });
  }

  const linesRes = await pool.query(
    `SELECT
       pol.id,
       pol.size_id,
       pol.qty,
       pol.unit_cost,
       s.sku_code,
       sz.size_label,
       COALESCE(SUM(rl.qty), 0)::int AS qty_received
     FROM purchase_order_lines pol
     JOIN sku_sizes sz ON sz.id = pol.size_id
     JOIN skus s ON s.id = sz.sku_id
     LEFT JOIN receipts r ON r.po_id = pol.po_id AND r.tenant_id = pol.tenant_id
     LEFT JOIN receipt_lines rl ON rl.receipt_id = r.id AND rl.size_id = pol.size_id AND rl.tenant_id = pol.tenant_id
     WHERE pol.po_id = $1 AND pol.tenant_id = $2
     GROUP BY pol.id, pol.size_id, pol.qty, pol.unit_cost, s.sku_code, sz.size_label
     ORDER BY pol.id`,
    [req.params.id, req.user!.tenantId],
  );

  const lines = linesRes.rows.map((line) => ({
    id: line.id,
    skuId: line.size_id,
    sku: `${line.sku_code}-${line.size_label}`,
    qtyOrdered: Number(line.qty ?? 0),
    qtyReceived: Number(line.qty_received ?? 0),
    unitCost: Number(line.unit_cost ?? 0),
  }));

  const base = poRes.rows[0];
  return res.json({
    id: base.id,
    number: `PO-${String(base.id).slice(0, 8).toUpperCase()}`,
    supplierId: base.supplier_id,
    supplierName: base.supplier_name,
    status: base.status,
    currency: 'USD',
    lines,
    orderedAt: base.created_at,
    expectedAt: base.expected_date,
    createdAt: base.created_at,
    updatedAt: base.updated_at,
  });
}

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
