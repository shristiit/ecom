/* eslint-disable */
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('idempotency_keys', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    key: { type: 'text', notNull: true },
    method: { type: 'text', notNull: true },
    path: { type: 'text', notNull: true },
    request_hash: { type: 'text', notNull: true },
    status_code: { type: 'int', notNull: true },
    response_body: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('idempotency_keys', ['tenant_id', 'key'], { unique: true });

  pgm.createTable('reservations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    customer_id: { type: 'uuid', references: 'customers' },
    order_id: { type: 'uuid', references: 'orders' },
    size_id: { type: 'uuid', notNull: true, references: 'sku_sizes' },
    location_id: { type: 'uuid', notNull: true, references: 'locations' },
    qty: { type: 'int', notNull: true },
    backorder_qty: { type: 'int', notNull: true, default: 0 },
    status: { type: 'text', notNull: true, default: 'active' },
    reserved_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
    released_at: { type: 'timestamptz' },
  });
  pgm.createIndex('reservations', ['tenant_id', 'expires_at']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('reservations');
  pgm.dropTable('idempotency_keys');
}
