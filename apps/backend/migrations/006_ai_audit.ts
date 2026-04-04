/* eslint-disable */
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('ai_audit_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    conversation_id: { type: 'uuid' },
    workflow_id: { type: 'uuid' },
    approval_request_id: { type: 'uuid', references: 'ai_action_requests', onDelete: 'set null' },
    actor_id: { type: 'uuid', notNull: true, references: 'users' },
    event_type: { type: 'text', notNull: true },
    payload: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('ai_audit_events', ['tenant_id', 'created_at']);
  pgm.createIndex('ai_audit_events', ['tenant_id', 'workflow_id']);
  pgm.createIndex('ai_audit_events', ['tenant_id', 'conversation_id']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('ai_audit_events');
}
