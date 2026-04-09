from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from conversational_engine.contracts.common import MessageBlock, WorkflowStatus


@dataclass(slots=True)
class RuntimeOutcome:
    blocks: list[MessageBlock]
    status: WorkflowStatus
    current_task: str
    extracted_entities: dict[str, object] = field(default_factory=dict)
    missing_fields: list[str] = field(default_factory=list)
    active_preview_id: UUID | None = None
    active_approval_id: UUID | None = None
