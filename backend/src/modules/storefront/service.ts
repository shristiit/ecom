import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { RESERVATION_TTL_MIN } from '../../config/env.js';

const cartItemSchema = z.object({
  sizeId: z.string().uuid(),
  qty: z.number().int().positive(),
  currency: z.string().default('GBP'),
});

const orderSchema = z.object({
  cartId: z.string().uuid(),
  deliveryType: z.enum(['shipping', 'pickup']),
  pickupLocationId: z.string().uuid().optional(),
  shippingAddressId: z.string().uuid().optional(),
  locationId: z.string().uuid(),
  applyPromotionCode: z.string().optional(),
});

const staffOrderSchema = orderSchema.extend({
  customerId: z.string().uuid(),
});

export async function categories(req: Request, res: Response) {
  const tenantId = req.customer?.tenantId ?? String(req.query.tenantId ?? '');
  if (!tenantId) return res.status(400).json({ message: 'tenantId required' });
  const rows = await pool.query(
    `SELECT id, name, slug FROM categories WHERE tenant_id = $1 ORDER BY name`,
    [tenantId]
  );
  res.json(rows.rows);
}

export async function products(req: Request, res: Response) {
  const tenantId = req.customer?.tenantId ?? String(req.query.tenantId ?? '');
  if (!tenantId) return res.status(400).json({ message: 'tenantId required' });

  const rows = await pool.query(
    `SELECT p.id, p.style_code, p.name, p.category, p.base_price, p.price_visible, p.inventory_mode,
            p.max_backorder_qty, p.pickup_enabled
     FROM products p WHERE p.tenant_id = $1 AND p.status = 'active'
     ORDER BY p.updated_at DESC LIMIT 200`,
    [tenantId]
  );
  res.json(rows.rows.map((r) => ({
    ...r,
    base_price: r.price_visible ? r.base_price : null,
  })));
}

