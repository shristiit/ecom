from __future__ import annotations

from contextlib import contextmanager
from uuid import UUID, uuid4

from psycopg import Connection, connect
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from conversational_engine.contracts.common import (
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
from conversational_engine.db.mappers import (
    conversation_detail_from_row,
    message_from_row,
    preview_text,
    workflow_state_from_row,
)
from conversational_engine.db.runs import (
    append_run_event as insert_run_event,
    create_run as insert_run,
    create_training_dataset as insert_training_dataset,
    finish_run as update_run_status,
    list_recent_trace_examples as fetch_recent_trace_examples,
    record_trace as insert_trace,
)
from conversational_engine.db.schema import ensure_engine_schema
from conversational_engine.utils.time import utc_now


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
        ensure_engine_schema(conn)
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
                last_message_preview=preview_text(row.get('last_blocks') or []),
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
            conversation_detail_from_row(conversation),
            workflow_state_from_row(workflow),
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

        return message_from_row(row)

    def list_message_dicts(self, tenant_id: str, conversation_id: UUID) -> list[dict[str, object]]:
        with self._connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, role, blocks, created_at
                FROM ai_conversation_messages
                WHERE tenant_id = %s AND conversation_id = %s
                ORDER BY created_at ASC
                """,
                (tenant_id, conversation_id),
            )
            rows = cur.fetchall()

        messages = [message_from_row(row) for row in rows]
        return [message.model_dump(by_alias=True, mode='json') for message in messages]

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
            workflow_state = workflow_state_from_row(workflow)

        return (
            conversation_detail_from_row(conversation),
            workflow_state,
            [message_from_row(row) for row in messages],
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

        return workflow_state_from_row(workflow)

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
            conversation_detail_from_row(row, id_field='conversation_id'),
            workflow_state_from_row(row),
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

        return workflow_state_from_row(workflow)

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
        return None

    def create_run(self, *, tenant_id: str, conversation_id: UUID, workflow_id: UUID | None, user_message: str):
        with self._connection() as conn:
            return insert_run(
                conn,
                tenant_id=tenant_id,
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                user_message=user_message,
            )

    def finish_run(
        self,
        *,
        tenant_id: str,
        run_id: UUID,
        status: str,
        error_message: str | None = None,
    ) -> None:
        with self._connection() as conn:
            update_run_status(
                conn,
                tenant_id=tenant_id,
                run_id=run_id,
                status=status,
                error_message=error_message,
            )

    def append_run_event(self, *, tenant_id: str, run_id: UUID, conversation_id: UUID, workflow_id: UUID | None, sequence: int, event_type: str, payload: dict[str, object]):
        with self._connection() as conn:
            return insert_run_event(
                conn,
                tenant_id=tenant_id,
                run_id=run_id,
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                sequence=sequence,
                event_type=event_type,
                payload=payload,
            )

    def record_trace(self, *, tenant_id: str, run_id: UUID, agent_role: str, provider_name: str, model_name: str, stage: str, payload: dict[str, object], redacted_payload: dict[str, object]):
        with self._connection() as conn:
            return insert_trace(
                conn,
                tenant_id=tenant_id,
                run_id=run_id,
                agent_role=agent_role,
                provider_name=provider_name,
                model_name=model_name,
                stage=stage,
                payload=payload,
                redacted_payload=redacted_payload,
            )

    def list_recent_trace_examples(self, tenant_id: str, *, limit: int) -> list[dict[str, object]]:
        with self._connection() as conn:
            return fetch_recent_trace_examples(conn, tenant_id, limit=limit)

    def create_training_dataset(
        self,
        *,
        tenant_id: str,
        name: str,
        version: str,
        status: str,
    ) -> dict[str, object]:
        with self._connection() as conn:
            return insert_training_dataset(
                conn,
                tenant_id=tenant_id,
                name=name,
                version=version,
                status=status,
            )
