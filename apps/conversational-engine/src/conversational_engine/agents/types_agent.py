from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from conversational_engine.schemas.shared_schemas import MessageBlock

NextAction = Literal['ask_follow_up', 'return_read_result', 'prepare_preview']


@dataclass(slots=True)
class AgentTurnResult:
    next_action: NextAction
    memory_updates: dict[str, object] = field(default_factory=dict)
    missing_fields: list[str] = field(default_factory=list)
    follow_up_prompt: str | None = None
    blocks: list[MessageBlock] = field(default_factory=list)

