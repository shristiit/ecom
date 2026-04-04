"""normalize ai workflow json columns to jsonb"""

from __future__ import annotations

from alembic import op

revision = '0002_jsonb_normalization'
down_revision = '0001_engine_foundation'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE ai_workflow_memory
        ALTER COLUMN extracted_entities
        TYPE jsonb
        USING extracted_entities::jsonb
        """
    )
    op.execute(
        """
        ALTER TABLE ai_workflow_memory
        ALTER COLUMN missing_fields
        TYPE jsonb
        USING missing_fields::jsonb
        """
    )
    op.execute(
        """
        ALTER TABLE ai_conversation_messages
        ALTER COLUMN blocks
        TYPE jsonb
        USING blocks::jsonb
        """
    )
    op.execute(
        """
        ALTER TABLE ai_help_documents
        ALTER COLUMN metadata
        TYPE jsonb
        USING metadata::jsonb
        """
    )
    op.execute(
        """
        ALTER TABLE ai_help_chunks
        ALTER COLUMN metadata
        TYPE jsonb
        USING metadata::jsonb
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE ai_help_chunks
        ALTER COLUMN metadata
        TYPE json
        USING metadata::json
        """
    )
    op.execute(
        """
        ALTER TABLE ai_help_documents
        ALTER COLUMN metadata
        TYPE json
        USING metadata::json
        """
    )
    op.execute(
        """
        ALTER TABLE ai_conversation_messages
        ALTER COLUMN blocks
        TYPE json
        USING blocks::json
        """
    )
    op.execute(
        """
        ALTER TABLE ai_workflow_memory
        ALTER COLUMN missing_fields
        TYPE json
        USING missing_fields::json
        """
    )
    op.execute(
        """
        ALTER TABLE ai_workflow_memory
        ALTER COLUMN extracted_entities
        TYPE json
        USING extracted_entities::json
        """
    )
