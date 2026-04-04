from __future__ import annotations

from contextlib import contextmanager
from uuid import UUID, uuid4

from psycopg import Connection, connect
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from pydantic import TypeAdapter

from conversational_engine.schemas.shared_schemas import (
    ChatMessage,
    ConversationDetail,
    ConversationSummary,
    MessageBlock,
    MessageRole,
    PendingAction,
    PendingActionType,
    WorkflowState,
    WorkflowStatus,
)
from conversational_engine.utils.time import utc_now

MESSAGE_BLOCKS_ADAPTER = TypeAdapter(list[MessageBlock])


class EngineRepository:
    def __init__(self, database_url: str) -> None:
        self._database_url = database_url
        self._schema_ready = False

    @contextmanager
    def _connection(self) -> Connection:
        conn = connect(self._database_url, row_factory=dict_row)
        try:
            self._ensure_schema(conn)
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _ensure_schema(self, conn: Connection) -> None:
        if self._schema_ready:
            return

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

        self._schema_ready = True

    def list_conversations(self, tenant_id: str) -> list[ConversationSummary]:
        with self._connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  c.id,
                  c.title,
                  c.created_at,
                  c.updated_at,
                  m.blocks AS last_blocks,
                  m.role AS last_role
                FROM ai_conversations c
                LEFT JOIN LATERAL (
                  SELECT role, blocks
                  FROM ai_conversation_messages
                  WHERE tenant_id = %s AND conversation_id = c.id
                  ORDER BY created_at DESC
                  LIMIT 1
                ) m ON TRUE
                WHERE c.tenant_id = %s
                ORDER BY c.updated_at DESC
                """,
                (tenant_id, tenant_id),
            )
            rows = cur.fetchall()

        return [
            ConversationSummary(
                id=row['id'],
                title=row['title'],
                created_at=row['created_at'],
                updated_at=row['updated_at'],
                last_message_preview=self._preview_text(row.get('last_blocks') or []),
                last_role=row.get('last_role'),
            )
            for row in rows
        ]

    def create_conversation(
        self,
        tenant_id: str,
        created_by: str,
        title: str,
    ) -> tuple[ConversationDetail, WorkflowState]:
        conversation_id = uuid4()
        workflow_id = uuid4()
        memory_id = uuid4()

        with self._connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ai_conversations (id, tenant_id, created_by, title)
                VALUES (%s, %s, %s, %s)
                RETURNING id, title, created_at, updated_at
                """,
                (conversation_id, tenant_id, created_by, title),
            )
            conversation = cur.fetchone()
            cur.execute(
                """
                INSERT INTO ai_workflows (id, tenant_id, conversation_id, status, current_task)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, status, current_task, active_preview_id, active_approval_id
                """,
                (workflow_id, tenant_id, conversation_id, WorkflowStatus.IDLE.value, 'conversation_bootstrap'),
            )
            workflow = cur.fetchone()
            cur.execute(
                """
                INSERT INTO ai_workflow_memory (id, tenant_id, workflow_id, current_task)
                VALUES (%s, %s, %s, %s)
                """,
                (memory_id, tenant_id, workflow_id, 'conversation_bootstrap'),
            )

        return (
            ConversationDetail(
                id=conversation['id'],
                title=conversation['title'],
                created_at=conversation['created_at'],
                updated_at=conversation['updated_at'],
            ),
            WorkflowState(
                id=workflow['id'],
                status=workflow['status'],
                current_task=workflow['current_task'],
                active_preview_id=workflow['active_preview_id'],
                active_approval_id=workflow['active_approval_id'],
            ),
        )

    def append_message(
        self,
        tenant_id: str,
        conversation_id: UUID,
        workflow_id: UUID | None,
        role: MessageRole,
        blocks: list[MessageBlock],
        raw_text: str | None = None,
    ) -> ChatMessage:
        message_id = uuid4()
        now = utc_now()

        with self._connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ai_conversation_messages (
                  id,
                  tenant_id,
                  conversation_id,
                  workflow_id,
                  role,
                  blocks,
                  raw_text,
                  created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, role, blocks, created_at
                """,
                (
                    message_id,
                    tenant_id,
                    conversation_id,
                    workflow_id,
                    role.value,
                    Jsonb([block.model_dump(by_alias=True, mode='json') for block in blocks]),
                    raw_text,
                    now,
                ),
            )
            row = cur.fetchone()
            cur.execute(
                'UPDATE ai_conversations SET updated_at = %s WHERE tenant_id = %s AND id = %s',
                (now, tenant_id, conversation_id),
            )

        return self._message_from_row(row)

    def get_conversation(
        self,
        tenant_id: str,
        conversation_id: UUID,
    ) -> tuple[ConversationDetail, WorkflowState | None, list[ChatMessage]] | None:
        with self._connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, title, created_at, updated_at
                FROM ai_conversations
                WHERE tenant_id = %s AND id = %s
                """,
                (tenant_id, conversation_id),
            )
            conversation = cur.fetchone()
            if conversation is None:
                return None

            cur.execute(
                """
                SELECT
                  w.id,
                  w.status,
                  COALESCE(m.current_task, w.current_task) AS current_task,
                  COALESCE(m.extracted_entities::jsonb, '{}'::jsonb) AS extracted_entities,
                  COALESCE(m.missing_fields::jsonb, '[]'::jsonb) AS missing_fields,
                  w.active_preview_id,
                  w.active_approval_id
                FROM ai_workflows w
                LEFT JOIN ai_workflow_memory m
                  ON m.workflow_id = w.id AND m.tenant_id = w.tenant_id
                WHERE w.tenant_id = %s AND w.conversation_id = %s
                ORDER BY w.created_at DESC
                LIMIT 1
                """,
                (tenant_id, conversation_id),
            )
            workflow = cur.fetchone()

            cur.execute(
                """
                SELECT id, role, blocks, created_at
                FROM ai_conversation_messages
                WHERE tenant_id = %s AND conversation_id = %s
                ORDER BY created_at ASC
                """,
                (tenant_id, conversation_id),
            )
            messages = cur.fetchall()

        workflow_state = None
        if workflow is not None:
            workflow_state = WorkflowState(
                id=workflow['id'],
                status=workflow['status'],
                current_task=workflow['current_task'],
                extracted_entities=workflow['extracted_entities'] or {},
                missing_fields=workflow['missing_fields'] or [],
                active_preview_id=workflow['active_preview_id'],
                active_approval_id=workflow['active_approval_id'],
            )

        return (
            ConversationDetail(
                id=conversation['id'],
                title=conversation['title'],
                created_at=conversation['created_at'],
                updated_at=conversation['updated_at'],
            ),
            workflow_state,
            [self._message_from_row(row) for row in messages],
        )

    def find_workflow_by_id(self, tenant_id: str, workflow_id: UUID) -> WorkflowState | None:
        with self._connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  w.id,
                  w.status,
                  COALESCE(m.current_task, w.current_task) AS current_task,
                  COALESCE(m.extracted_entities::jsonb, '{}'::jsonb) AS extracted_entities,
                  COALESCE(m.missing_fields::jsonb, '[]'::jsonb) AS missing_fields,
                  w.active_preview_id,
                  w.active_approval_id
                FROM ai_workflows w
                LEFT JOIN ai_workflow_memory m
                  ON m.workflow_id = w.id AND m.tenant_id = w.tenant_id
                WHERE w.tenant_id = %s AND w.id = %s
                """,
                (tenant_id, workflow_id),
            )
            workflow = cur.fetchone()

        if workflow is None:
            return None

        return WorkflowState(
            id=workflow['id'],
            status=workflow['status'],
            current_task=workflow['current_task'],
            extracted_entities=workflow['extracted_entities'] or {},
            missing_fields=workflow['missing_fields'] or [],
            active_preview_id=workflow['active_preview_id'],
            active_approval_id=workflow['active_approval_id'],
        )

    def get_conversation_by_workflow_id(
        self,
        tenant_id: str,
        workflow_id: UUID,
    ) -> tuple[ConversationDetail, WorkflowState] | None:
        with self._connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  c.id AS conversation_id,
                  c.title,
                  c.created_at,
                  c.updated_at,
                  w.id,
                  w.status,
                  COALESCE(m.current_task, w.current_task) AS current_task,
                  COALESCE(m.extracted_entities::jsonb, '{}'::jsonb) AS extracted_entities,
                  COALESCE(m.missing_fields::jsonb, '[]'::jsonb) AS missing_fields,
                  w.active_preview_id,
                  w.active_approval_id
                FROM ai_workflows w
                JOIN ai_conversations c ON c.id = w.conversation_id
                LEFT JOIN ai_workflow_memory m
                  ON m.workflow_id = w.id AND m.tenant_id = w.tenant_id
                WHERE w.tenant_id = %s AND w.id = %s
                LIMIT 1
                """,
                (tenant_id, workflow_id),
            )
            row = cur.fetchone()

        if row is None:
            return None

        return (
            ConversationDetail(
                id=row['conversation_id'],
                title=row['title'],
                created_at=row['created_at'],
                updated_at=row['updated_at'],
            ),
            WorkflowState(
                id=row['id'],
                status=row['status'],
                current_task=row['current_task'],
                extracted_entities=row['extracted_entities'] or {},
                missing_fields=row['missing_fields'] or [],
                active_preview_id=row['active_preview_id'],
                active_approval_id=row['active_approval_id'],
            ),
        )

    def update_workflow_status(
        self,
        tenant_id: str,
        workflow_id: UUID,
        status: WorkflowStatus,
        current_task: str | None = None,
    ) -> None:
        with self._connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                UPDATE ai_workflows
                SET status = %s, current_task = COALESCE(%s, current_task), updated_at = now()
                WHERE tenant_id = %s AND id = %s
                """,
                (status.value, current_task, tenant_id, workflow_id),
            )
            cur.execute(
                """
                UPDATE ai_workflow_memory
                SET current_task = COALESCE(%s, current_task), updated_at = now()
                WHERE tenant_id = %s AND workflow_id = %s
                """,
                (current_task, tenant_id, workflow_id),
            )

    def save_workflow_state(
        self,
        tenant_id: str,
        workflow_id: UUID,
        *,
        status: WorkflowStatus,
        current_task: str | None = None,
        extracted_entities: dict[str, object] | None = None,
        missing_fields: list[str] | None = None,
        active_preview_id: UUID | None = None,
        active_approval_id: UUID | None = None,
    ) -> None:
        with self._connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                UPDATE ai_workflows
                SET
                  status = %s,
                  current_task = %s,
                  active_preview_id = %s,
                  active_approval_id = %s,
                  updated_at = now()
                WHERE tenant_id = %s AND id = %s
                """,
                (
                    status.value,
                    current_task,
                    active_preview_id,
                    active_approval_id,
                    tenant_id,
                    workflow_id,
                ),
            )
            cur.execute(
                """
                UPDATE ai_workflow_memory
                SET
                  current_task = %s,
                  extracted_entities = %s,
                  missing_fields = %s,
                  updated_at = now()
                WHERE tenant_id = %s AND workflow_id = %s
                """,
                (
                    current_task,
                    Jsonb(extracted_entities or {}),
                    Jsonb(missing_fields or []),
                    tenant_id,
                    workflow_id,
                ),
            )

    def find_workflow_by_approval_id(self, tenant_id: str, approval_id: str) -> WorkflowState | None:
        with self._connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  w.id,
                  w.status,
                  COALESCE(m.current_task, w.current_task) AS current_task,
                  COALESCE(m.extracted_entities::jsonb, '{}'::jsonb) AS extracted_entities,
                  COALESCE(m.missing_fields::jsonb, '[]'::jsonb) AS missing_fields,
                  w.active_preview_id,
                  w.active_approval_id
                FROM ai_workflows w
                LEFT JOIN ai_workflow_memory m
                  ON m.workflow_id = w.id AND m.tenant_id = w.tenant_id
                WHERE w.tenant_id = %s AND w.active_approval_id::text = %s
                LIMIT 1
                """,
                (tenant_id, approval_id),
            )
            workflow = cur.fetchone()

        if workflow is None:
            return None

        return WorkflowState(
            id=workflow['id'],
            status=workflow['status'],
            current_task=workflow['current_task'],
            extracted_entities=workflow['extracted_entities'] or {},
            missing_fields=workflow['missing_fields'] or [],
            active_preview_id=workflow['active_preview_id'],
            active_approval_id=workflow['active_approval_id'],
        )

    @staticmethod
    def build_pending_action(workflow: WorkflowState | None) -> PendingAction | None:
        if workflow is None:
            return None
        pending_actions = workflow.extracted_entities.get('_pendingActions')
        pending_prompt = workflow.extracted_entities.get('_pendingPrompt')
        if isinstance(pending_actions, list) and pending_prompt:
            actions = []
            for action in pending_actions:
                try:
                    actions.append(PendingActionType(action))
                except ValueError:
                    continue
            if actions:
                return PendingAction(
                    workflow_id=workflow.id,
                    actions=actions,
                    prompt=str(pending_prompt),
                )
        if workflow.status == WorkflowStatus.AWAITING_CONFIRMATION:
            return PendingAction(
                workflow_id=workflow.id,
                actions=[
                    PendingActionType.CONFIRM,
                    PendingActionType.CANCEL,
                    PendingActionType.EDIT,
                    PendingActionType.SUBMIT_FOR_APPROVAL,
                ],
                prompt='Review the preview and confirm or cancel.',
            )
        if workflow.status == WorkflowStatus.AWAITING_APPROVAL:
            return PendingAction(
                workflow_id=workflow.id,
                actions=[PendingActionType.CANCEL],
                prompt='This workflow is waiting on approval handling.',
            )
        return None

    @staticmethod
    def _preview_text(blocks: list[dict[str, object]]) -> str | None:
        for block in blocks:
            if isinstance(block, dict):
                if isinstance(block.get('content'), str):
                    return block['content']
                if isinstance(block.get('message'), str):
                    return block['message']
                if isinstance(block.get('prompt'), str):
                    return block['prompt']
        return None

    @staticmethod
    def _message_from_row(row: dict[str, object]) -> ChatMessage:
        return ChatMessage.model_validate(
            {
                'id': row['id'],
                'role': row['role'],
                'blocks': MESSAGE_BLOCKS_ADAPTER.validate_python(row['blocks']),
                'createdAt': row['created_at'],
            }
        )
