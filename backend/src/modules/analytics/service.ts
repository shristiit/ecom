import { Request, Response } from 'express';
import { pool } from '@backend/db/pool.js';

type AnalyticsParams = {
  locationId: string | null;
  category: string | null;
  size: string | null;
  color: string | null;
  threshold: number;
  days: number;
  limit: number;
  offset: number;
  sort: 'asc' | 'desc' | null;
  period: string | null;
  check: string | null;
};

function stringParam(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberParam(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.trunc(parsed);
}

function parseParams(req: Request): AnalyticsParams {
  return {
    locationId: stringParam(req.query.locationId),
    category: stringParam(req.query.category),
    size: stringParam(req.query.size),
    color: stringParam(req.query.color),
    threshold: Math.max(0, numberParam(req.query.threshold, 10)),
    days: Math.max(1, numberParam(req.query.days, 30)),
    limit: Math.min(100, Math.max(1, numberParam(req.query.limit, 50))),
    offset: Math.max(0, numberParam(req.query.offset, 0)),
    sort: stringParam(req.query.sort) === 'asc' ? 'asc' : stringParam(req.query.sort) === 'desc' ? 'desc' : null,
    period: stringParam(req.query.period),
    check: stringParam(req.query.check),
  };
}

function periodStart(params: AnalyticsParams): string | null {
  const now = new Date();
  if (params.period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }
  if (params.period === 'this_week') {
    const start = new Date(now);
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }
  if (params.period === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return start.toISOString();
  }
  if (params.days > 0) {
    return new Date(now.getTime() - params.days * 24 * 60 * 60 * 1000).toISOString();
  }
  return null;
}

function noRecentSalesCutoff(params: AnalyticsParams): string {
  return new Date(Date.now() - params.days * 24 * 60 * 60 * 1000).toISOString();
}

export async function lowStock(req: Request, res: Response) {
  const params = parseParams(req);
  const result = await pool.query(
    `SELECT
       p.name AS product_name,
       sk.sku_code,
       sz.size_label,
       sk.color_name,
       l.name AS location_name,
       sb.on_hand,
       $6::int AS reorder_level
     FROM stock_balances sb
     JOIN sku_sizes sz ON sz.id = sb.size_id
     JOIN skus sk ON sk.id = sz.sku_id
     JOIN products p ON p.id = sk.product_id
     JOIN locations l ON l.id = sb.location_id
     WHERE sb.tenant_id = $1
       AND ($2::text IS NULL OR sb.location_id::text = $2::text)
       AND ($3::text IS NULL OR sk.color_name ILIKE '%' || $3::text || '%')
       AND ($4::text IS NULL OR sz.size_label ILIKE '%' || $4::text || '%')
       AND ($5::text IS NULL OR p.category ILIKE '%' || $5::text || '%')
       AND sb.on_hand <= $6
     ORDER BY sb.on_hand ASC, p.name ASC, sk.sku_code ASC
     LIMIT $7 OFFSET $8`,
    [
      req.user!.tenantId,
      params.locationId,
      params.color,
      params.size,
      params.category,
      params.threshold,
      params.limit,
      params.offset,
    ],
  );
  res.json(result.rows);
}

export async function outOfStock(req: Request, res: Response) {
  const params = parseParams(req);
  const result = await pool.query(
    `SELECT
       p.name AS product_name,
       sk.sku_code,
       sz.size_label,
       sk.color_name,
       p.category
     FROM stock_balances sb
     JOIN sku_sizes sz ON sz.id = sb.size_id
     JOIN skus sk ON sk.id = sz.sku_id
     JOIN products p ON p.id = sk.product_id
     WHERE sb.tenant_id = $1
       AND ($2::text IS NULL OR sb.location_id::text = $2::text)
       AND ($3::text IS NULL OR sk.color_name ILIKE '%' || $3::text || '%')
       AND ($4::text IS NULL OR sz.size_label ILIKE '%' || $4::text || '%')
       AND ($5::text IS NULL OR p.category ILIKE '%' || $5::text || '%')
       AND sb.on_hand <= 0
     ORDER BY p.name ASC, sk.sku_code ASC
     LIMIT $6 OFFSET $7`,
    [
      req.user!.tenantId,
      params.locationId,
      params.color,
      params.size,
      params.category,
      params.limit,
      params.offset,
    ],
  );
  res.json(result.rows);
}

export async function topSelling(req: Request, res: Response) {
  const params = parseParams(req);
  const start = periodStart(params);
  const result = await pool.query(
    `SELECT
       p.name AS product_name,
       sk.sku_code,
       sk.color_name,
       sz.size_label,
       p.category,
       COALESCE(SUM(it.quantity), 0)::int AS units_sold,
       COALESCE(SUM(it.quantity * COALESCE(sz.price_override, sk.price_override, p.base_price, 0)), 0)::bigint AS revenue
     FROM inventory_transactions it
     JOIN sku_sizes sz ON sz.id = it.size_id
     JOIN skus sk ON sk.id = it.sku_id
     JOIN products p ON p.id = it.product_id
     WHERE it.tenant_id = $1
       AND it.type = 'sale'
       AND ($2::timestamptz IS NULL OR COALESCE(it.event_time, it.recorded_time) >= $2)
       AND ($3::text IS NULL OR it.from_location_id::text = $3::text)
       AND ($4::text IS NULL OR sk.color_name ILIKE '%' || $4::text || '%')
       AND ($5::text IS NULL OR sz.size_label ILIKE '%' || $5::text || '%')
       AND ($6::text IS NULL OR p.category ILIKE '%' || $6::text || '%')
     GROUP BY p.name, sk.sku_code, sk.color_name, sz.size_label, p.category
     ORDER BY units_sold DESC, revenue DESC, p.name ASC
     LIMIT $7 OFFSET $8`,
    [req.user!.tenantId, start, params.locationId, params.color, params.size, params.category, params.limit, params.offset],
  );
  res.json(result.rows);
}

export async function slowMoving(req: Request, res: Response) {
  const params = parseParams(req);
  const start = periodStart(params);
  const result = await pool.query(
    `WITH inventory_rows AS (
       SELECT
         sz.id AS size_id,
         COALESCE(SUM(sb.on_hand), 0)::int AS on_hand
       FROM sku_sizes sz
       LEFT JOIN stock_balances sb
         ON sb.size_id = sz.id
        AND sb.tenant_id = $1
        AND ($2::text IS NULL OR sb.location_id::text = $2::text)
       WHERE sz.tenant_id = $1
       GROUP BY sz.id
     ),
     sales_rows AS (
       SELECT
         it.size_id,
         COALESCE(SUM(it.quantity), 0)::int AS units_sold,
         MAX(COALESCE(it.event_time, it.recorded_time)) AS last_sold_date
       FROM inventory_transactions it
       WHERE it.tenant_id = $1
         AND it.type = 'sale'
         AND ($2::text IS NULL OR it.from_location_id::text = $2::text)
         AND ($3::timestamptz IS NULL OR COALESCE(it.event_time, it.recorded_time) >= $3)
       GROUP BY it.size_id
     )
     SELECT
       p.name AS product_name,
       sk.sku_code,
       sk.color_name,
       sz.size_label,
       sales_rows.last_sold_date,
       inventory_rows.on_hand
     FROM inventory_rows
     JOIN sku_sizes sz ON sz.id = inventory_rows.size_id
     JOIN skus sk ON sk.id = sz.sku_id
     JOIN products p ON p.id = sk.product_id
     LEFT JOIN sales_rows ON sales_rows.size_id = inventory_rows.size_id
     WHERE inventory_rows.on_hand > 0
       AND ($4::text IS NULL OR sk.color_name ILIKE '%' || $4::text || '%')
       AND ($5::text IS NULL OR sz.size_label ILIKE '%' || $5::text || '%')
       AND ($6::text IS NULL OR p.category ILIKE '%' || $6::text || '%')
     ORDER BY COALESCE(sales_rows.units_sold, 0) ASC, sales_rows.last_sold_date ASC NULLS FIRST, inventory_rows.on_hand DESC
     LIMIT $7 OFFSET $8`,
    [req.user!.tenantId, params.locationId, start, params.color, params.size, params.category, params.limit, params.offset],
  );
  res.json(result.rows);
}

export async function noRecentSales(req: Request, res: Response) {
  const params = parseParams(req);
  const cutoff = noRecentSalesCutoff(params);
  const result = await pool.query(
    `WITH inventory_rows AS (
       SELECT
         sz.id AS size_id,
         COALESCE(SUM(sb.on_hand), 0)::int AS on_hand
       FROM sku_sizes sz
       LEFT JOIN stock_balances sb
         ON sb.size_id = sz.id
        AND sb.tenant_id = $1
        AND ($2::text IS NULL OR sb.location_id::text = $2::text)
       WHERE sz.tenant_id = $1
       GROUP BY sz.id
     ),
     sales_rows AS (
       SELECT
         it.size_id,
         MAX(COALESCE(it.event_time, it.recorded_time)) AS last_sold_date
       FROM inventory_transactions it
       WHERE it.tenant_id = $1
         AND it.type = 'sale'
         AND ($2::text IS NULL OR it.from_location_id::text = $2::text)
       GROUP BY it.size_id
     )
     SELECT
       p.name AS product_name,
       sk.sku_code,
       sk.color_name,
       sz.size_label,
       sales_rows.last_sold_date,
       inventory_rows.on_hand
     FROM inventory_rows
     JOIN sku_sizes sz ON sz.id = inventory_rows.size_id
     JOIN skus sk ON sk.id = sz.sku_id
     JOIN products p ON p.id = sk.product_id
     LEFT JOIN sales_rows ON sales_rows.size_id = inventory_rows.size_id
     WHERE inventory_rows.on_hand > 0
       AND ($3::text IS NULL OR sk.color_name ILIKE '%' || $3::text || '%')
       AND ($4::text IS NULL OR sz.size_label ILIKE '%' || $4::text || '%')
       AND ($5::text IS NULL OR p.category ILIKE '%' || $5::text || '%')
       AND (sales_rows.last_sold_date IS NULL OR sales_rows.last_sold_date < $6::timestamptz)
     ORDER BY sales_rows.last_sold_date ASC NULLS FIRST, inventory_rows.on_hand DESC, p.name ASC
     LIMIT $7 OFFSET $8`,
    [req.user!.tenantId, params.locationId, params.color, params.size, params.category, cutoff, params.limit, params.offset],
  );
  res.json(result.rows);
}

export async function reorderNeeded(req: Request, res: Response) {
  const params = parseParams(req);
  const result = await pool.query(
    `SELECT
       p.name AS product_name,
       sk.sku_code,
       sz.size_label,
       sb.on_hand,
       $6::int AS reorder_level,
       GREATEST($6::int - sb.on_hand, 1) AS suggested_order_qty
     FROM stock_balances sb
     JOIN sku_sizes sz ON sz.id = sb.size_id
     JOIN skus sk ON sk.id = sz.sku_id
     JOIN products p ON p.id = sk.product_id
     WHERE sb.tenant_id = $1
       AND ($2::text IS NULL OR sb.location_id::text = $2::text)
       AND ($3::text IS NULL OR sk.color_name ILIKE '%' || $3::text || '%')
       AND ($4::text IS NULL OR sz.size_label ILIKE '%' || $4::text || '%')
       AND ($5::text IS NULL OR p.category ILIKE '%' || $5::text || '%')
       AND sb.on_hand <= $6
     ORDER BY sb.on_hand ASC, p.name ASC
     LIMIT $7 OFFSET $8`,
    [
      req.user!.tenantId,
      params.locationId,
      params.color,
      params.size,
      params.category,
      params.threshold,
      params.limit,
      params.offset,
    ],
  );
  res.json(result.rows);
}

export async function stockValue(req: Request, res: Response) {
  const params = parseParams(req);
  const sortSql = params.sort === 'asc' ? 'ASC' : 'DESC';
  const result = await pool.query(
    `SELECT
       p.name AS product_name,
       sk.sku_code,
       sz.size_label,
       COALESCE(SUM(sb.on_hand), 0)::int AS on_hand,
       COALESCE(latest_cost.unit_cost, sz.price_override, sk.price_override, p.base_price, 0)::bigint AS unit_cost,
       (COALESCE(SUM(sb.on_hand), 0) * COALESCE(latest_cost.unit_cost, sz.price_override, sk.price_override, p.base_price, 0))::bigint AS total_value
     FROM sku_sizes sz
     JOIN skus sk ON sk.id = sz.sku_id
     JOIN products p ON p.id = sk.product_id
     LEFT JOIN stock_balances sb
       ON sb.size_id = sz.id
      AND sb.tenant_id = $1
      AND ($2::text IS NULL OR sb.location_id::text = $2::text)
     LEFT JOIN LATERAL (
       SELECT rl.unit_cost
       FROM receipt_lines rl
       JOIN receipts r ON r.id = rl.receipt_id AND r.tenant_id = rl.tenant_id
       WHERE rl.tenant_id = $1
         AND rl.size_id = sz.id
       ORDER BY r.created_at DESC
       LIMIT 1
     ) latest_cost ON TRUE
     WHERE sz.tenant_id = $1
       AND ($3::text IS NULL OR sk.color_name ILIKE '%' || $3::text || '%')
       AND ($4::text IS NULL OR sz.size_label ILIKE '%' || $4::text || '%')
       AND ($5::text IS NULL OR p.category ILIKE '%' || $5::text || '%')
     GROUP BY p.name, sk.sku_code, sz.size_label, latest_cost.unit_cost, sz.price_override, sk.price_override, p.base_price
     HAVING COALESCE(SUM(sb.on_hand), 0) > 0
     ORDER BY total_value ${sortSql}, p.name ASC
     LIMIT $6 OFFSET $7`,
    [req.user!.tenantId, params.locationId, params.color, params.size, params.category, params.limit, params.offset],
  );
  res.json(result.rows);
}

export async function highDemandLowStock(req: Request, res: Response) {
  const params = parseParams(req);
  const start = periodStart(params);
  const threshold = params.threshold || 10;
  const days = Math.max(1, params.days);
  const result = await pool.query(
    `WITH inventory_rows AS (
       SELECT
         sz.id AS size_id,
         COALESCE(SUM(sb.on_hand), 0)::int AS on_hand
       FROM sku_sizes sz
       LEFT JOIN stock_balances sb
         ON sb.size_id = sz.id
        AND sb.tenant_id = $1
        AND ($2::text IS NULL OR sb.location_id::text = $2::text)
       WHERE sz.tenant_id = $1
       GROUP BY sz.id
     ),
     sales_rows AS (
       SELECT
         it.size_id,
         COALESCE(SUM(it.quantity), 0)::int AS units_sold
       FROM inventory_transactions it
       WHERE it.tenant_id = $1
         AND it.type = 'sale'
         AND ($2::text IS NULL OR it.from_location_id::text = $2::text)
         AND ($3::timestamptz IS NULL OR COALESCE(it.event_time, it.recorded_time) >= $3)
       GROUP BY it.size_id
     )
     SELECT
       p.name AS product_name,
       sk.sku_code,
       sz.size_label,
       COALESCE(sales_rows.units_sold, 0)::int AS units_sold,
       inventory_rows.on_hand,
       CASE
         WHEN COALESCE(sales_rows.units_sold, 0) <= 0 THEN NULL
         ELSE ROUND((inventory_rows.on_hand::numeric / NULLIF(sales_rows.units_sold::numeric / $7::numeric, 0)), 1)
       END AS days_of_stock_left
     FROM inventory_rows
     JOIN sku_sizes sz ON sz.id = inventory_rows.size_id
     JOIN skus sk ON sk.id = sz.sku_id
     JOIN products p ON p.id = sk.product_id
     LEFT JOIN sales_rows ON sales_rows.size_id = inventory_rows.size_id
     WHERE inventory_rows.on_hand <= $6
       AND COALESCE(sales_rows.units_sold, 0) > 0
       AND ($4::text IS NULL OR sk.color_name ILIKE '%' || $4::text || '%')
       AND ($5::text IS NULL OR sz.size_label ILIKE '%' || $5::text || '%')
       AND ($8::text IS NULL OR p.category ILIKE '%' || $8::text || '%')
     ORDER BY sales_rows.units_sold DESC, inventory_rows.on_hand ASC, p.name ASC
     LIMIT $9 OFFSET $10`,
    [
      req.user!.tenantId,
      params.locationId,
      start,
      params.color,
      params.size,
      threshold,
      days,
      params.category,
      params.limit,
      params.offset,
    ],
  );
  res.json(result.rows);
}

export async function recentlyAdded(req: Request, res: Response) {
  const params = parseParams(req);
  const result = await pool.query(
    `SELECT
       p.name AS product_name,
       p.style_code,
       p.category,
       p.brand,
       p.base_price,
       p.status::text AS status,
       p.created_at
     FROM products p
     WHERE p.tenant_id = $1
       AND ($2::text IS NULL OR p.category ILIKE '%' || $2::text || '%')
     ORDER BY p.created_at DESC, p.name ASC
     LIMIT $3 OFFSET $4`,
    [req.user!.tenantId, params.category, params.limit, params.offset],
  );
  res.json(result.rows);
}

async function runDataQualityCheck(tenantId: string, params: AnalyticsParams) {
  switch (params.check) {
    case 'negative_stock':
      return (
        await pool.query(
          `SELECT
             p.name AS product_name,
             sk.sku_code,
             sz.size_label,
             l.name AS location_name,
             sb.on_hand
           FROM stock_balances sb
           JOIN sku_sizes sz ON sz.id = sb.size_id
           JOIN skus sk ON sk.id = sz.sku_id
           JOIN products p ON p.id = sk.product_id
           JOIN locations l ON l.id = sb.location_id
           WHERE sb.tenant_id = $1
             AND sb.on_hand < 0
           ORDER BY sb.on_hand ASC
           LIMIT $2 OFFSET $3`,
          [tenantId, params.limit, params.offset],
        )
      ).rows;
    case 'duplicate_sku':
      return (
        await pool.query(
          `SELECT
             sk.sku_code,
             MIN(p.name) AS product_name,
             COUNT(*)::int AS count
           FROM skus sk
           JOIN products p ON p.id = sk.product_id
           WHERE sk.tenant_id = $1
           GROUP BY sk.sku_code
           HAVING COUNT(*) > 1
           ORDER BY count DESC, sk.sku_code ASC
           LIMIT $2 OFFSET $3`,
          [tenantId, params.limit, params.offset],
        )
      ).rows;
    case 'same_barcode_diff_name':
      return (
        await pool.query(
          `SELECT
             sz.barcode,
             STRING_AGG(DISTINCT p.name, ', ' ORDER BY p.name) AS product_names,
             COUNT(DISTINCT p.name)::int AS count
           FROM sku_sizes sz
           JOIN skus sk ON sk.id = sz.sku_id
           JOIN products p ON p.id = sk.product_id
           WHERE sz.tenant_id = $1
             AND sz.barcode IS NOT NULL
             AND sz.barcode <> ''
           GROUP BY sz.barcode
           HAVING COUNT(DISTINCT p.name) > 1
           ORDER BY count DESC, sz.barcode ASC
           LIMIT $2 OFFSET $3`,
          [tenantId, params.limit, params.offset],
        )
      ).rows;
    case 'inactive_with_stock':
      return (
        await pool.query(
          `SELECT
             p.name AS product_name,
             sk.sku_code,
             p.status::text AS status,
             COALESCE(SUM(sb.on_hand), 0)::int AS on_hand
           FROM products p
           JOIN skus sk ON sk.product_id = p.id
           JOIN sku_sizes sz ON sz.sku_id = sk.id
           LEFT JOIN stock_balances sb ON sb.size_id = sz.id AND sb.tenant_id = p.tenant_id
           WHERE p.tenant_id = $1
             AND p.status::text = 'inactive'
           GROUP BY p.name, sk.sku_code, p.status
           HAVING COALESCE(SUM(sb.on_hand), 0) > 0
           ORDER BY on_hand DESC, p.name ASC
           LIMIT $2 OFFSET $3`,
          [tenantId, params.limit, params.offset],
        )
      ).rows;
    case 'active_zero_price':
      return (
        await pool.query(
          `SELECT
             p.name AS product_name,
             p.style_code,
             COALESCE(sz.price_override, sk.price_override, p.base_price, 0)::bigint AS base_price,
             p.status::text AS status
           FROM products p
           JOIN skus sk ON sk.product_id = p.id
           JOIN sku_sizes sz ON sz.sku_id = sk.id
           WHERE p.tenant_id = $1
             AND p.status::text = 'active'
             AND COALESCE(sz.price_override, sk.price_override, p.base_price, 0) <= 0
           ORDER BY p.name ASC
           LIMIT $2 OFFSET $3`,
          [tenantId, params.limit, params.offset],
        )
      ).rows;
    case 'missing_fields':
      return (
        await pool.query(
          `SELECT
             p.name AS product_name,
             p.style_code,
             CONCAT_WS(
               ', ',
               CASE WHEN COALESCE(p.category, '') = '' THEN 'category' END,
               CASE WHEN COALESCE(p.brand, '') = '' THEN 'brand' END,
               CASE WHEN COALESCE(sk.sku_code, '') = '' THEN 'sku' END,
               CASE WHEN COALESCE(sk.color_name, '') = '' THEN 'color' END,
               CASE WHEN COALESCE(sz.size_label, '') = '' THEN 'size' END,
               CASE WHEN COALESCE(sz.barcode, '') = '' THEN 'barcode' END
             ) AS missing_fields
           FROM products p
           JOIN skus sk ON sk.product_id = p.id
           JOIN sku_sizes sz ON sz.sku_id = sk.id
           WHERE p.tenant_id = $1
             AND (
               COALESCE(p.category, '') = ''
               OR COALESCE(p.brand, '') = ''
               OR COALESCE(sk.sku_code, '') = ''
               OR COALESCE(sk.color_name, '') = ''
               OR COALESCE(sz.size_label, '') = ''
               OR COALESCE(sz.barcode, '') = ''
             )
           ORDER BY p.name ASC
           LIMIT $2 OFFSET $3`,
          [tenantId, params.limit, params.offset],
        )
      ).rows;
    case 'stock_no_location':
      return (
        await pool.query(
          `SELECT
             p.name AS product_name,
             sk.sku_code,
             COALESCE(SUM(sb.on_hand), 0)::int AS on_hand
           FROM stock_balances sb
           JOIN sku_sizes sz ON sz.id = sb.size_id
           JOIN skus sk ON sk.id = sz.sku_id
           JOIN products p ON p.id = sk.product_id
           LEFT JOIN locations l ON l.id = sb.location_id
           WHERE sb.tenant_id = $1
             AND l.id IS NULL
           GROUP BY p.name, sk.sku_code
           ORDER BY on_hand DESC, p.name ASC
           LIMIT $2 OFFSET $3`,
          [tenantId, params.limit, params.offset],
        )
      ).rows;
    case 'sold_before_added':
      return (
        await pool.query(
          `SELECT
             p.name AS product_name,
             sk.sku_code,
             MIN(COALESCE(it.event_time, it.recorded_time)) AS first_sale_date,
             p.created_at AS inventory_created_at
           FROM inventory_transactions it
           JOIN sku_sizes sz ON sz.id = it.size_id
           JOIN skus sk ON sk.id = sz.sku_id
           JOIN products p ON p.id = sk.product_id
           WHERE it.tenant_id = $1
             AND it.type = 'sale'
           GROUP BY p.name, sk.sku_code, p.created_at
           HAVING MIN(COALESCE(it.event_time, it.recorded_time)) < p.created_at
           ORDER BY first_sale_date ASC
           LIMIT $2 OFFSET $3`,
          [tenantId, params.limit, params.offset],
        )
      ).rows;
    case 'multiple_cost_prices':
      return (
        await pool.query(
          `SELECT
             sk.sku_code,
             p.name AS product_name,
             MIN(s.name) AS supplier_name,
             STRING_AGG(DISTINCT pol.unit_cost::text, ', ' ORDER BY pol.unit_cost::text) AS cost_price
           FROM purchase_order_lines pol
           JOIN purchase_orders po ON po.id = pol.po_id AND po.tenant_id = pol.tenant_id
           JOIN suppliers s ON s.id = po.supplier_id
           JOIN sku_sizes sz ON sz.id = pol.size_id
           JOIN skus sk ON sk.id = sz.sku_id
           JOIN products p ON p.id = sk.product_id
           WHERE pol.tenant_id = $1
           GROUP BY sk.sku_code, p.name
           HAVING COUNT(DISTINCT pol.unit_cost) > 1
           ORDER BY sk.sku_code ASC
           LIMIT $2 OFFSET $3`,
          [tenantId, params.limit, params.offset],
        )
      ).rows;
    case 'reserved_exceeds_available':
      return (
        await pool.query(
          `SELECT
             p.name AS product_name,
             sk.sku_code,
             (sb.on_hand - sb.reserved) AS available,
             sb.reserved
           FROM stock_balances sb
           JOIN sku_sizes sz ON sz.id = sb.size_id
           JOIN skus sk ON sk.id = sz.sku_id
           JOIN products p ON p.id = sk.product_id
           WHERE sb.tenant_id = $1
             AND sb.reserved > GREATEST(sb.on_hand - sb.reserved, 0)
           ORDER BY sb.reserved DESC, p.name ASC
           LIMIT $2 OFFSET $3`,
          [tenantId, params.limit, params.offset],
        )
      ).rows;
    case 'unapproved_adjustments':
      return (
        await pool.query(
          `SELECT
             p.name AS product_name,
             sk.sku_code,
             COALESCE(u.email, it.created_by::text, '') AS adjusted_by,
             it.quantity AS qty_change,
             COALESCE(it.event_time, it.recorded_time) AS adjustment_date
           FROM inventory_transactions it
           JOIN skus sk ON sk.id = it.sku_id
           JOIN products p ON p.id = it.product_id
           LEFT JOIN users u ON u.id = it.created_by
           WHERE it.tenant_id = $1
             AND it.type IN ('adjust', 'write_off', 'cycle_count')
             AND it.approved_by IS NULL
           ORDER BY COALESCE(it.event_time, it.recorded_time) DESC
           LIMIT $2 OFFSET $3`,
          [tenantId, params.limit, params.offset],
        )
      ).rows;
    default:
      return [];
  }
}

export async function dataQuality(req: Request, res: Response) {
  const params = parseParams(req);
  const rows = await runDataQualityCheck(req.user!.tenantId, params);
  res.json(rows);
}

type VariantAvailabilityParams = {
  productName: string | null;
  sku: string | null;
  locationId: string | null;
  size: string | null;
  sizes: string[];
  color: string | null;
  availability: 'any' | 'in_stock' | 'low_stock' | 'out_of_stock';
  threshold: number;
  groupBy: 'product' | 'size' | 'color' | 'variant';
  matchAllSizes: boolean;
  excludeSize: string | null;
  minColorCount: number | null;
  maxColorCount: number | null;
  maxInStockSizeCount: number | null;
  limit: number;
  offset: number;
};

function stringListParam(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => String(entry).split(','))
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean);
  }
  return [];
}

