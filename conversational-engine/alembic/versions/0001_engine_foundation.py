"""engine foundation tables"""

from __future__ import annotations

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = '0001_engine_foundation'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    op.execute('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    vector_available = bool(
        connection.execute(sa.text("SELECT 1 FROM pg_available_extensions WHERE name = 'vector'")).scalar()
    )

    if vector_available:
        op.execute('CREATE EXTENSION IF NOT EXISTS vector')

    op.create_table(
        'ai_conversations',
        sa.Column('id', sa.UUID(), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('status', sa.Text(), nullable=False, server_default=sa.text("'active'")),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_ai_conversations_tenant_updated', 'ai_conversations', ['tenant_id', 'updated_at'])

    op.create_table(
        'ai_workflows',
        sa.Column('id', sa.UUID(), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column(
            'conversation_id', sa.UUID(), sa.ForeignKey('ai_conversations.id', ondelete='CASCADE'), nullable=False
        ),
        sa.Column('status', sa.Text(), nullable=False),
        sa.Column('current_task', sa.Text(), nullable=True),
        sa.Column('active_preview_id', sa.UUID(), nullable=True),
        sa.Column('active_approval_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_ai_workflows_tenant_conversation', 'ai_workflows', ['tenant_id', 'conversation_id'])

    op.create_table(
        'ai_workflow_memory',
        sa.Column('id', sa.UUID(), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('workflow_id', sa.UUID(), sa.ForeignKey('ai_workflows.id', ondelete='CASCADE'), nullable=False),
        sa.Column('current_task', sa.Text(), nullable=True),
        sa.Column('extracted_entities', JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('missing_fields', JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index(
        'ix_ai_workflow_memory_tenant_workflow', 'ai_workflow_memory', ['tenant_id', 'workflow_id'], unique=True
    )

    op.create_table(
        'ai_conversation_messages',
        sa.Column('id', sa.UUID(), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column(
            'conversation_id', sa.UUID(), sa.ForeignKey('ai_conversations.id', ondelete='CASCADE'), nullable=False
        ),
        sa.Column('workflow_id', sa.UUID(), sa.ForeignKey('ai_workflows.id', ondelete='SET NULL'), nullable=True),
        sa.Column('role', sa.Text(), nullable=False),
        sa.Column('blocks', JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column('raw_text', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index(
        'ix_ai_messages_tenant_conversation', 'ai_conversation_messages', ['tenant_id', 'conversation_id', 'created_at']
    )

    op.create_table(
        'ai_help_documents',
        sa.Column('id', sa.UUID(), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('tenant_id', sa.UUID(), nullable=True),
        sa.Column('source_key', sa.Text(), nullable=False),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('document_type', sa.Text(), nullable=False),
        sa.Column('status', sa.Text(), nullable=False, server_default=sa.text("'active'")),
        sa.Column('metadata', JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_ai_help_documents_source', 'ai_help_documents', ['source_key'], unique=True)

    op.create_table(
        'ai_help_chunks',
        sa.Column('id', sa.UUID(), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('tenant_id', sa.UUID(), nullable=True),
        sa.Column('document_id', sa.UUID(), sa.ForeignKey('ai_help_documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('embedding', Vector(1536) if vector_available else JSONB(), nullable=True),
        sa.Column('metadata', JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_ai_help_chunks_document_index', 'ai_help_chunks', ['document_id', 'chunk_index'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_ai_help_chunks_document_index', table_name='ai_help_chunks')
    op.drop_table('ai_help_chunks')
    op.drop_index('ix_ai_help_documents_source', table_name='ai_help_documents')
    op.drop_table('ai_help_documents')
    op.drop_index('ix_ai_messages_tenant_conversation', table_name='ai_conversation_messages')
    op.drop_table('ai_conversation_messages')
    op.drop_index('ix_ai_workflow_memory_tenant_workflow', table_name='ai_workflow_memory')
    op.drop_table('ai_workflow_memory')
    op.drop_index('ix_ai_workflows_tenant_conversation', table_name='ai_workflows')
    op.drop_table('ai_workflows')
    op.drop_index('ix_ai_conversations_tenant_updated', table_name='ai_conversations')
    op.drop_table('ai_conversations')
