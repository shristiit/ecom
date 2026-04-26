/* eslint-disable */
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createType('tenant_lifecycle_status', ['trialing', 'active', 'past_due', 'suspended', 'cancelled']);

  pgm.addColumns('tenants', {
    lifecycle_status: { type: 'tenant_lifecycle_status', notNull: true, default: 'trialing' },
  });

  pgm.createTable('platform_admins', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'text', notNull: true, unique: true },
    full_name: { type: 'text', notNull: true, default: '' },
    password_hash: { type: 'text', notNull: true },
    status: { type: 'user_status', notNull: true, default: 'active' },
    last_login_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('tenant_subscriptions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade', unique: true },
    provider: { type: 'text', notNull: true, default: 'gocardless' },
    plan_code: { type: 'text', notNull: true, default: 'starter' },
    status: { type: 'tenant_lifecycle_status', notNull: true, default: 'trialing' },
    provider_customer_id: { type: 'text' },
    provider_subscription_id: { type: 'text' },
    provider_mandate_id: { type: 'text' },
    current_period_start: { type: 'timestamptz' },
    current_period_end: { type: 'timestamptz' },
    metadata: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('tenant_payment_methods', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade', unique: true },
    provider: { type: 'text', notNull: true, default: 'gocardless' },
    provider_payment_method_id: { type: 'text' },
    account_name: { type: 'text', notNull: true, default: '' },
    account_mask: { type: 'text', notNull: true, default: '' },
    status: { type: 'text', notNull: true, default: 'pending' },
    metadata: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('tenant_entitlements', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade', unique: true },
    features: { type: 'text[]', notNull: true, default: '{}' },
    max_skus: { type: 'int', notNull: true, default: 1000 },
    monthly_ai_tokens: { type: 'bigint', notNull: true, default: 250000 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('tenant_usage_counters', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade', unique: true },
    sku_count: { type: 'int', notNull: true, default: 0 },
    ai_tokens_used: { type: 'bigint', notNull: true, default: 0 },
    ai_tokens_window_started_at: { type: 'timestamptz', notNull: true, default: pgm.func('date_trunc(\'month\', now())') },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('tenant_restrictions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade', unique: true },
    write_blocked: { type: 'boolean', notNull: true, default: false },
    blocked_features: { type: 'text[]', notNull: true, default: '{}' },
    restrictions: { type: 'text[]', notNull: true, default: '{}' },
    reason: { type: 'text', notNull: true, default: '' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('tenant_audit_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', references: 'tenants', onDelete: 'cascade' },
    actor_type: { type: 'text', notNull: true },
    actor_id: { type: 'uuid' },
    event_type: { type: 'text', notNull: true },
    payload: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('tenant_audit_events', ['tenant_id', 'created_at']);
  pgm.createIndex('tenant_audit_events', ['actor_type', 'created_at']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('tenant_audit_events');
  pgm.dropTable('tenant_restrictions');
  pgm.dropTable('tenant_usage_counters');
  pgm.dropTable('tenant_entitlements');
  pgm.dropTable('tenant_payment_methods');
  pgm.dropTable('tenant_subscriptions');
  pgm.dropTable('platform_admins');
  pgm.dropColumns('tenants', ['lifecycle_status']);
  pgm.dropType('tenant_lifecycle_status');
}
