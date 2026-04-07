from __future__ import annotations

from abc import ABC, abstractmethod

from conversational_engine.agents.types import AgentTurnResult
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import ConversationDetail, WorkflowState


class Agent(ABC):
    name: str

    @abstractmethod
    def can_handle(self, intent: str) -> bool:
        raise NotImplementedError

    @abstractmethod
    async def handle_turn(
        self,
        *,
        auth: AuthContext,
        conversation: ConversationDetail,
        workflow: WorkflowState,
        intent: str,
        user_message: str,
        memory: dict[str, object],
    ) -> AgentTurnResult:
        raise NotImplementedError