function variantParams(req: Request): VariantAvailabilityParams {
  const size = stringParam(req.query.size);
  const sizes = stringListParam(req.query.sizes);
  const availability = stringParam(req.query.availability);
  const groupBy = stringParam(req.query.groupBy);
  return {
    productName: stringParam(req.query.productName),
    sku: stringParam(req.query.sku),
    locationId: stringParam(req.query.locationId),
    size: size ? size.toUpperCase() : null,
    sizes,
    color: stringParam(req.query.color),
    availability:
      availability === 'in_stock' || availability === 'low_stock' || availability === 'out_of_stock'
        ? availability
        : 'any',
    threshold: Math.max(0, numberParam(req.query.threshold, 10)),
    groupBy:
      groupBy === 'size' || groupBy === 'color' || groupBy === 'variant'
        ? groupBy
        : 'product',
    matchAllSizes: String(req.query.matchAllSizes ?? '').toLowerCase() === 'true',
    excludeSize: stringParam(req.query.excludeSize)?.toUpperCase() ?? null,
    minColorCount:
      req.query.minColorCount == null ? null : Math.max(0, numberParam(req.query.minColorCount, 0)),
    maxColorCount:
      req.query.maxColorCount == null ? null : Math.max(0, numberParam(req.query.maxColorCount, 0)),
    maxInStockSizeCount:
      req.query.maxInStockSizeCount == null ? null : Math.max(0, numberParam(req.query.maxInStockSizeCount, 0)),
    limit: Math.min(100, Math.max(1, numberParam(req.query.limit, 50))),
    offset: Math.max(0, numberParam(req.query.offset, 0)),
  };
}

