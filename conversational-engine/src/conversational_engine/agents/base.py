from __future__ import annotations

from abc import ABC, abstractmethod

from conversational_engine.contracts.common import WorkflowState


class Agent(ABC):
    name: str

    @abstractmethod
    def can_handle(self, intent: str) -> bool:
        raise NotImplementedError

    @abstractmethod
    async def handle(self, user_message: str, workflow: WorkflowState | None) -> str:
        raise NotImplementedError
