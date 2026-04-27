/* eslint-disable */
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('inventory_transactions', ['conversation_id']);
  pgm.dropTable('conversation_turns');
  pgm.dropTable('approvals');
  pgm.dropTable('transaction_specs');
  pgm.dropTable('conversations');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('conversations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    created_by: { type: 'uuid', notNull: true, references: 'users' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addColumns('inventory_transactions', {
    conversation_id: { type: 'uuid', references: 'conversations' },
  });

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
}