function pushParam(values: Array<string | number | null>, value: string | number | null) {
  values.push(value);
  return `$${values.length}`;
}

function variantAvailabilityCondition(
  params: VariantAvailabilityParams,
  values: Array<string | number | null>,
  alias = 'vs',
) {
  if (params.availability === 'in_stock') {
    return `${alias}.available_qty > 0`;
  }
  if (params.availability === 'out_of_stock') {
    return `${alias}.available_qty <= 0`;
  }
  if (params.availability === 'low_stock') {
    const thresholdRef = pushParam(values, params.threshold);
    return `${alias}.available_qty > 0 AND ${alias}.available_qty <= ${thresholdRef}`;
  }
  return 'TRUE';
}

function baseVariantSql(params: VariantAvailabilityParams, values: Array<string | number | null>) {
  const productRef = pushParam(values, params.productName);
  const skuRef = pushParam(values, params.sku);
  const locationRef = pushParam(values, params.locationId);
  const colorRef = pushParam(values, params.color);
  return `WITH variant_stock AS (
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.style_code,
      sk.sku_code,
      sk.color_name,
      sz.size_label,
      COALESCE(SUM(COALESCE(sb.on_hand, 0) - COALESCE(sb.reserved, 0)), 0)::int AS available_qty,
      COALESCE(SUM(COALESCE(sb.on_hand, 0)), 0)::int AS on_hand_qty
    FROM products p
    JOIN skus sk ON sk.product_id = p.id
    JOIN sku_sizes sz ON sz.sku_id = sk.id
    LEFT JOIN stock_balances sb
      ON sb.size_id = sz.id
     AND sb.tenant_id = p.tenant_id
     AND (${locationRef}::text IS NULL OR sb.location_id::text = ${locationRef}::text)
    WHERE p.tenant_id = $1
      AND (${productRef}::text IS NULL OR p.name ILIKE '%' || ${productRef}::text || '%' OR p.style_code ILIKE '%' || ${productRef}::text || '%')
      AND (${skuRef}::text IS NULL OR sk.sku_code ILIKE '%' || ${skuRef}::text || '%')
      AND (${colorRef}::text IS NULL OR sk.color_name ILIKE '%' || ${colorRef}::text || '%')
    GROUP BY p.id, p.name, p.style_code, sk.sku_code, sk.color_name, sz.size_label
  )`;
}

