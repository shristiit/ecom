import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '@backend/db/pool.js';

const lineSchema = z.object({
  sizeId: z.string().uuid(),
  qty: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
});

const invoiceSchema = z.object({
  customerId: z.string().uuid(),
  lines: z.array(lineSchema).min(1),
});

const lineRefSchema = z
  .object({
    lineId: z.string().uuid().optional(),
    sizeId: z.string().uuid().optional(),
    skuCode: z.string().trim().min(1).optional(),
    sizeLabel: z.string().trim().min(1).optional(),
  })
  .refine(
    (value) => Boolean(value.lineId || value.sizeId || (value.skuCode && value.sizeLabel)),
    'lineRef must include lineId, sizeId, or skuCode + sizeLabel',
  );

const invoiceLineValuesSchema = z.object({
  sizeId: z.string().uuid(),
  qty: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
});

const invoiceLineOpSchema = z
  .object({
    op: z.enum(['add', 'replace', 'change_qty', 'change_price', 'remove']),
    lineRef: lineRefSchema.optional(),
    values: invoiceLineValuesSchema.optional(),
    qty: z.number().int().positive().optional(),
    unitPrice: z.number().int().nonnegative().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.op === 'add') {
      if (!value.values) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'add requires values' });
      }
      return;
    }
    if (!value.lineRef) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.op} requires lineRef` });
    }
    if (value.op === 'replace' && !value.values) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'replace requires values' });
    }
    if (value.op === 'change_qty' && value.qty == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'change_qty requires qty' });
    }
    if (value.op === 'change_price' && value.unitPrice == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'change_price requires unitPrice' });
    }
  });

const invoiceHeaderPatchSchema = z.object({
  customerId: z.string().uuid().optional(),
});

const invoiceUpdateSchema = z
  .object({
    customerId: z.string().uuid().optional(),
    lines: z.array(lineSchema).min(1).optional(),
    headerPatch: invoiceHeaderPatchSchema.optional(),
    lineOps: z.array(invoiceLineOpSchema).min(1).optional(),
  })
  .refine(
    (value) =>
      value.customerId !== undefined ||
      value.lines !== undefined ||
      value.headerPatch !== undefined ||
      value.lineOps !== undefined,
    'At least one sales order change is required',
  );

const dispatchSchema = z.object({
  locationId: z.string().uuid(),
  confirm: z.boolean().default(false),
});

const confirmSchema = z.object({
  confirm: z.literal(true),
});

type Queryable = {
  query: typeof pool.query;
};

type InvoiceDetailRow = {
  id: string;
  customer_id: string;
  customer_name: string;
  status: string;
  total: number | string;
  created_at: string;
  updated_at: string;
};

type InvoiceLineDetailRow = {
  id: string;
  size_id: string;
  qty: number | string;
  unit_price: number | string;
  sku_code: string;
  size_label: string;
};

type InvoiceLineRef = z.infer<typeof lineRefSchema>;
type InvoiceLineOp = z.infer<typeof invoiceLineOpSchema>;

function hasOwn(payload: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function parsePagination(input: Request['query']) {
  const page = Math.max(1, Number(input.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20) || 20));
  return { page, pageSize };
}

async function getInvoiceById(client: Queryable, tenantId: string, invoiceId: string) {
  const invoiceRes = await client.query<InvoiceDetailRow>(
    `SELECT
       i.id,
       i.customer_id,
       c.name AS customer_name,
       i.status,
       i.total,
       i.created_at,
       i.updated_at
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     WHERE i.id = $1 AND i.tenant_id = $2`,
    [invoiceId, tenantId],
  );
  if (invoiceRes.rowCount === 0) {
    return null;
  }

  const linesRes = await client.query<InvoiceLineDetailRow>(
    `SELECT
       il.id,
       il.size_id,
       il.qty,
       il.unit_price,
       s.sku_code,
       sz.size_label
     FROM invoice_lines il
     JOIN sku_sizes sz ON sz.id = il.size_id
     JOIN skus s ON s.id = sz.sku_id
     WHERE il.invoice_id = $1 AND il.tenant_id = $2
     ORDER BY il.id`,
    [invoiceId, tenantId],
  );

  const lines = linesRes.rows.map((line: InvoiceLineDetailRow) => ({
    id: line.id,
    skuId: line.size_id,
    sku: `${line.sku_code}-${line.size_label}`,
    qty: Number(line.qty ?? 0),
    unitPrice: Number(line.unit_price ?? 0),
  }));

  const base = invoiceRes.rows[0];
  const subtotal = lines.reduce((sum: number, line) => sum + line.qty * line.unitPrice, 0);

  return {
    id: base.id,
    number: `SO-${String(base.id).slice(0, 8).toUpperCase()}`,
    customerId: base.customer_id,
    customerName: base.customer_name,
    status: base.status,
    currency: 'USD',
    lines,
    lineCount: lines.length,
    subtotal,
    tax: 0,
    total: Number(base.total ?? subtotal),
    createdAt: base.created_at,
    updatedAt: base.updated_at,
  };
}

async function recalculateInvoiceTotal(client: Queryable, tenantId: string, invoiceId: string) {
  await client.query(
    `UPDATE invoices
     SET total = COALESCE((
       SELECT SUM(qty * unit_price)
       FROM invoice_lines
       WHERE invoice_id = $1 AND tenant_id = $2
     ), 0),
         updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [invoiceId, tenantId],
  );
}

