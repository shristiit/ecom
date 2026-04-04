from __future__ import annotations

from abc import ABC, abstractmethod

from conversational_engine.agents.types_agent import AgentTurnResult
from conversational_engine.schemas.auth_schemas import AuthContext
from conversational_engine.schemas.shared_schemas import ConversationDetail, WorkflowState


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
