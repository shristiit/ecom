import { Request, Response } from 'express';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { S3_BUCKET, S3_PUBLIC_BASE_URL, S3_REGION } from '../../config/env.js';
import { pool, query } from '../../db/pool.js';

const s3Client = S3_REGION ? new S3Client({ region: S3_REGION }) : null;

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

const mediaSchema = z.object({
  url: z.string().url(),
  s3Key: z.string().min(1).optional(),
  altText: z.string().optional().default(''),
  sortOrder: z.number().int().nonnegative().optional().default(0),
  isPrimary: z.boolean().optional().default(false),
});

const allowedSizeLabels = new Set(
  ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', ...Array.from({ length: 15 }, (_, index) => String((index + 1) * 2))],
);

const composedSizeSchema = z.object({
  sizeLabel: z.string().min(1),
  barcode: z.string().min(3).optional(),
  unitOfMeasure: z.string().min(1).optional().default('unit'),
  packSize: z.number().int().positive().optional().default(1),
  priceOverride: z.number().int().nonnegative().optional().nullable(),
  stockByLocation: z
    .array(
      z.object({
        locationId: z.string().uuid(),
        quantity: z.number().int().nonnegative(),
      }),
    )
    .default([]),
});

const composedVariantSchema = z.object({
  colorName: z.string().min(1),
  colorCode: z.string().optional().nullable(),
  skuCode: z.string().min(2).optional(),
  priceOverride: z.number().int().nonnegative().optional().nullable(),
  media: z.array(mediaSchema).optional().default([]),
  sizes: z.array(composedSizeSchema).min(1),
});

const composedProductSchema = z.object({
  product: productSchema,
  styleMedia: z.array(mediaSchema).optional().default([]),
  variants: z.array(composedVariantSchema).min(1),
});

function normalizeSizeLabel(input: string) {
  return input.trim().toUpperCase();
}

function sanitizeCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]+/g, '').toUpperCase();
}

function generatedSkuCode(styleCode: string, colorName: string, variantIndex: number) {
  const style = sanitizeCode(styleCode).slice(0, 10) || 'STYLE';
  const color = sanitizeCode(colorName).slice(0, 6) || 'COLOR';
  return `${style}-${color}-${String(variantIndex + 1).padStart(2, '0')}`;
}

function generatedBarcode(styleCode: string, colorName: string, sizeLabel: string) {
  const style = sanitizeCode(styleCode).slice(0, 8) || 'STYLE';
  const color = sanitizeCode(colorName).slice(0, 4) || 'CLR';
  const size = sanitizeCode(sizeLabel).slice(0, 6) || 'SIZE';
  return `BC-${style}-${color}-${size}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildS3ObjectUrl(key: string) {
  if (S3_PUBLIC_BASE_URL) {
    return `${S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
  }
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
}

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