async function resolveInvoiceLine(client: Queryable, tenantId: string, invoiceId: string, lineRef: InvoiceLineRef) {
  if (lineRef.lineId) {
    const lineRes = await client.query<{ id: string }>(
      `SELECT id
       FROM invoice_lines
       WHERE id = $1 AND invoice_id = $2 AND tenant_id = $3`,
      [lineRef.lineId, invoiceId, tenantId],
    );
    if (lineRes.rowCount === 1) {
      return lineRes.rows[0];
    }
    throw new Error('Sales order line not found');
  }

  if (lineRef.sizeId) {
    const lineRes = await client.query<{ id: string }>(
      `SELECT id
       FROM invoice_lines
       WHERE invoice_id = $1 AND tenant_id = $2 AND size_id = $3`,
      [invoiceId, tenantId, lineRef.sizeId],
    );
    if (lineRes.rowCount === 1) {
      return lineRes.rows[0];
    }
    throw new Error('Sales order line not found');
  }

  const skuCode = String(lineRef.skuCode || '').trim().toUpperCase();
  const sizeLabel = String(lineRef.sizeLabel || '').trim().toUpperCase();
  const lineRes = await client.query<{ id: string }>(
    `SELECT il.id
     FROM invoice_lines il
     JOIN sku_sizes sz ON sz.id = il.size_id
     JOIN skus s ON s.id = sz.sku_id
     WHERE il.invoice_id = $1
       AND il.tenant_id = $2
       AND UPPER(s.sku_code) = $3
       AND UPPER(sz.size_label) = $4`,
    [invoiceId, tenantId, skuCode, sizeLabel],
  );
  if (lineRes.rowCount === 1) {
    return lineRes.rows[0];
  }
  throw new Error('Sales order line not found');
}

