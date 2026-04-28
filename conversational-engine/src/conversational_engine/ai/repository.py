from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import UUID

from conversational_engine.contracts.common import (
    ChatMessage,
    ConversationDetail,
    ConversationSummary,
    MessageAttachmentRef,
    MessageBlock,
    MessageRole,
    PendingAction,
    WorkflowState,
    WorkflowStatus,
)
from conversational_engine.contracts.runs import RunEvent, RunSummary, RunTraceRecord, TrainingDatasetSummary


@dataclass(slots=True)
class MessagePage:
    messages: list[ChatMessage]
    next_cursor_created_at: datetime | None = None
    next_cursor_id: str | None = None
    has_more: bool = False


@dataclass(slots=True)
class ConversationFetchResult:
    conversation: ConversationDetail
    workflow: WorkflowState | None
    page: MessagePage


class AIRepository(Protocol):
    async def ensure_indexes(self) -> None: ...

    async def list_conversations(self, tenant_id: str) -> list[ConversationSummary]: ...

    async def create_conversation(
        self,
        tenant_id: str,
        created_by: str,
        title: str,
    ) -> tuple[ConversationDetail, WorkflowState]: ...

    async def get_conversation(
        self,
        tenant_id: str,
        conversation_id: UUID,
        *,
        message_limit: int,
        before_created_at: datetime | None = None,
        before_id: str | None = None,
    ) -> ConversationFetchResult | None: ...

    async def update_conversation(
        self,
        tenant_id: str,
        conversation_id: UUID,
        *,
        title: str | None = None,
        status: str | None = None,
        archived_at: datetime | None = None,
    ) -> None: ...

    async def archive_conversation(self, tenant_id: str, conversation_id: UUID) -> None: ...

    async def delete_conversation_soft(self, tenant_id: str, conversation_id: UUID) -> None: ...

    async def append_message(
        self,
        tenant_id: str,
        conversation_id: UUID,
        workflow_id: UUID | None,
        role: MessageRole,
        blocks: list[MessageBlock],
        *,
        raw_text: str | None = None,
        attachments: list[MessageAttachmentRef] | None = None,
        run_id: UUID | None = None,
        metadata: dict[str, object] | None = None,
    ) -> ChatMessage: ...

    async def list_message_dicts(
        self,
        tenant_id: str,
        conversation_id: UUID,
        *,
        limit: int,
    ) -> list[dict[str, object]]: ...

    async def list_recent_messages(
        self,
        tenant_id: str,
        conversation_id: UUID,
        *,
        limit: int,
    ) -> list[ChatMessage]: ...

    async def get_message(self, tenant_id: str, conversation_id: UUID, message_id: str) -> ChatMessage | None: ...

    async def create_workflow(
        self,
        tenant_id: str,
        conversation_id: UUID,
        *,
        current_task: str,
    ) -> WorkflowState: ...

    async def find_workflow_by_id(self, tenant_id: str, workflow_id: UUID) -> WorkflowState | None: ...

    async def get_conversation_by_workflow_id(
        self,
        tenant_id: str,
        workflow_id: UUID,
    ) -> tuple[ConversationDetail, WorkflowState] | None: ...

    async def find_workflow_by_approval_id(self, tenant_id: str, approval_id: str) -> WorkflowState | None: ...

    async def save_workflow_state(
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
    ) -> None: ...

    async def update_workflow_status(
        self,
        tenant_id: str,
        workflow_id: UUID,
        status: WorkflowStatus,
        current_task: str | None = None,
    ) -> None: ...

    def build_pending_action(self, workflow: WorkflowState | None) -> PendingAction | None: ...

    async def create_run(
        self,
        *,
        tenant_id: str,
        conversation_id: UUID,
        workflow_id: UUID | None,
        user_message: str,
    ) -> RunSummary: ...

    async def finish_run(
        self,
        *,
        tenant_id: str,
        run_id: UUID,
        status: str,
        error_message: str | None = None,
    ) -> None: ...

    async def append_run_event(
        self,
        *,
        tenant_id: str,
        run_id: UUID,
        conversation_id: UUID,
        workflow_id: UUID | None,
        sequence: int,
        event_type: str,
        payload: dict[str, object],
    ) -> RunEvent: ...

    async def list_run_events(self, *, tenant_id: str, run_id: UUID) -> list[RunEvent]: ...

    async def record_trace(
        self,
        *,
        tenant_id: str,
        run_id: UUID,
        conversation_id: UUID | None,
        workflow_id: UUID | None,
        agent_role: str,
        provider_name: str,
        model_name: str,
        stage: str,
        payload: dict[str, object],
        redacted_payload: dict[str, object],
    ) -> RunTraceRecord: ...

    async def list_recent_trace_examples(self, tenant_id: str, *, limit: int) -> list[dict[str, object]]: ...

    async def create_training_dataset(
        self,
        *,
        tenant_id: str,
        name: str,
        version: str,
        status: str,
    ) -> dict[str, object]: ...

    async def add_training_example(
        self,
        *,
        tenant_id: str,
        dataset_id: str,
        trace_id: str | None,
        payload: dict[str, object],
        redacted_payload: dict[str, object],
        quality: str = 'unknown',
    ) -> dict[str, object]: ...

    async def record_entity_memory(self, *, tenant_id: str, payload: dict[str, object]) -> dict[str, object]: ...

    async def list_recent_entity_memory(
        self,
        tenant_id: str,
        *,
        conversation_id: str | None = None,
        user_id: str | None = None,
        limit: int,
    ) -> list[dict[str, object]]: ...

    async def upsert_business_memory(
        self,
        *,
        tenant_id: str,
        memory_type: str,
        key: str,
        value: dict[str, object],
        confidence: float,
        source: str,
        created_by: str | None = None,
    ) -> dict[str, object]: ...

    async def list_business_memory(self, tenant_id: str, *, limit: int) -> list[dict[str, object]]: ...

    async def upsert_user_memory(
        self,
        *,
        tenant_id: str,
        user_id: str,
        memory_type: str,
        key: str,
        value: dict[str, object],
        confidence: float,
        source: str,
    ) -> dict[str, object]: ...

    async def list_user_memory(self, tenant_id: str, user_id: str, *, limit: int) -> list[dict[str, object]]: ...

    async def append_conversation_summary(
        self,
        *,
        tenant_id: str,
        conversation_id: str,
        summary: str,
        entities: dict[str, object],
        summary_type: str,
        token_estimate: int | None = None,
    ) -> dict[str, object]: ...

    async def get_latest_conversation_summary(self, tenant_id: str, conversation_id: str) -> dict[str, object] | None: ...

    async def upsert_semantic_memory(self, *, tenant_id: str, payload: dict[str, object]) -> dict[str, object]: ...

    async def search_semantic_memory(
        self,
        *,
        tenant_id: str,
        query_embedding: list[float] | None,
        user_id: str | None = None,
        conversation_id: str | None = None,
        limit: int,
    ) -> list[dict[str, object]]: ...

    async def create_attachment_metadata(self, *, tenant_id: str, payload: dict[str, object]) -> dict[str, object]: ...

    async def update_attachment_status(
        self,
        *,
        tenant_id: str,
        attachment_id: str,
        status: str,
        metadata: dict[str, object] | None = None,
    ) -> dict[str, object] | None: ...

    async def get_attachment_metadata(
        self,
        *,
        tenant_id: str,
        attachment_id: str,
    ) -> dict[str, object] | None: ...

    async def list_attachments_by_ids(
        self,
        *,
        tenant_id: str,
        conversation_id: str,
        attachment_ids: list[str],
    ) -> list[dict[str, object]]: ...

    async def list_conversation_attachments(self, tenant_id: str, conversation_id: str) -> list[dict[str, object]]: ...

    async def get_tenant_ai_settings(self, tenant_id: str) -> dict[str, object]: ...

    async def upsert_tenant_ai_settings(self, tenant_id: str, payload: dict[str, object]) -> dict[str, object]: ...