export async function productDetail(req: Request, res: Response) {
  const tenantId = req.customer?.tenantId ?? String(req.query.tenantId ?? '');
  if (!tenantId) return res.status(400).json({ message: 'tenantId required' });

  const productRes = await pool.query(
    `SELECT * FROM products WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, tenantId]
  );
  if (productRes.rowCount === 0) return res.status(404).json({ message: 'Not found' });

  const skus = await pool.query(
    `SELECT * FROM skus WHERE product_id = $1 AND tenant_id = $2`,
    [req.params.id, tenantId]
  );
  const sizes = await pool.query(
    `SELECT * FROM sku_sizes WHERE sku_id = ANY($1::uuid[]) AND tenant_id = $2`,
    [skus.rows.map((r) => r.id), tenantId]
  );

  const product = productRes.rows[0];
  if (!product.price_visible) product.base_price = null;

  res.json({ product, skus: skus.rows, sizes: sizes.rows });
}

export async function search(req: Request, res: Response) {
  const tenantId = req.customer?.tenantId ?? String(req.query.tenantId ?? '');
  const q = String(req.query.q ?? '').trim();
  if (!tenantId) return res.status(400).json({ message: 'tenantId required' });

  const rows = await pool.query(
    `SELECT id, style_code, name, base_price, price_visible
     FROM products WHERE tenant_id = $1 AND status = 'active'
     AND (name ILIKE $2 OR style_code ILIKE $2)
     LIMIT 50`,
    [tenantId, `%${q}%`]
  );
  res.json(rows.rows.map((r) => ({
    ...r,
    base_price: r.price_visible ? r.base_price : null,
  })));
}

export async function availablePromotions(req: Request, res: Response) {
  const tenantId = req.customer?.tenantId ?? String(req.query.tenantId ?? '');
  if (!tenantId) return res.status(400).json({ message: 'tenantId required' });
  const rows = await pool.query(
    `SELECT id, type, value, code, starts_at, ends_at, applies_to
     FROM promotions
     WHERE tenant_id = $1 AND active = true
     ORDER BY created_at DESC`,
    [tenantId]
  );
  res.json(rows.rows);
}

export async function applyPromotion(req: Request, res: Response) {
  const tenantId = req.customer?.tenantId ?? String(req.body?.tenantId ?? '');
  const code = String(req.body?.code ?? '').trim();
  if (!tenantId || !code) return res.status(400).json({ message: 'tenantId and code required' });

  const rows = await pool.query(
    `SELECT id, type, value, code, starts_at, ends_at, applies_to
     FROM promotions
     WHERE tenant_id = $1 AND active = true AND code = $2`,
    [tenantId, code]
  );
  if (rows.rowCount === 0) return res.status(404).json({ message: 'Invalid code' });
  res.json(rows.rows[0]);
}

export async function createCart(req: Request, res: Response) {
  const name = String(req.body?.name ?? 'Main');
  const result = await pool.query(
    `INSERT INTO carts (tenant_id, customer_id, name) VALUES ($1,$2,$3) RETURNING *`,
    [req.customer!.tenantId, req.customer!.id, name]
  );
  res.status(201).json(result.rows[0]);
}

export async function listCarts(req: Request, res: Response) {
  const carts = await pool.query(
    `SELECT * FROM carts WHERE tenant_id = $1 AND customer_id = $2 ORDER BY updated_at DESC`,
    [req.customer!.tenantId, req.customer!.id]
  );
  res.json(carts.rows);
}

export async function addCartItem(req: Request, res: Response) {
  const parsed = cartItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const body = parsed.data;

  const priceRes = await pool.query(
    `SELECT p.base_price, p.price_visible, s.price_override as size_price, k.price_override as sku_price
     FROM sku_sizes s
     JOIN skus k ON s.sku_id = k.id
     JOIN products p ON k.product_id = p.id
     WHERE s.id = $1 AND s.tenant_id = $2`,
    [body.sizeId, req.customer!.tenantId]
  );
  if (priceRes.rowCount === 0) return res.status(404).json({ message: 'Size not found' });

  const priceRow = priceRes.rows[0];
  const unitPrice = priceRow.size_price ?? priceRow.sku_price ?? priceRow.base_price;

  const result = await pool.query(
    `INSERT INTO cart_items (tenant_id, cart_id, size_id, qty, unit_price, currency, price_visible)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.customer!.tenantId, req.params.id, body.sizeId, body.qty, unitPrice, body.currency, priceRow.price_visible]
  );
  res.status(201).json(result.rows[0]);
}

export async function updateCartItem(req: Request, res: Response) {
  const qty = Number(req.body?.qty ?? 0);
  if (qty <= 0) return res.status(400).json({ message: 'qty must be > 0' });
  const result = await pool.query(
    `UPDATE cart_items SET qty = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *`,
    [qty, req.params.itemId, req.customer!.tenantId]
  );
  if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
  res.json(result.rows[0]);
}

export async function deleteCartItem(req: Request, res: Response) {
  await pool.query(`DELETE FROM cart_items WHERE id = $1 AND tenant_id = $2`, [req.params.itemId, req.customer!.tenantId]);
  res.status(204).send();
}

export async function saveForLater(req: Request, res: Response) {
  const { itemId } = req.body;
  const itemRes = await pool.query(
    `SELECT size_id FROM cart_items WHERE id = $1 AND tenant_id = $2`,
    [itemId, req.customer!.tenantId]
  );
  if (itemRes.rowCount === 0) return res.status(404).json({ message: 'Item not found' });

  await pool.query(
    `INSERT INTO saved_items (tenant_id, customer_id, size_id) VALUES ($1,$2,$3)`,
    [req.customer!.tenantId, req.customer!.id, itemRes.rows[0].size_id]
  );
  await pool.query(`DELETE FROM cart_items WHERE id = $1 AND tenant_id = $2`, [itemId, req.customer!.tenantId]);
  res.status(201).json({ saved: true });
}

