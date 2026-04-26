from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field

from conversational_engine.contracts.common import ContractModel


class ImageAttachment(ContractModel):
    data_url: str
    filename: str | None = None


class RunRequest(ContractModel):
    content: str
    conversation_id: UUID | None = None
    title: str | None = None
    attachments: list[ImageAttachment] = Field(default_factory=list)


class RunEvent(ContractModel):
    type: str
    run_id: UUID
    conversation_id: UUID
    workflow_id: UUID | None = None
    sequence: int
    payload: dict[str, object] = Field(default_factory=dict)


class RunSummary(ContractModel):
    id: UUID
    conversation_id: UUID
    workflow_id: UUID | None = None
    status: str
    user_message: str
    created_at: datetime
    updated_at: datetime


class RunTraceRecord(ContractModel):
    id: UUID
    run_id: UUID
    stage: str
    agent_role: str
    provider_name: str
    model_name: str
    payload: dict[str, object] = Field(default_factory=dict)
    redacted_payload: dict[str, object] = Field(default_factory=dict)
    created_at: datetime


class TrainingDatasetSummary(ContractModel):
    id: UUID
    name: str
    version: str
    status: str
    example_count: int = 0
    created_at: datetime
    updated_at: datetime
