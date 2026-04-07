/* eslint-disable */
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('ai_action_requests', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    conversation_id: { type: 'uuid' },
    workflow_id: { type: 'uuid' },
    requested_by: { type: 'uuid', notNull: true, references: 'users' },
    approved_by: { type: 'uuid', references: 'users' },
    action_type: { type: 'text', notNull: true },
    tool_name: { type: 'text', notNull: true },
    status: { type: 'approval_status', notNull: true, default: 'pending' },
    summary: { type: 'text', notNull: true, default: '' },
    reason: { type: 'text', notNull: true, default: '' },
    preview: { type: 'jsonb', notNull: true, default: '{}' },
    execution_payload: { type: 'jsonb', notNull: true, default: '{}' },
    result: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('ai_action_requests', ['tenant_id', 'status', 'created_at']);
  pgm.createIndex('ai_action_requests', ['tenant_id', 'workflow_id']);
  pgm.createIndex('ai_action_requests', ['tenant_id', 'conversation_id']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('ai_action_requests');
}
