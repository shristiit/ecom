from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from conversational_engine.utils.casing import to_camel


class ContractModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
    )


class MessageRole(StrEnum):
    USER = 'user'
    ASSISTANT = 'assistant'
    SYSTEM = 'system'


class WorkflowStatus(StrEnum):
    IDLE = 'idle'
    NEEDS_INPUT = 'needs_input'
    PREVIEW_READY = 'preview_ready'
    AWAITING_CONFIRMATION = 'awaiting_confirmation'
    AWAITING_APPROVAL = 'awaiting_approval'
    COMPLETED = 'completed'
    FAILED = 'failed'


class PendingActionType(StrEnum):
    CONFIRM = 'confirm'
    CANCEL = 'cancel'
    EDIT = 'edit'
    SUBMIT_FOR_APPROVAL = 'submit_for_approval'


class BlockType(StrEnum):
    TEXT = 'text'
    CLARIFICATION = 'clarification'
    PREVIEW = 'preview'
    CONFIRMATION_REQUIRED = 'confirmation_required'
    APPROVAL_PENDING = 'approval_pending'
    APPROVAL_RESULT = 'approval_result'
    SUCCESS = 'success'
    ERROR = 'error'
    NAVIGATION = 'navigation'
    TABLE_RESULT = 'table_result'


class PreviewEntity(ContractModel):
    label: str
    value: str


class TableColumn(ContractModel):
    key: str
    label: str


class TextBlock(ContractModel):
    type: Literal[BlockType.TEXT] = BlockType.TEXT
    content: str


class ClarificationBlock(ContractModel):
    type: Literal[BlockType.CLARIFICATION] = BlockType.CLARIFICATION
    prompt: str
    required_fields: list[str] = Field(default_factory=list)


class PreviewBlock(ContractModel):
    type: Literal[BlockType.PREVIEW] = BlockType.PREVIEW
    action_type: str
    actor: str
    entities: list[PreviewEntity] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    approval_required: bool = False
    next_step: str


class ConfirmationRequiredBlock(ContractModel):
    type: Literal[BlockType.CONFIRMATION_REQUIRED] = BlockType.CONFIRMATION_REQUIRED
    prompt: str
    allowed_actions: list[PendingActionType] = Field(default_factory=list)


class ApprovalPendingBlock(ContractModel):
    type: Literal[BlockType.APPROVAL_PENDING] = BlockType.APPROVAL_PENDING
    approval_id: UUID
    status: str
    message: str


class ApprovalResultBlock(ContractModel):
    type: Literal[BlockType.APPROVAL_RESULT] = BlockType.APPROVAL_RESULT
    approval_id: UUID
    status: str
    message: str


class SuccessBlock(ContractModel):
    type: Literal[BlockType.SUCCESS] = BlockType.SUCCESS
    title: str
    message: str


class ErrorBlock(ContractModel):
    type: Literal[BlockType.ERROR] = BlockType.ERROR
    title: str
    message: str


class NavigationBlock(ContractModel):
    type: Literal[BlockType.NAVIGATION] = BlockType.NAVIGATION
    label: str
    href: str
    description: str


class TableResultBlock(ContractModel):
    type: Literal[BlockType.TABLE_RESULT] = BlockType.TABLE_RESULT
    title: str
    columns: list[TableColumn] = Field(default_factory=list)
    rows: list[dict[str, object]] = Field(default_factory=list)


MessageBlock = Annotated[
    TextBlock
    | ClarificationBlock
    | PreviewBlock
    | ConfirmationRequiredBlock
    | ApprovalPendingBlock
    | ApprovalResultBlock
    | SuccessBlock
    | ErrorBlock
    | NavigationBlock
    | TableResultBlock,
    Field(discriminator='type'),
]


class PendingAction(ContractModel):
    workflow_id: UUID
    actions: list[PendingActionType] = Field(default_factory=list)
    prompt: str


class ConversationSummary(ContractModel):
    id: UUID
    title: str
    created_at: datetime
    updated_at: datetime
    last_message_preview: str | None = None
    last_role: MessageRole | None = None


class ConversationDetail(ContractModel):
    id: UUID
    title: str
    created_at: datetime
    updated_at: datetime


class WorkflowState(ContractModel):
    id: UUID
    status: WorkflowStatus
    current_task: str | None = None
    extracted_entities: dict[str, object] = Field(default_factory=dict)
    missing_fields: list[str] = Field(default_factory=list)
    active_preview_id: UUID | None = None
    active_approval_id: UUID | None = None


class ChatMessage(ContractModel):
    id: UUID
    role: MessageRole
    blocks: list[MessageBlock] = Field(default_factory=list)
    created_at: datetime