export async function savedItems(req: Request, res: Response) {
  const rows = await pool.query(
    `SELECT si.id, si.size_id, s.size_label FROM saved_items si
     JOIN sku_sizes s ON si.size_id = s.id
     WHERE si.tenant_id = $1 AND si.customer_id = $2`,
    [req.customer!.tenantId, req.customer!.id]
  );
  res.json(rows.rows);
}

export async function addSaved(req: Request, res: Response) {
  const sizeId = String(req.body?.sizeId ?? '');
  if (!sizeId) return res.status(400).json({ message: 'sizeId required' });
  const result = await pool.query(
    `INSERT INTO saved_items (tenant_id, customer_id, size_id) VALUES ($1,$2,$3) RETURNING *`,
    [req.customer!.tenantId, req.customer!.id, sizeId]
  );
  res.status(201).json(result.rows[0]);
}

export async function deleteSaved(req: Request, res: Response) {
  await pool.query(`DELETE FROM saved_items WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.customer!.tenantId]);
  res.status(204).send();
}

export async function listAddresses(req: Request, res: Response) {
  const rows = await pool.query(
    `SELECT * FROM addresses WHERE tenant_id = $1 AND customer_id = $2 ORDER BY created_at DESC`,
    [req.customer!.tenantId, req.customer!.id]
  );
  res.json(rows.rows);
}

export async function createAddress(req: Request, res: Response) {
  const { label, line1, line2, city, postcode, country } = req.body ?? {};
  if (!line1 || !city || !postcode) return res.status(400).json({ message: 'Invalid address' });
  const result = await pool.query(
    `INSERT INTO addresses (tenant_id, customer_id, label, line1, line2, city, postcode, country)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.customer!.tenantId, req.customer!.id, label ?? 'Home', line1, line2 ?? '', city, postcode, country ?? 'GB']
  );
  res.status(201).json(result.rows[0]);
}

export async function deleteAddress(req: Request, res: Response) {
  await pool.query(`DELETE FROM addresses WHERE id = $1 AND tenant_id = $2 AND customer_id = $3`, [req.params.id, req.customer!.tenantId, req.customer!.id]);
  res.status(204).send();
}

export async function createOrder(req: Request, res: Response) {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const body = parsed.data;

  try {
    const result = await createOrderInternal(req.customer!.tenantId, req.customer!.id, null, body);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ message: err?.message ?? 'Failed to create order' });
  }
}

export async function createOrderAsStaff(req: Request, res: Response) {
  const parsed = staffOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const body = parsed.data;

  try {
    const result = await createOrderInternal(req.customer!.tenantId, body.customerId, req.customer!.id, body);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ message: err?.message ?? 'Failed to create order' });
  }
}

export async function listOrders(req: Request, res: Response) {
  const rows = await pool.query(
    `SELECT * FROM orders WHERE tenant_id = $1 AND customer_id = $2 ORDER BY created_at DESC`,
    [req.customer!.tenantId, req.customer!.id]
  );
  res.json(rows.rows);
}

export async function getOrder(req: Request, res: Response) {
  const order = await pool.query(
    `SELECT * FROM orders WHERE id = $1 AND tenant_id = $2 AND customer_id = $3`,
    [req.params.id, req.customer!.tenantId, req.customer!.id]
  );
  if (order.rowCount === 0) return res.status(404).json({ message: 'Not found' });
  const items = await pool.query(
    `SELECT * FROM order_items WHERE order_id = $1 AND tenant_id = $2`,
    [req.params.id, req.customer!.tenantId]
  );
  res.json({ order: order.rows[0], items: items.rows });
}

