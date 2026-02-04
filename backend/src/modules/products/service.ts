import { Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';

const productSchema = z.object({
  styleCode: z.string().min(2),
  name: z.string().min(2),
  category: z.string().optional().default(''),
  brand: z.string().optional().default(''),
  basePrice: z.number().int().nonnegative(),
  priceVisible: z.boolean().optional().default(true),
  inventoryMode: z.enum(['local', 'global']).optional().default('local'),
  maxBackorderQty: z.number().int().nonnegative().optional().nullable(),
  pickupEnabled: z.boolean().optional().default(false),
  categoryId: z.string().uuid().optional().nullable(),
  status: z.enum(['active', 'inactive']).default('active'),
});

const skuSchema = z.object({
  colorName: z.string().min(1),
  colorCode: z.string().optional().nullable(),
  skuCode: z.string().min(2),
  priceOverride: z.number().int().nonnegative().optional().nullable(),
  status: z.enum(['active', 'inactive']).default('active'),
});

const sizeSchema = z.object({
  sizeLabel: z.string().min(1),
  barcode: z.string().min(3),
  unitOfMeasure: z.string().min(1),
  packSize: z.number().int().positive().default(1),
  priceOverride: z.number().int().nonnegative().optional().nullable(),
  status: z.enum(['active', 'inactive']).default('active'),
});

export async function listProducts(req: Request, res: Response) {
  const rows = await query(
    `SELECT id, style_code, name, category, brand, base_price, status, created_at, updated_at
     FROM products WHERE tenant_id = $1 ORDER BY updated_at DESC`,
    [req.user!.tenantId]
  );
  res.json(rows.rows);
}

export async function createProduct(req: Request, res: Response) {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const p = parsed.data;
  const result = await query(
    `INSERT INTO products (tenant_id, style_code, name, category, brand, base_price, price_visible, inventory_mode, max_backorder_qty, pickup_enabled, category_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      req.user!.tenantId,
      p.styleCode,
      p.name,
      p.category,
      p.brand,
      p.basePrice,
      p.priceVisible,
      p.inventoryMode,
      p.maxBackorderQty ?? null,
      p.pickupEnabled,
      p.categoryId ?? null,
      p.status,
    ]
  );
  res.status(201).json(result.rows[0]);
}

export async function getProduct(req: Request, res: Response) {
  const productRes = await query(
    `SELECT * FROM products WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.user!.tenantId]
  );
  if (productRes.rowCount === 0) return res.status(404).json({ message: 'Not found' });

  const skusRes = await query(
    `SELECT * FROM skus WHERE product_id = $1 AND tenant_id = $2 ORDER BY created_at`,
    [req.params.id, req.user!.tenantId]
  );
  const sizesRes = await query(
    `SELECT * FROM sku_sizes WHERE sku_id = ANY($1::uuid[]) AND tenant_id = $2 ORDER BY created_at`,
    [skusRes.rows.map((r) => r.id), req.user!.tenantId]
  );

  res.json({ product: productRes.rows[0], skus: skusRes.rows, sizes: sizesRes.rows });
}

export async function updateProduct(req: Request, res: Response) {
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const p = parsed.data;
  const result = await query(
    `UPDATE products SET
       style_code = COALESCE($1, style_code),
       name = COALESCE($2, name),
       category = COALESCE($3, category),
       brand = COALESCE($4, brand),
       base_price = COALESCE($5, base_price),
       price_visible = COALESCE($6, price_visible),
       inventory_mode = COALESCE($7, inventory_mode),
       max_backorder_qty = COALESCE($8, max_backorder_qty),
       pickup_enabled = COALESCE($9, pickup_enabled),
       category_id = COALESCE($10, category_id),
       status = COALESCE($11, status),
       updated_at = NOW()
     WHERE id = $12 AND tenant_id = $13
     RETURNING *`,
    [
      p.styleCode ?? null,
      p.name ?? null,
      p.category ?? null,
      p.brand ?? null,
      p.basePrice ?? null,
      p.priceVisible ?? null,
      p.inventoryMode ?? null,
      p.maxBackorderQty ?? null,
      p.pickupEnabled ?? null,
      p.categoryId ?? null,
      p.status ?? null,
      req.params.id,
      req.user!.tenantId,
    ]
  );
  if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
  res.json(result.rows[0]);
}

