from __future__ import annotations

from uuid import UUID

from pydantic import Field

from conversational_engine.contracts.common import (
    AttachmentMetadata,
    ChatMessage,
    ContractModel,
    ConversationDetail,
    ConversationSummary,
    PendingAction,
    WorkflowState,
)


class HealthResponse(ContractModel):
    status: str
    service: str
    environment: str
    feature_enabled: bool


class ConversationListResponse(ContractModel):
    items: list[ConversationSummary] = Field(default_factory=list)


class ConversationResponse(ContractModel):
    conversation: ConversationDetail
    workflow: WorkflowState | None = None
    messages: list[ChatMessage] = Field(default_factory=list)
    pending_action: PendingAction | None = None
    message_page: 'MessagePageInfo | None' = None


class CreateConversationRequest(ContractModel):
    title: str | None = None
    initial_message: str | None = None
    attachment_ids: list[str] = Field(default_factory=list)


class SendMessageRequest(ContractModel):
    content: str
    attachment_ids: list[str] = Field(default_factory=list)


class MessagePageInfo(ContractModel):
    next_cursor_created_at: str | None = None
    next_cursor_id: str | None = None
    has_more: bool = False


class WorkflowDecisionRequest(ContractModel):
    decision: str
    note: str | None = None


class WorkflowDecisionResponse(ContractModel):
    workflow_id: UUID
    accepted: bool
    message: str


class ApprovalItem(ContractModel):
    id: UUID
    status: str
    transaction_spec_id: UUID
    requested_by: str
    approved_by: str | None = None
    created_at: str
    intent: str | None = None
    confidence: float | None = None
    conversation_id: UUID | None = None
    workflow_id: UUID | None = None
    summary: str | None = None
    reason: str | None = None


class HistoryItem(ContractModel):
    id: UUID
    transaction_id: str
    request_text: str
    why: str | None = None
    created_at: str
    movement_type: str | None = None
    quantity: int | None = None
    recorded_time: str | None = None
    source: str | None = None
    requested_by: str | None = None
    approved_by: str | None = None
    executed_by: str | None = None
    tool_name: str | None = None
    status: str | None = None


class ApprovalDecisionRequest(ContractModel):
    approve: bool


class ApprovalDecisionResponse(ContractModel):
    status: str


class AttachmentUploadResponse(ContractModel):
    attachment: AttachmentMetadata


class GovernanceEvaluationResponse(ContractModel):
    requires_approval: bool
    reason: str | None = None


class ApprovalRequestStatus(ContractModel):
    id: UUID
    status: str
    conversation_id: UUID | None = None
    workflow_id: UUID | None = None
    action_type: str
    tool_name: str
    summary: str | None = None
    reason: str | None = None
    preview: dict[str, object] = Field(default_factory=dict)
    execution_payload: dict[str, object] = Field(default_factory=dict)
    result: dict[str, object] = Field(default_factory=dict)
    requested_by: str
    approved_by: str | None = None
    created_at: str
    updated_at: str
