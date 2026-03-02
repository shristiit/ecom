/* eslint-disable */
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('product_media', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    product_id: { type: 'uuid', notNull: true, references: 'products', onDelete: 'cascade' },
    media_url: { type: 'text', notNull: true },
    s3_key: { type: 'text' },
    alt_text: { type: 'text', notNull: true, default: '' },
    sort_order: { type: 'int', notNull: true, default: 0 },
    is_primary: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('product_media', ['tenant_id', 'product_id', 'sort_order']);

  pgm.createTable('sku_media', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    sku_id: { type: 'uuid', notNull: true, references: 'skus', onDelete: 'cascade' },
    media_url: { type: 'text', notNull: true },
    s3_key: { type: 'text' },
    alt_text: { type: 'text', notNull: true, default: '' },
    sort_order: { type: 'int', notNull: true, default: 0 },
    is_primary: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('sku_media', ['tenant_id', 'sku_id', 'sort_order']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('sku_media');
  pgm.dropTable('product_media');
}
