import { Request, Response } from 'express';
import { pool } from '@backend/db/pool.js';

function rangeFilters(req: Request['query']) {
  return {
    from: typeof req.from === 'string' ? req.from : null,
    to: typeof req.to === 'string' ? req.to : null,
  };
}

export async function stockSummary(req: Request, res: Response) {
  const sku = typeof req.query.sku === 'string' ? req.query.sku : null;
  const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : null;

  const result = await pool.query(
    `SELECT
       sk.sku_code,
       p.name AS product_name,
       sz.size_label,
       l.code AS location_code,
       sb.on_hand,
       sb.reserved,
       (sb.on_hand - sb.reserved) AS available
     FROM stock_balances sb
     JOIN sku_sizes sz ON sz.id = sb.size_id
     JOIN skus sk ON sk.id = sz.sku_id
     JOIN products p ON p.id = sk.product_id
     JOIN locations l ON l.id = sb.location_id
     WHERE sb.tenant_id = $1
       AND ($2::text IS NULL OR sk.sku_code ILIKE '%' || $2::text || '%')
       AND ($3::text IS NULL OR sb.location_id::text = $3::text)
     ORDER BY sb.updated_at DESC
     LIMIT 50`,
    [req.user!.tenantId, sku, locationId]
  );

  res.json(result.rows);
}

export async function movementSummary(req: Request, res: Response) {
  const { from, to } = rangeFilters(req.query);
  const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : null;

  const result = await pool.query(
    `SELECT
       it.type::text AS movement_type,
       COUNT(*)::int AS movement_count,
       COALESCE(SUM(it.quantity), 0)::int AS total_quantity
     FROM inventory_transactions it
     WHERE it.tenant_id = $1
       AND ($2::timestamptz IS NULL OR it.recorded_time >= $2)
       AND ($3::timestamptz IS NULL OR it.recorded_time <= $3)
       AND (
         $4::text IS NULL
         OR it.from_location_id::text = $4::text
         OR it.to_location_id::text = $4::text
       )
     GROUP BY it.type
     ORDER BY movement_count DESC, movement_type ASC`,
    [req.user!.tenantId, from, to, locationId]
  );

  res.json(result.rows);
}

export async function poSummary(req: Request, res: Response) {
  const status = typeof req.query.status === 'string' ? req.query.status : null;

  const result = await pool.query(
    `SELECT
       po.id,
       po.status::text,
       s.name AS supplier_name,
       po.expected_date,
       COUNT(pol.id)::int AS line_count,
       COALESCE(SUM(pol.qty * pol.unit_cost), 0)::bigint AS total_cost
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     LEFT JOIN purchase_order_lines pol ON pol.po_id = po.id AND pol.tenant_id = po.tenant_id
     WHERE po.tenant_id = $1
       AND ($2::text IS NULL OR po.status::text = $2::text)
     GROUP BY po.id, po.status, s.name, po.expected_date, po.updated_at
     ORDER BY po.updated_at DESC
     LIMIT 50`,
    [req.user!.tenantId, status]
  );

  res.json(result.rows);
}

export async function receiptSummary(req: Request, res: Response) {
  const { from, to } = rangeFilters(req.query);

  const result = await pool.query(
    `SELECT
       r.id,
       r.status::text,
       l.code AS location_code,
       s.name AS supplier_name,
       COUNT(rl.id)::int AS line_count,
       COALESCE(SUM(rl.qty), 0)::int AS total_quantity,
       r.created_at
     FROM receipts r
     LEFT JOIN receipt_lines rl ON rl.receipt_id = r.id AND rl.tenant_id = r.tenant_id
     LEFT JOIN purchase_orders po ON po.id = r.po_id
     LEFT JOIN suppliers s ON s.id = po.supplier_id
     LEFT JOIN locations l ON l.id = r.location_id
     WHERE r.tenant_id = $1
       AND ($2::timestamptz IS NULL OR r.created_at >= $2)
       AND ($3::timestamptz IS NULL OR r.created_at <= $3)
     GROUP BY r.id, r.status, l.code, s.name, r.created_at
     ORDER BY r.created_at DESC
     LIMIT 50`,
    [req.user!.tenantId, from, to]
  );

  res.json(result.rows);
}