export async function createComposedProduct(req: Request, res: Response) {
  const parsed = composedProductSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  const payload = parsed.data;
  for (const variant of payload.variants) {
    for (const size of variant.sizes) {
      const normalized = normalizeSizeLabel(size.sizeLabel);
      if (!allowedSizeLabels.has(normalized)) {
        return res.status(400).json({ message: `Unsupported size label: ${size.sizeLabel}` });
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const productInput = payload.product;
    const productResult = await client.query(
      `INSERT INTO products (tenant_id, style_code, name, category, brand, base_price, price_visible, inventory_mode, max_backorder_qty, pickup_enabled, category_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        req.user!.tenantId,
        productInput.styleCode,
        productInput.name,
        productInput.category,
        productInput.brand,
        productInput.basePrice,
        productInput.priceVisible,
        productInput.inventoryMode,
        productInput.maxBackorderQty ?? null,
        productInput.pickupEnabled,
        productInput.categoryId ?? null,
        productInput.status,
      ],
    );

    const product = productResult.rows[0];
    const usedLocationIds = new Set<string>();
    let createdSkuCount = 0;
    let createdSizeCount = 0;
    let createdStockRows = 0;

    for (const [index, media] of payload.styleMedia.entries()) {
      await client.query(
        `INSERT INTO product_media (tenant_id, product_id, media_url, s3_key, alt_text, sort_order, is_primary)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          req.user!.tenantId,
          product.id,
          media.url,
          media.s3Key ?? null,
          media.altText ?? '',
          media.sortOrder ?? index,
          media.isPrimary ?? index === 0,
        ],
      );
    }

    for (const [variantIndex, variant] of payload.variants.entries()) {
      const nextSkuCode = variant.skuCode?.trim() || generatedSkuCode(product.style_code, variant.colorName, variantIndex);
      const skuResult = await client.query(
        `INSERT INTO skus (tenant_id, product_id, color_name, color_code, sku_code, price_override, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')
         RETURNING *`,
        [req.user!.tenantId, product.id, variant.colorName, variant.colorCode ?? null, nextSkuCode, variant.priceOverride ?? null],
      );

      const sku = skuResult.rows[0];
      createdSkuCount += 1;

      for (const [index, media] of variant.media.entries()) {
        await client.query(
          `INSERT INTO sku_media (tenant_id, sku_id, media_url, s3_key, alt_text, sort_order, is_primary)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            req.user!.tenantId,
            sku.id,
            media.url,
            media.s3Key ?? null,
            media.altText ?? '',
            media.sortOrder ?? index,
            media.isPrimary ?? index === 0,
          ],
        );
      }

      for (const size of variant.sizes) {
        const normalizedSize = normalizeSizeLabel(size.sizeLabel);
        const nextBarcode = size.barcode?.trim() || generatedBarcode(product.style_code, variant.colorName, normalizedSize);
        const sizeResult = await client.query(
          `INSERT INTO sku_sizes (tenant_id, sku_id, size_label, barcode, unit_of_measure, pack_size, price_override, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
           RETURNING *`,
          [
            req.user!.tenantId,
            sku.id,
            normalizedSize,
            nextBarcode,
            size.unitOfMeasure ?? 'unit',
            size.packSize ?? 1,
            size.priceOverride ?? null,
          ],
        );

        const createdSize = sizeResult.rows[0];
        createdSizeCount += 1;

        for (const stock of size.stockByLocation) {
          usedLocationIds.add(stock.locationId);
          if (stock.quantity <= 0) continue;

          await client.query(
            `INSERT INTO stock_balances (tenant_id, size_id, location_id, on_hand, reserved, backorder)
             VALUES ($1, $2, $3, $4, 0, 0)
             ON CONFLICT (tenant_id, size_id, location_id)
             DO UPDATE SET on_hand = stock_balances.on_hand + EXCLUDED.on_hand, updated_at = NOW()`,
            [req.user!.tenantId, createdSize.id, stock.locationId, stock.quantity],
          );

          await client.query(
            `INSERT INTO inventory_transactions
             (tenant_id, type, size_id, sku_id, product_id, from_location_id, to_location_id, quantity, unit, reason, event_time, recorded_time, created_by, confirmed_by, approved_by, before_after)
             VALUES ($1, 'receive', $2, $3, $4, NULL, $5, $6, 'unit', 'initial_stock', NOW(), NOW(), $7, $7, NULL, $8)`,
            [
              req.user!.tenantId,
              createdSize.id,
              sku.id,
              product.id,
              stock.locationId,
              stock.quantity,
              req.user!.id,
              { before: 0, after: stock.quantity },
            ],
          );
          createdStockRows += 1;
        }
      }
    }

    for (const locationId of usedLocationIds) {
      await client.query(
        `INSERT INTO product_locations (tenant_id, product_id, location_id, is_enabled, pickup_enabled)
         VALUES ($1, $2, $3, true, false)
         ON CONFLICT (tenant_id, product_id, location_id)
         DO UPDATE SET is_enabled = true, updated_at = NOW()`,
        [req.user!.tenantId, product.id, locationId],
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({
      productId: product.id,
      skuCount: createdSkuCount,
      sizeCount: createdSizeCount,
      stockRowCount: createdStockRows,
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    return res.status(400).json({ message: error?.message ?? 'Failed to create product composition' });
  } finally {
    client.release();
  }
}

export async function uploadProductMedia(req: Request, res: Response) {
  const file = req.file;
  if (!file) return res.status(400).json({ message: 'Missing file' });
  if (!file.mimetype.startsWith('image/')) return res.status(400).json({ message: 'Only image files are supported' });
  if (!S3_BUCKET || !S3_REGION || !s3Client) {
    return res.status(500).json({ message: 'S3 is not configured. Set S3_REGION and S3_BUCKET.' });
  }

  const safeName = sanitizeFileName(file.originalname || `image-${Date.now()}.jpg`);
  const key = `tenants/${req.user!.tenantId}/products/${Date.now()}-${randomUUID()}-${safeName}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }),
  );

  return res.status(201).json({
    key,
    url: buildS3ObjectUrl(key),
    contentType: file.mimetype,
    size: file.size,
  });
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
