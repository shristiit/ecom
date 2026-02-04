/* eslint-disable */
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('products', {
    price_visible: { type: 'boolean', notNull: true, default: true },
    inventory_mode: { type: 'text', notNull: true, default: 'local' },
    max_backorder_qty: { type: 'int' },
    pickup_enabled: { type: 'boolean', notNull: true, default: false },
    category_id: { type: 'uuid' },
  });

  pgm.addColumns('stock_balances', {
    backorder: { type: 'int', notNull: true, default: 0 },
  });

  pgm.createTable('categories', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    name: { type: 'text', notNull: true },
    slug: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('categories', ['tenant_id', 'slug'], { unique: true });

  pgm.createTable('product_locations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    product_id: { type: 'uuid', notNull: true, references: 'products', onDelete: 'cascade' },
    location_id: { type: 'uuid', notNull: true, references: 'locations', onDelete: 'cascade' },
    is_enabled: { type: 'boolean', notNull: true, default: true },
    pickup_enabled: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('product_locations', ['tenant_id', 'product_id', 'location_id'], { unique: true });

  pgm.addColumns('customers', {
    currency_preference: { type: 'text', notNull: true, default: 'GBP' },
    auth_provider: { type: 'text', notNull: true, default: 'local' },
    auth_user_id: { type: 'text' },
    role: { type: 'text', notNull: true, default: 'customer' },
    store_location_id: { type: 'uuid', references: 'locations' },
    password_hash: { type: 'text' },
  });
  pgm.createIndex('customers', ['tenant_id', 'email'], { unique: true });

  pgm.createTable('addresses', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    customer_id: { type: 'uuid', notNull: true, references: 'customers', onDelete: 'cascade' },
    label: { type: 'text', notNull: true, default: 'Home' },
    line1: { type: 'text', notNull: true },
    line2: { type: 'text', notNull: true, default: '' },
    city: { type: 'text', notNull: true },
    postcode: { type: 'text', notNull: true },
    country: { type: 'text', notNull: true, default: 'GB' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('carts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    customer_id: { type: 'uuid', notNull: true, references: 'customers', onDelete: 'cascade' },
    name: { type: 'text', notNull: true, default: 'Main' },
    status: { type: 'text', notNull: true, default: 'active' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('cart_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    cart_id: { type: 'uuid', notNull: true, references: 'carts', onDelete: 'cascade' },
    size_id: { type: 'uuid', notNull: true, references: 'sku_sizes' },
    qty: { type: 'int', notNull: true },
    unit_price: { type: 'bigint', notNull: true },
    currency: { type: 'text', notNull: true, default: 'GBP' },
    price_visible: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('cart_items', ['tenant_id', 'cart_id']);

  pgm.createTable('saved_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    customer_id: { type: 'uuid', notNull: true, references: 'customers', onDelete: 'cascade' },
    size_id: { type: 'uuid', notNull: true, references: 'sku_sizes' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('orders', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    customer_id: { type: 'uuid', notNull: true, references: 'customers' },
    placed_by_user_id: { type: 'uuid', references: 'users' },
    status: { type: 'text', notNull: true, default: 'pending' },
    currency: { type: 'text', notNull: true, default: 'GBP' },
    subtotal: { type: 'bigint', notNull: true, default: 0 },
    discount_total: { type: 'bigint', notNull: true, default: 0 },
    tax_total: { type: 'bigint', notNull: true, default: 0 },
    shipping_total: { type: 'bigint', notNull: true, default: 0 },
    grand_total: { type: 'bigint', notNull: true, default: 0 },
    delivery_type: { type: 'text', notNull: true, default: 'shipping' },
    pickup_location_id: { type: 'uuid', references: 'locations' },
    shipping_address_id: { type: 'uuid', references: 'addresses' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('order_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    order_id: { type: 'uuid', notNull: true, references: 'orders', onDelete: 'cascade' },
    size_id: { type: 'uuid', notNull: true, references: 'sku_sizes' },
    qty: { type: 'int', notNull: true },
    unit_price: { type: 'bigint', notNull: true },
    currency: { type: 'text', notNull: true, default: 'GBP' },
    line_total: { type: 'bigint', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('promotions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    type: { type: 'text', notNull: true },
    value: { type: 'int', notNull: true },
    code: { type: 'text' },
    active: { type: 'boolean', notNull: true, default: true },
    starts_at: { type: 'timestamptz' },
    ends_at: { type: 'timestamptz' },
    applies_to: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('product_locations');
  pgm.dropTable('promotions');
  pgm.dropTable('order_items');
  pgm.dropTable('orders');
  pgm.dropTable('saved_items');
  pgm.dropTable('cart_items');
  pgm.dropTable('carts');
  pgm.dropTable('addresses');
  pgm.dropTable('categories');

  pgm.dropColumns('customers', ['currency_preference','auth_provider','auth_user_id','role','store_location_id','password_hash']);
  pgm.dropColumns('stock_balances', ['backorder']);
  pgm.dropColumns('products', ['price_visible','inventory_mode','max_backorder_qty','pickup_enabled','category_id']);
}
