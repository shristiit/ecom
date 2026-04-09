from __future__ import annotations

from psycopg import Connection


def ensure_engine_schema(conn: Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_conversations (
              id uuid PRIMARY KEY,
              tenant_id uuid NOT NULL,
              created_by uuid,
              title text NOT NULL,
              status text NOT NULL DEFAULT 'active',
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now()
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_workflows (
              id uuid PRIMARY KEY,
              tenant_id uuid NOT NULL,
              conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
              status text NOT NULL,
              current_task text,
              active_preview_id uuid,
              active_approval_id uuid,
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now()
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_workflow_memory (
              id uuid PRIMARY KEY,
              tenant_id uuid NOT NULL,
              workflow_id uuid NOT NULL REFERENCES ai_workflows(id) ON DELETE CASCADE,
              current_task text,
              extracted_entities jsonb NOT NULL DEFAULT '{}'::jsonb,
              missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now()
            );
            """
        )
        cur.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS ix_ai_workflow_memory_tenant_workflow
            ON ai_workflow_memory (tenant_id, workflow_id);
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_conversation_messages (
              id uuid PRIMARY KEY,
              tenant_id uuid NOT NULL,
              conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
              workflow_id uuid REFERENCES ai_workflows(id) ON DELETE SET NULL,
              role text NOT NULL,
              blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
              raw_text text,
              created_at timestamptz NOT NULL DEFAULT now()
            );
            """
        )
        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_ai_conversations_tenant_updated
            ON ai_conversations (tenant_id, updated_at DESC);
            """
        )
        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_ai_messages_tenant_conversation
            ON ai_conversation_messages (tenant_id, conversation_id, created_at);
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_help_documents (
              id uuid PRIMARY KEY,
              tenant_id uuid,
              source_key text NOT NULL UNIQUE,
              title text NOT NULL,
              document_type text NOT NULL,
              status text NOT NULL DEFAULT 'active',
              metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now()
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_help_chunks (
              id uuid PRIMARY KEY,
              tenant_id uuid,
              document_id uuid NOT NULL REFERENCES ai_help_documents(id) ON DELETE CASCADE,
              chunk_index integer NOT NULL,
              content text NOT NULL,
              embedding jsonb,
              metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
              created_at timestamptz NOT NULL DEFAULT now()
            );
            """
        )
        cur.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS ix_ai_help_chunks_document_index
            ON ai_help_chunks (document_id, chunk_index);
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_runs (
              id uuid PRIMARY KEY,
              tenant_id uuid NOT NULL,
              conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
              workflow_id uuid REFERENCES ai_workflows(id) ON DELETE SET NULL,
              status text NOT NULL,
              user_message text NOT NULL,
              error_message text,
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now()
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_run_events (
              id uuid PRIMARY KEY,
              tenant_id uuid NOT NULL,
              run_id uuid NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
              conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
              workflow_id uuid REFERENCES ai_workflows(id) ON DELETE SET NULL,
              sequence integer NOT NULL,
              event_type text NOT NULL,
              payload jsonb NOT NULL DEFAULT '{}'::jsonb,
              created_at timestamptz NOT NULL DEFAULT now()
            );
            """
        )
        cur.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS ix_ai_run_events_run_sequence
            ON ai_run_events (run_id, sequence);
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_traces (
              id uuid PRIMARY KEY,
              tenant_id uuid NOT NULL,
              run_id uuid NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
              agent_role text NOT NULL,
              provider_name text NOT NULL,
              model_name text NOT NULL,
              stage text NOT NULL,
              payload jsonb NOT NULL DEFAULT '{}'::jsonb,
              redacted_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
              created_at timestamptz NOT NULL DEFAULT now()
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_training_datasets (
              id uuid PRIMARY KEY,
              tenant_id uuid NOT NULL,
              name text NOT NULL,
              version text NOT NULL,
              status text NOT NULL,
              example_count integer NOT NULL DEFAULT 0,
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now()
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_training_examples (
              id uuid PRIMARY KEY,
              tenant_id uuid NOT NULL,
              dataset_id uuid NOT NULL REFERENCES ai_training_datasets(id) ON DELETE CASCADE,
              trace_id uuid REFERENCES ai_traces(id) ON DELETE SET NULL,
              payload jsonb NOT NULL DEFAULT '{}'::jsonb,
              created_at timestamptz NOT NULL DEFAULT now()
            );
            """
        )
