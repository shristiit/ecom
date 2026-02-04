/* eslint-disable */
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  pgm.createType('status_active', ['active', 'inactive', 'archived']);
  pgm.createType('user_status', ['active', 'disabled']);
  pgm.createType('po_status', ['draft', 'open', 'closed', 'cancelled']);
  pgm.createType('invoice_status', ['draft', 'sent', 'paid', 'cancelled']);
  pgm.createType('receipt_status', ['partial', 'complete']);
  pgm.createType('approval_status', ['pending', 'approved', 'rejected']);
  pgm.createType('txn_status', ['proposed', 'confirmed', 'approved', 'rejected']);
  pgm.createType('txn_type', ['receive', 'transfer', 'adjust', 'write_off', 'cycle_count', 'sale', 'reversal']);

  pgm.createTable('tenants', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    slug: { type: 'text', notNull: true, unique: true },
    status: { type: 'status_active', notNull: true, default: 'active' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('roles', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    name: { type: 'text', notNull: true },
    permissions: { type: 'text[]', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('roles', ['tenant_id', 'name'], { unique: true });

  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    role_id: { type: 'uuid', notNull: true, references: 'roles' },
    email: { type: 'text', notNull: true },
    username: { type: 'text', notNull: true },
    password_hash: { type: 'text', notNull: true },
    status: { type: 'user_status', notNull: true, default: 'active' },
    last_login_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('users', ['tenant_id', 'email'], { unique: true });
  pgm.createIndex('users', ['tenant_id', 'username'], { unique: true });

  pgm.createTable('sso_identities', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'cascade' },
    provider: { type: 'text', notNull: true },
    provider_user_id: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('sso_identities', ['tenant_id', 'provider', 'provider_user_id'], { unique: true });

  pgm.createTable('policies', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    name: { type: 'text', notNull: true },
    rules: { type: 'jsonb', notNull: true, default: '[]' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('policies', ['tenant_id', 'name'], { unique: true });

  pgm.createTable('locations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    name: { type: 'text', notNull: true },
    code: { type: 'text', notNull: true },
    type: { type: 'text', notNull: true },
    address: { type: 'text', notNull: true, default: '' },
    status: { type: 'status_active', notNull: true, default: 'active' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('locations', ['tenant_id', 'code'], { unique: true });

  pgm.createTable('products', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    style_code: { type: 'text', notNull: true },
    name: { type: 'text', notNull: true },
    category: { type: 'text', notNull: true, default: '' },
    brand: { type: 'text', notNull: true, default: '' },
    base_price: { type: 'bigint', notNull: true, default: 0 },
    status: { type: 'status_active', notNull: true, default: 'active' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('products', ['tenant_id', 'style_code'], { unique: true });

  pgm.createTable('skus', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    product_id: { type: 'uuid', notNull: true, references: 'products', onDelete: 'cascade' },
    color_name: { type: 'text', notNull: true },
    color_code: { type: 'text' },
    sku_code: { type: 'text', notNull: true },
    price_override: { type: 'bigint' },
    status: { type: 'status_active', notNull: true, default: 'active' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('skus', ['tenant_id', 'sku_code'], { unique: true });
  pgm.createIndex('skus', ['tenant_id', 'product_id']);

  pgm.createTable('sku_sizes', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    sku_id: { type: 'uuid', notNull: true, references: 'skus', onDelete: 'cascade' },
    size_label: { type: 'text', notNull: true },
    barcode: { type: 'text', notNull: true },
    unit_of_measure: { type: 'text', notNull: true },
    pack_size: { type: 'int', notNull: true, default: 1 },
    price_override: { type: 'bigint' },
    status: { type: 'status_active', notNull: true, default: 'active' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('sku_sizes', ['tenant_id', 'barcode'], { unique: true });
  pgm.createIndex('sku_sizes', ['tenant_id', 'sku_id']);

  pgm.createTable('suppliers', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    name: { type: 'text', notNull: true },
    email: { type: 'text', notNull: true, default: '' },
    phone: { type: 'text', notNull: true, default: '' },
    address: { type: 'text', notNull: true, default: '' },
    status: { type: 'status_active', notNull: true, default: 'active' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('customers', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    name: { type: 'text', notNull: true },
    email: { type: 'text', notNull: true, default: '' },
    phone: { type: 'text', notNull: true, default: '' },
    address: { type: 'text', notNull: true, default: '' },
    status: { type: 'status_active', notNull: true, default: 'active' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('purchase_orders', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    supplier_id: { type: 'uuid', notNull: true, references: 'suppliers' },
    status: { type: 'po_status', notNull: true, default: 'draft' },
    expected_date: { type: 'timestamptz' },
    created_by: { type: 'uuid', notNull: true, references: 'users' },
    approved_by: { type: 'uuid', references: 'users' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('purchase_order_lines', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    po_id: { type: 'uuid', notNull: true, references: 'purchase_orders', onDelete: 'cascade' },
    size_id: { type: 'uuid', notNull: true, references: 'sku_sizes' },
    qty: { type: 'int', notNull: true },
    unit_cost: { type: 'bigint', notNull: true },
  });
  pgm.createIndex('purchase_order_lines', ['tenant_id', 'po_id']);

  pgm.createTable('receipts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    po_id: { type: 'uuid', references: 'purchase_orders' },
    location_id: { type: 'uuid', notNull: true, references: 'locations' },
    status: { type: 'receipt_status', notNull: true, default: 'partial' },
    created_by: { type: 'uuid', notNull: true, references: 'users' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('receipt_lines', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    receipt_id: { type: 'uuid', notNull: true, references: 'receipts', onDelete: 'cascade' },
    size_id: { type: 'uuid', notNull: true, references: 'sku_sizes' },
    qty: { type: 'int', notNull: true },
    unit_cost: { type: 'bigint', notNull: true },
  });

  pgm.createTable('invoices', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    customer_id: { type: 'uuid', notNull: true, references: 'customers' },
    status: { type: 'invoice_status', notNull: true, default: 'draft' },
    total: { type: 'bigint', notNull: true, default: 0 },
    created_by: { type: 'uuid', notNull: true, references: 'users' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('invoice_lines', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    invoice_id: { type: 'uuid', notNull: true, references: 'invoices', onDelete: 'cascade' },
    size_id: { type: 'uuid', notNull: true, references: 'sku_sizes' },
    qty: { type: 'int', notNull: true },
    unit_price: { type: 'bigint', notNull: true },
  });

  pgm.createTable('stock_balances', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    size_id: { type: 'uuid', notNull: true, references: 'sku_sizes' },
    location_id: { type: 'uuid', notNull: true, references: 'locations' },
    on_hand: { type: 'int', notNull: true, default: 0 },
    reserved: { type: 'int', notNull: true, default: 0 },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('stock_balances', ['tenant_id', 'size_id', 'location_id'], { unique: true });

  pgm.createTable('conversations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    created_by: { type: 'uuid', notNull: true, references: 'users' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('inventory_transactions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    type: { type: 'txn_type', notNull: true },
    size_id: { type: 'uuid', notNull: true, references: 'sku_sizes' },
    sku_id: { type: 'uuid', notNull: true, references: 'skus' },
    product_id: { type: 'uuid', notNull: true, references: 'products' },
    from_location_id: { type: 'uuid', references: 'locations' },
    to_location_id: { type: 'uuid', references: 'locations' },
    quantity: { type: 'int', notNull: true },
    unit: { type: 'text', notNull: true },
    reason: { type: 'text', notNull: true, default: '' },
    event_time: { type: 'timestamptz', notNull: true },
    recorded_time: { type: 'timestamptz', notNull: true },
    created_by: { type: 'uuid', notNull: true, references: 'users' },
    confirmed_by: { type: 'uuid', references: 'users' },
    approved_by: { type: 'uuid', references: 'users' },
    before_after: { type: 'jsonb', notNull: true, default: '{}' },
    conversation_id: { type: 'uuid', references: 'conversations' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('inventory_transactions', ['tenant_id', 'size_id']);
  pgm.createIndex('inventory_transactions', ['tenant_id', 'recorded_time']);

  pgm.createTable('transaction_specs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    intent: { type: 'text', notNull: true },
    entities: { type: 'jsonb', notNull: true, default: '{}' },
    quantities: { type: 'jsonb', notNull: true, default: '{}' },
    constraints: { type: 'jsonb', notNull: true, default: '{}' },
    confidence: { type: 'float', notNull: true, default: 0 },
    governance_decision: { type: 'jsonb', notNull: true, default: '{}' },
    status: { type: 'txn_status', notNull: true, default: 'proposed' },
    created_by: { type: 'uuid', notNull: true, references: 'users' },
    conversation_id: { type: 'uuid', references: 'conversations' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('approvals', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    status: { type: 'approval_status', notNull: true, default: 'pending' },
    required_role_id: { type: 'uuid', notNull: true, references: 'roles' },
    requested_by: { type: 'uuid', notNull: true, references: 'users' },
    approved_by: { type: 'uuid', references: 'users' },
    transaction_spec_id: { type: 'uuid', notNull: true, references: 'transaction_specs', onDelete: 'cascade' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('conversation_turns', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    conversation_id: { type: 'uuid', notNull: true, references: 'conversations', onDelete: 'cascade' },
    role: { type: 'text', notNull: true },
    content: { type: 'text', notNull: true },
    metadata: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('audit_records', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    transaction_id: { type: 'uuid', notNull: true, references: 'inventory_transactions' },
    request_text: { type: 'text', notNull: true, default: '' },
    who: { type: 'uuid', notNull: true, references: 'users' },
    approver: { type: 'uuid', references: 'users' },
    before_after: { type: 'jsonb', notNull: true, default: '{}' },
    why: { type: 'text', notNull: true, default: '' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('audit_records', ['tenant_id', 'created_at']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('audit_records');
  pgm.dropTable('conversation_turns');
  pgm.dropTable('approvals');
  pgm.dropTable('transaction_specs');
  pgm.dropTable('inventory_transactions');
  pgm.dropTable('conversations');
  pgm.dropTable('stock_balances');
  pgm.dropTable('invoice_lines');
  pgm.dropTable('invoices');
  pgm.dropTable('receipt_lines');
  pgm.dropTable('receipts');
  pgm.dropTable('purchase_order_lines');
  pgm.dropTable('purchase_orders');
  pgm.dropTable('customers');
  pgm.dropTable('suppliers');
  pgm.dropTable('sku_sizes');
  pgm.dropTable('skus');
  pgm.dropTable('products');
  pgm.dropTable('locations');
  pgm.dropTable('policies');
  pgm.dropTable('sso_identities');
  pgm.dropTable('users');
  pgm.dropTable('roles');
  pgm.dropTable('tenants');

  pgm.dropType('txn_type');
  pgm.dropType('txn_status');
  pgm.dropType('approval_status');
  pgm.dropType('receipt_status');
  pgm.dropType('invoice_status');
  pgm.dropType('po_status');
  pgm.dropType('user_status');
  pgm.dropType('status_active');
}
