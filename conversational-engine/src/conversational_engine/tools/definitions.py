from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

ToolExecutor = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]


@dataclass(frozen=True, slots=True)
class SemanticTool:
    name: str
    description: str
    input_schema: dict[str, Any]
    risk_level: str
    side_effect: bool
    output_mode: str
    executor: ToolExecutor