async function applyInvoiceLineOps(client: Queryable, tenantId: string, invoiceId: string, lineOps: InvoiceLineOp[]) {
  for (const lineOp of lineOps) {
    if (lineOp.op === 'add') {
      const values = lineOp.values!;
      await client.query(
        `INSERT INTO invoice_lines (tenant_id, invoice_id, size_id, qty, unit_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, invoiceId, values.sizeId, values.qty, values.unitPrice],
      );
      continue;
    }

    const resolvedLine = await resolveInvoiceLine(client, tenantId, invoiceId, lineOp.lineRef!);
    if (lineOp.op === 'replace') {
      const values = lineOp.values!;
      await client.query(
        `UPDATE invoice_lines
         SET size_id = $1, qty = $2, unit_price = $3
         WHERE id = $4 AND tenant_id = $5`,
        [values.sizeId, values.qty, values.unitPrice, resolvedLine.id, tenantId],
      );
      continue;
    }
    if (lineOp.op === 'change_qty') {
      await client.query(
        `UPDATE invoice_lines
         SET qty = $1
         WHERE id = $2 AND tenant_id = $3`,
        [lineOp.qty, resolvedLine.id, tenantId],
      );
      continue;
    }
    if (lineOp.op === 'change_price') {
      await client.query(
        `UPDATE invoice_lines
         SET unit_price = $1
         WHERE id = $2 AND tenant_id = $3`,
        [lineOp.unitPrice, resolvedLine.id, tenantId],
      );
      continue;
    }
    if (lineOp.op === 'remove') {
      await client.query(
        `DELETE FROM invoice_lines
         WHERE id = $1 AND tenant_id = $2`,
        [resolvedLine.id, tenantId],
      );
    }
  }
}

export async function listInvoices(req: Request, res: Response) {
  const { page, pageSize } = parsePagination(req.query);
  const offset = (page - 1) * pageSize;
  const { status, customerId } = req.query as { status?: string; customerId?: string };

  const totalRes = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM invoices i
     WHERE i.tenant_id = $1
       AND ($2::text IS NULL OR i.status::text = $2::text)
       AND ($3::text IS NULL OR i.customer_id::text = $3::text)`,
    [req.user!.tenantId, status ?? null, customerId ?? null],
  );

  const rowsRes = await pool.query(
    `SELECT
       i.id,
       i.customer_id,
       c.name AS customer_name,
       i.status,
       i.total,
       i.created_at,
       i.updated_at,
       COUNT(il.id)::int AS line_count
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     LEFT JOIN invoice_lines il ON il.invoice_id = i.id AND il.tenant_id = i.tenant_id
     WHERE i.tenant_id = $1
       AND ($2::text IS NULL OR i.status::text = $2::text)
       AND ($3::text IS NULL OR i.customer_id::text = $3::text)
     GROUP BY i.id, i.customer_id, c.name, i.status, i.total, i.created_at, i.updated_at
     ORDER BY i.updated_at DESC
     LIMIT $4 OFFSET $5`,
    [req.user!.tenantId, status ?? null, customerId ?? null, pageSize, offset],
  );

  const items = rowsRes.rows.map((row) => ({
    id: row.id,
    number: `SO-${String(row.id).slice(0, 8).toUpperCase()}`,
    customerId: row.customer_id,
    customerName: row.customer_name,
    status: row.status,
    currency: 'USD',
    lineCount: Number(row.line_count ?? 0),
    lines: [],
    subtotal: Number(row.total ?? 0),
    tax: 0,
    total: Number(row.total ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

export async function getInvoice(req: Request, res: Response) {
  const invoice = await getInvoiceById(pool, req.user!.tenantId, req.params.id);
  if (!invoice) {
    return res.status(404).json({ message: 'Invoice not found' });
  }
  return res.json(invoice);
}

export async function createInvoice(req: Request, res: Response) {
  try {
    const result = await executeCreateInvoice(req.user!.id, req.user!.tenantId, req.body);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? 'Failed' });
  }
}

export async function updateInvoice(req: Request, res: Response) {
  try {
    const result = await executeUpdateInvoice(req.user!.id, req.user!.tenantId, req.params.id, req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? 'Failed' });
  }
}

export async function dispatchInvoice(req: Request, res: Response) {
  try {
    const result = await executeDispatchInvoice(req.user!.id, req.user!.tenantId, req.params.id, req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? 'Failed' });
  }
}

export async function cancelInvoice(req: Request, res: Response) {
  try {
    const result = await executeCancelInvoice(req.user!.id, req.user!.tenantId, req.params.id, req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? 'Failed' });
  }
}

export async function executeCreateInvoice(actorId: string, tenantId: string, payload: any) {
  const parsed = invoiceSchema.safeParse(payload);
  if (!parsed.success) throw new Error('Invalid payload');
  const body = parsed.data;
  const total = body.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invRes = await client.query(
      `INSERT INTO invoices (tenant_id, customer_id, status, total, created_by)
       VALUES ($1,$2,'draft',$3,$4) RETURNING id`,
      [tenantId, body.customerId, total, actorId],
    );
    const id = invRes.rows[0].id;
    for (const line of body.lines) {
      await client.query(
        `INSERT INTO invoice_lines (tenant_id, invoice_id, size_id, qty, unit_price)
         VALUES ($1,$2,$3,$4,$5)`,
        [tenantId, id, line.sizeId, line.qty, line.unitPrice],
      );
    }
    await client.query('COMMIT');
    const created = await getInvoiceById(client, tenantId, id);
    if (!created) throw new Error('Failed to load created invoice');
    return created;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function executeUpdateInvoice(actorId: string, tenantId: string, invoiceId: string, payload: any) {
  const parsed = invoiceUpdateSchema.safeParse(payload);
  if (!parsed.success) throw new Error('Invalid payload');
  const body = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const headerPatch = {
      ...(body.headerPatch ?? {}),
      ...(hasOwn(body, 'customerId') ? { customerId: body.customerId } : {}),
    };
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: string[] = [];
    if (hasOwn(headerPatch, 'customerId') && headerPatch.customerId) {
      values.push(headerPatch.customerId);
      setClauses.push(`customer_id = $${values.length}`);
    }
    values.push(invoiceId, tenantId);
    const invRes = await client.query(
      `UPDATE invoices
       SET ${setClauses.join(', ')}
       WHERE id = $${values.length - 1} AND tenant_id = $${values.length} AND status = 'draft'
       RETURNING id`,
      values,
    );
    if (invRes.rowCount === 0) throw new Error('Invoice not found or not editable');
    if (body.lines) {
      await client.query(`DELETE FROM invoice_lines WHERE invoice_id = $1 AND tenant_id = $2`, [invoiceId, tenantId]);
      for (const line of body.lines as any[]) {
        await client.query(
          `INSERT INTO invoice_lines (tenant_id, invoice_id, size_id, qty, unit_price)
           VALUES ($1,$2,$3,$4,$5)`,
          [tenantId, invoiceId, line.sizeId, line.qty, line.unitPrice]
        );
      }
    }
    if (body.lineOps) {
      await applyInvoiceLineOps(client, tenantId, invoiceId, body.lineOps);
    }
    if (body.lines || body.lineOps) {
      await recalculateInvoiceTotal(client, tenantId, invoiceId);
    }
    await client.query('COMMIT');
    const updated = await getInvoiceById(client, tenantId, invoiceId);
    if (!updated) throw new Error('Failed to load updated invoice');
    return updated;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function executeDispatchInvoice(actorId: string, tenantId: string, invoiceId: string, payload: any) {
  const parsed = dispatchSchema.safeParse(payload);
  if (!parsed.success) throw new Error('Invalid payload');
  const body = parsed.data;
  if (!body.confirm) throw new Error('Confirmation required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invRes = await client.query(
      `SELECT id FROM invoices WHERE id = $1 AND tenant_id = $2 AND status IN ('draft','sent')`,
      [invoiceId, tenantId]
    );
    if (invRes.rowCount === 0) throw new Error('Invoice not found');

    const linesRes = await client.query(
      `SELECT size_id, qty FROM invoice_lines WHERE invoice_id = $1 AND tenant_id = $2`,
      [invoiceId, tenantId]
    );

    for (const line of linesRes.rows) {
      const balRes = await client.query(
        `SELECT on_hand FROM stock_balances WHERE tenant_id = $1 AND size_id = $2 AND location_id = $3 FOR UPDATE`,
        [tenantId, line.size_id, body.locationId]
      );
      const before = balRes.rowCount ? Number(balRes.rows[0].on_hand) : 0;
      if (before < line.qty) throw new Error('Insufficient stock');

      await client.query(
        `UPDATE stock_balances SET on_hand = on_hand - $1, updated_at = NOW()
         WHERE tenant_id = $2 AND size_id = $3 AND location_id = $4`,
        [line.qty, tenantId, line.size_id, body.locationId],
      );
    }

    await client.query(
      `UPDATE invoices
       SET status = 'sent',
           dispatched_location_id = $3,
           updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [invoiceId, tenantId, body.locationId],
    );
    await client.query('COMMIT');
    return { id: invoiceId, status: 'sent' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function executeCancelInvoice(actorId: string, tenantId: string, invoiceId: string, payload: any) {
  const parsed = confirmSchema.safeParse(payload);
  if (!parsed.success) throw new Error('Confirmation required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const invRes = await client.query(
      `SELECT status, dispatched_location_id
       FROM invoices
       WHERE id = $1
         AND tenant_id = $2
         AND status NOT IN ('cancelled', 'closed')
       FOR UPDATE`,
      [invoiceId, tenantId],
    );
    if (invRes.rowCount === 0) {
      throw new Error('Invoice not found or already cancelled/closed');
    }

    const { status, dispatched_location_id: dispatchedLocationId } = invRes.rows[0];

    if (status === 'sent') {
      if (!dispatchedLocationId) {
        throw new Error('Invoice is missing dispatched location');
      }

      const linesRes = await client.query(
        `SELECT size_id, qty
         FROM invoice_lines
         WHERE invoice_id = $1 AND tenant_id = $2`,
        [invoiceId, tenantId],
      );

      for (const line of linesRes.rows) {
        await client.query(
          `INSERT INTO stock_balances (tenant_id, size_id, location_id, on_hand, reserved)
           VALUES ($1, $2, $3, $4, 0)
           ON CONFLICT (tenant_id, size_id, location_id)
           DO UPDATE SET on_hand = stock_balances.on_hand + EXCLUDED.on_hand, updated_at = NOW()`,
          [tenantId, line.size_id, dispatchedLocationId, line.qty],
        );
      }
    }

    await client.query(
      `UPDATE invoices
       SET status = 'cancelled',
           updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [invoiceId, tenantId],
    );

    await client.query('COMMIT');
    return { id: invoiceId, status: 'cancelled' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