export async function variantAvailability(req: Request, res: Response) {
  const params = variantParams(req);
  const values: Array<string | number | null> = [req.user!.tenantId];
  const baseSql = baseVariantSql(params, values);
  const availabilitySql = variantAvailabilityCondition(params, values);
  const sizes = params.sizes.length ? params.sizes : (params.size ? [params.size] : []);
  const sizeRefs = sizes.map((size) => pushParam(values, size));
  const excludeSizeRef = params.excludeSize ? pushParam(values, params.excludeSize) : null;
  const limitRef = pushParam(values, params.limit);
  const offsetRef = pushParam(values, params.offset);

  let sql = '';
  if (params.groupBy === 'size') {
    const sizeClause = sizeRefs.length ? `AND UPPER(vs.size_label) IN (${sizeRefs.join(', ')})` : '';
    sql = `${baseSql}
      SELECT
        vs.size_label,
        COALESCE(SUM(vs.available_qty), 0)::int AS available_qty,
        STRING_AGG(DISTINCT vs.color_name, ', ' ORDER BY vs.color_name) AS colors,
        COUNT(DISTINCT CASE WHEN vs.available_qty > 0 THEN vs.color_name END)::int AS color_count
      FROM variant_stock vs
      WHERE ${availabilitySql}
        ${sizeClause}
      GROUP BY vs.size_label
      ORDER BY vs.size_label ASC
      LIMIT ${limitRef} OFFSET ${offsetRef}`;
  } else if (params.groupBy === 'color') {
    const sizeClause = sizeRefs.length ? `AND UPPER(vs.size_label) IN (${sizeRefs.join(', ')})` : '';
    sql = `${baseSql}
      SELECT
        vs.color_name,
        COALESCE(SUM(vs.available_qty), 0)::int AS available_qty,
        STRING_AGG(DISTINCT vs.size_label, ', ' ORDER BY vs.size_label) AS sizes,
        COUNT(DISTINCT CASE WHEN vs.available_qty > 0 THEN vs.size_label END)::int AS size_count
      FROM variant_stock vs
      WHERE ${availabilitySql}
        ${sizeClause}
      GROUP BY vs.color_name
      ORDER BY vs.color_name ASC
      LIMIT ${limitRef} OFFSET ${offsetRef}`;
  } else if (params.groupBy === 'variant') {
    const sizeClause = sizeRefs.length ? `AND UPPER(vs.size_label) IN (${sizeRefs.join(', ')})` : '';
    sql = `${baseSql}
      SELECT
        vs.product_name,
        vs.style_code,
        vs.sku_code,
        vs.color_name,
        vs.size_label,
        vs.available_qty,
        vs.on_hand_qty
      FROM variant_stock vs
      WHERE ${availabilitySql}
        ${sizeClause}
      ORDER BY vs.product_name ASC, vs.color_name ASC, vs.size_label ASC
      LIMIT ${limitRef} OFFSET ${offsetRef}`;
  } else {
    const matchingSizeClause = sizeRefs.length ? `AND UPPER(vs.size_label) IN (${sizeRefs.join(', ')})` : '';
    const allSizeHaving =
      sizeRefs.length && params.matchAllSizes
        ? `AND COUNT(DISTINCT CASE WHEN ${availabilitySql} AND UPPER(vs.size_label) IN (${sizeRefs.join(', ')}) THEN UPPER(vs.size_label) END) = ${sizes.length}`
        : '';
    const anySizeHaving =
      sizeRefs.length && !params.matchAllSizes
        ? `AND COUNT(DISTINCT CASE WHEN ${availabilitySql} AND UPPER(vs.size_label) IN (${sizeRefs.join(', ')}) THEN UPPER(vs.size_label) END) >= 1`
        : '';
    const baseMatchHaving =
      !sizeRefs.length
        ? `AND COUNT(*) FILTER (WHERE ${availabilitySql}) >= 1`
        : '';
    const excludeHaving = excludeSizeRef
      ? `AND COUNT(DISTINCT CASE WHEN ${availabilitySql} AND UPPER(vs.size_label) = ${excludeSizeRef} THEN UPPER(vs.size_label) END) = 0`
      : '';
    const minColorHaving = params.minColorCount != null
      ? `AND COUNT(DISTINCT CASE WHEN ${availabilitySql}${matchingSizeClause.replace('AND ', ' AND ')} THEN vs.color_name END) >= ${pushParam(values, params.minColorCount)}`
      : '';
    const maxColorHaving = params.maxColorCount != null
      ? `AND COUNT(DISTINCT CASE WHEN ${availabilitySql} THEN vs.color_name END) <= ${pushParam(values, params.maxColorCount)}`
      : '';
    const maxSizeHaving = params.maxInStockSizeCount != null
      ? `AND COUNT(DISTINCT CASE WHEN vs.available_qty > 0 THEN UPPER(vs.size_label) END) <= ${pushParam(values, params.maxInStockSizeCount)}`
      : '';
    sql = `${baseSql}
      SELECT
        vs.product_name,
        vs.style_code,
        STRING_AGG(DISTINCT CASE WHEN ${availabilitySql} THEN vs.color_name END, ', ' ORDER BY CASE WHEN ${availabilitySql} THEN vs.color_name END) AS colors,
        STRING_AGG(DISTINCT CASE WHEN ${availabilitySql} THEN vs.size_label END, ', ' ORDER BY CASE WHEN ${availabilitySql} THEN vs.size_label END) AS sizes,
        COUNT(DISTINCT CASE WHEN ${availabilitySql} THEN vs.color_name END)::int AS color_count,
        COUNT(DISTINCT CASE WHEN ${availabilitySql} THEN vs.size_label END)::int AS size_count
      FROM variant_stock vs
      GROUP BY vs.product_id, vs.product_name, vs.style_code
      HAVING 1 = 1
        ${baseMatchHaving}
        ${allSizeHaving}
        ${anySizeHaving}
        ${excludeHaving}
        ${minColorHaving}
        ${maxColorHaving}
        ${maxSizeHaving}
      ORDER BY vs.product_name ASC
      LIMIT ${limitRef} OFFSET ${offsetRef}`;
  }

  const result = await pool.query(sql, values);
  res.json(result.rows);
}
