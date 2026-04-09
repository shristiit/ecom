from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID


@dataclass(slots=True)
class EventEnvelope:
    type: str
    run_id: UUID
    conversation_id: UUID
    workflow_id: UUID | None
    sequence: int
    payload: dict[str, Any] = field(default_factory=dict)