export async function deleteProduct(req: Request, res: Response) {
  await query(`DELETE FROM products WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.user!.tenantId]);
  res.status(204).send();
}

export async function createSku(req: Request, res: Response) {
  const parsed = skuSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const s = parsed.data;
  const result = await query(
    `INSERT INTO skus (tenant_id, product_id, color_name, color_code, sku_code, price_override, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [req.user!.tenantId, req.params.id, s.colorName, s.colorCode ?? null, s.skuCode, s.priceOverride ?? null, s.status]
  );
  res.status(201).json(result.rows[0]);
}

export async function searchSkus(req: Request, res: Response) {
  const q = String(req.query.q ?? '').trim();
  const rows = await query(
    `SELECT id, sku_code, color_name, product_id FROM skus
     WHERE tenant_id = $1 AND (sku_code ILIKE $2 OR color_name ILIKE $2)
     ORDER BY sku_code LIMIT 50`,
    [req.user!.tenantId, `%${q}%`]
  );
  res.json(rows.rows);
}

export async function updateSku(req: Request, res: Response) {
  const parsed = skuSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const s = parsed.data;
  const result = await query(
    `UPDATE skus SET
       color_name = COALESCE($1, color_name),
       color_code = COALESCE($2, color_code),
       sku_code = COALESCE($3, sku_code),
       price_override = COALESCE($4, price_override),
       status = COALESCE($5, status),
       updated_at = NOW()
     WHERE id = $6 AND tenant_id = $7
     RETURNING *`,
    [s.colorName ?? null, s.colorCode ?? null, s.skuCode ?? null, s.priceOverride ?? null, s.status ?? null, req.params.skuId, req.user!.tenantId]
  );
  if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
  res.json(result.rows[0]);
}

export async function deleteSku(req: Request, res: Response) {
  await query(`DELETE FROM skus WHERE id = $1 AND tenant_id = $2`, [req.params.skuId, req.user!.tenantId]);
  res.status(204).send();
}

export async function createSkuSize(req: Request, res: Response) {
  const parsed = sizeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const s = parsed.data;
  const result = await query(
    `INSERT INTO sku_sizes (tenant_id, sku_id, size_label, barcode, unit_of_measure, pack_size, price_override, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [req.user!.tenantId, req.params.skuId, s.sizeLabel, s.barcode, s.unitOfMeasure, s.packSize, s.priceOverride ?? null, s.status]
  );
  res.status(201).json(result.rows[0]);
}

export async function updateSkuSize(req: Request, res: Response) {
  const parsed = sizeSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const s = parsed.data;
  const result = await query(
    `UPDATE sku_sizes SET
       size_label = COALESCE($1, size_label),
       barcode = COALESCE($2, barcode),
       unit_of_measure = COALESCE($3, unit_of_measure),
       pack_size = COALESCE($4, pack_size),
       price_override = COALESCE($5, price_override),
       status = COALESCE($6, status),
       updated_at = NOW()
     WHERE id = $7 AND tenant_id = $8
     RETURNING *`,
    [s.sizeLabel ?? null, s.barcode ?? null, s.unitOfMeasure ?? null, s.packSize ?? null, s.priceOverride ?? null, s.status ?? null, req.params.sizeId, req.user!.tenantId]
  );
  if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
  res.json(result.rows[0]);
}

export async function deleteSkuSize(req: Request, res: Response) {
  await query(`DELETE FROM sku_sizes WHERE id = $1 AND tenant_id = $2`, [req.params.sizeId, req.user!.tenantId]);
  res.status(204).send();
}

export async function listProductLocations(req: Request, res: Response) {
  const rows = await query(
    `SELECT pl.location_id, l.name, pl.is_enabled, pl.pickup_enabled
     FROM product_locations pl
     JOIN locations l ON pl.location_id = l.id
     WHERE pl.product_id = $1 AND pl.tenant_id = $2
     ORDER BY l.name`,
    [req.params.id, req.user!.tenantId]
  );
  res.json(rows.rows);
}

export async function upsertProductLocation(req: Request, res: Response) {
  const { locationId, isEnabled, pickupEnabled } = req.body ?? {};
  if (!locationId) return res.status(400).json({ message: 'locationId required' });
  const result = await query(
    `INSERT INTO product_locations (tenant_id, product_id, location_id, is_enabled, pickup_enabled)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (tenant_id, product_id, location_id)
     DO UPDATE SET is_enabled = EXCLUDED.is_enabled, pickup_enabled = EXCLUDED.pickup_enabled, updated_at = NOW()
     RETURNING *`,
    [req.user!.tenantId, req.params.id, locationId, Boolean(isEnabled), Boolean(pickupEnabled)]
  );
  res.status(201).json(result.rows[0]);
}

export async function deleteProductLocation(req: Request, res: Response) {
  await query(
    `DELETE FROM product_locations WHERE tenant_id = $1 AND product_id = $2 AND location_id = $3`,
    [req.user!.tenantId, req.params.id, req.params.locationId]
  );
  res.status(204).send();
}
