from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(slots=True)
class ToolContext:
    access_token: str | None
    tenant_id: str | None
    user_id: str | None


class BackendTool(ABC):
    name: str

    @abstractmethod
    async def invoke(self, payload: dict[str, object], context: ToolContext) -> dict[str, object]:
        raise NotImplementedError