async function createOrderInternal(tenantId: string, customerId: string, placedByUserId: string | null, body: any) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (body.deliveryType === 'pickup' && !body.pickupLocationId) {
      throw new Error('pickupLocationId required for pickup orders');
    }
    if (body.deliveryType === 'shipping' && !body.shippingAddressId) {
      throw new Error('shippingAddressId required for shipping orders');
    }

    const cartItems = await client.query(
      `SELECT * FROM cart_items WHERE cart_id = $1 AND tenant_id = $2`,
      [body.cartId, tenantId]
    );
    if (cartItems.rowCount === 0) throw new Error('Cart is empty');

    let subtotal = 0;
    for (const it of cartItems.rows) subtotal += Number(it.unit_price) * Number(it.qty);

    let discountTotal = 0;
    if (body.applyPromotionCode) {
      discountTotal = await computePromotionDiscount(client, tenantId, cartItems.rows, body.applyPromotionCode);
      if (discountTotal > subtotal) discountTotal = subtotal;
    }
    const grandTotal = subtotal - discountTotal;

    const orderRes = await client.query(
      `INSERT INTO orders (tenant_id, customer_id, placed_by_user_id, status, currency, subtotal, discount_total, grand_total, delivery_type, pickup_location_id, shipping_address_id)
       VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [tenantId, customerId, placedByUserId, cartItems.rows[0].currency, subtotal, discountTotal, grandTotal, body.deliveryType, body.pickupLocationId ?? null, body.shippingAddressId ?? null]
    );
    const orderId = orderRes.rows[0].id;

    for (const it of cartItems.rows) {
      await client.query(
        `INSERT INTO order_items (tenant_id, order_id, size_id, qty, unit_price, currency, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [tenantId, orderId, it.size_id, it.qty, it.unit_price, it.currency, Number(it.unit_price) * Number(it.qty)]
      );

      await reserveStock(client, tenantId, customerId, orderId, it.size_id, body.locationId, it.qty, body.deliveryType);
    }

    await client.query(`DELETE FROM cart_items WHERE cart_id = $1 AND tenant_id = $2`, [body.cartId, tenantId]);

    await client.query('COMMIT');
    return { orderId };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function reserveStock(
  client: any,
  tenantId: string,
  customerId: string,
  orderId: string,
  sizeId: string,
  locationId: string,
  qty: number,
  deliveryType: 'shipping' | 'pickup'
) {
  // Determine product inventory mode and backorder rules
  const meta = await client.query(
    `SELECT p.inventory_mode, p.max_backorder_qty, p.pickup_enabled, p.id as product_id
     FROM products p
     JOIN skus k ON k.product_id = p.id
     JOIN sku_sizes s ON s.sku_id = k.id
     WHERE s.id = $1 AND p.tenant_id = $2`,
    [sizeId, tenantId]
  );
  const inventoryMode = meta.rows[0]?.inventory_mode ?? 'local';
  const maxBackorder = meta.rows[0]?.max_backorder_qty ?? null;
  const productId = meta.rows[0]?.product_id;
  const productPickupEnabled = Boolean(meta.rows[0]?.pickup_enabled);

  // If location rules exist, ensure location is enabled
  const locRule = await client.query(
    `SELECT is_enabled FROM product_locations
     WHERE tenant_id = $1 AND product_id = $2 AND location_id = $3`,
    [tenantId, productId, locationId]
  );
  if (locRule.rowCount && locRule.rows[0].is_enabled === false) {
    throw new Error('Location not enabled for this product');
  }

  if (deliveryType === 'pickup') {
    if (!productPickupEnabled) throw new Error('Pickup not enabled for this product');
    const pickupRule = await client.query(
      `SELECT pickup_enabled FROM product_locations
       WHERE tenant_id = $1 AND product_id = $2 AND location_id = $3`,
      [tenantId, productId, locationId]
    );
    if (pickupRule.rowCount && pickupRule.rows[0].pickup_enabled === false) {
      throw new Error('Pickup not enabled at this location');
    }
  }

  let available = 0;
  if (inventoryMode === 'global') {
    const totalRes = await client.query(
      `SELECT COALESCE(SUM(on_hand - reserved),0) as available FROM stock_balances
       WHERE tenant_id = $1 AND size_id = $2`,
      [tenantId, sizeId]
    );
    available = Number(totalRes.rows[0].available);
  } else {
    const balRes = await client.query(
      `SELECT on_hand, reserved FROM stock_balances WHERE tenant_id = $1 AND size_id = $2 AND location_id = $3 FOR UPDATE`,
      [tenantId, sizeId, locationId]
    );
    if (balRes.rowCount) {
      available = Number(balRes.rows[0].on_hand) - Number(balRes.rows[0].reserved);
    }
  }

  const reserveQty = Math.min(qty, available);
  const backorderQty = qty - reserveQty;

  if (backorderQty > 0 && maxBackorder !== null && backorderQty > maxBackorder) {
    throw new Error('Backorder limit exceeded');
  }

  await client.query(
    `INSERT INTO stock_balances (tenant_id, size_id, location_id, on_hand, reserved, backorder)
     VALUES ($1,$2,$3,0,$4,$5)
     ON CONFLICT (tenant_id, size_id, location_id)
     DO UPDATE SET reserved = stock_balances.reserved + EXCLUDED.reserved,
                   backorder = stock_balances.backorder + EXCLUDED.backorder,
                   updated_at = NOW()`,
    [tenantId, sizeId, locationId, reserveQty, backorderQty]
  );

  const expiresAt = new Date(Date.now() + RESERVATION_TTL_MIN * 60 * 1000);
  await client.query(
    `INSERT INTO reservations (tenant_id, customer_id, order_id, size_id, location_id, qty, backorder_qty, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [tenantId, customerId, orderId, sizeId, locationId, reserveQty, backorderQty, expiresAt]
  );
}

async function computePromotionDiscount(client: any, tenantId: string, cartItems: any[], code: string) {
  const promoRes = await client.query(
    `SELECT type, value, applies_to FROM promotions
     WHERE tenant_id = $1 AND active = true AND code = $2
     AND (starts_at IS NULL OR starts_at <= NOW())
     AND (ends_at IS NULL OR ends_at >= NOW())`,
    [tenantId, code]
  );
  if (promoRes.rowCount === 0) return 0;
  const promo = promoRes.rows[0];
  const applies = promo.applies_to ?? {};

  const sizeIds = cartItems.map((c) => c.size_id);
  const meta = await client.query(
    `SELECT s.id as size_id, k.product_id, p.category_id
     FROM sku_sizes s
     JOIN skus k ON s.sku_id = k.id
     JOIN products p ON k.product_id = p.id
     WHERE s.id = ANY($1::uuid[]) AND p.tenant_id = $2`,
    [sizeIds, tenantId]
  );

  const eligibleSizeIds = new Set<string>();
  const productIds: string[] = applies.product_ids ?? [];
  const categoryIds: string[] = applies.category_ids ?? [];

  for (const row of meta.rows) {
    const productMatch = productIds.length === 0 || productIds.includes(row.product_id);
    const categoryMatch = categoryIds.length === 0 || (row.category_id && categoryIds.includes(row.category_id));
    if (productMatch && categoryMatch) eligibleSizeIds.add(row.size_id);
  }

  let discount = 0;
  if (promo.type === 'percent') {
    for (const it of cartItems) {
      if (!eligibleSizeIds.has(it.size_id)) continue;
      discount += Math.round((Number(it.unit_price) * Number(it.qty) * promo.value) / 100);
    }
  } else if (promo.type === 'fixed') {
    discount = Number(promo.value);
  } else if (promo.type === 'bxgy') {
    const buy = Number(applies.buy ?? 0);
    const get = Number(applies.get ?? 0);
    if (buy > 0 && get > 0) {
      for (const it of cartItems) {
        if (!eligibleSizeIds.has(it.size_id)) continue;
        const qty = Number(it.qty);
        const freeQty = Math.floor(qty / (buy + get)) * get;
        discount += freeQty * Number(it.unit_price);
      }
    }
  }

  return Math.max(0, discount);
}
