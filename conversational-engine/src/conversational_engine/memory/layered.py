from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from conversational_engine.contracts.auth import AuthContext
from conversational_engine.db.repository import EngineRepository


@dataclass(frozen=True, slots=True)
class LayeredContext:
    session_memory: dict[str, Any]
    workflow_memory: dict[str, Any]
    tenant_memory: list[dict[str, Any]]
    recent_messages: list[dict[str, Any]]


class LayeredMemoryService:
    def __init__(self, repository: EngineRepository) -> None:
        self._repository = repository

    def build(
        self,
        *,
        auth: AuthContext,
        workflow_id: str,
        conversation_id: str,
        recent_messages: list[dict[str, Any]],
        extracted_entities: dict[str, Any],
    ) -> LayeredContext:
        return LayeredContext(
            session_memory={
                'tenantId': auth.tenant_id,
                'userId': auth.id,
                'email': auth.email,
                'permissions': auth.permissions,
            },
            workflow_memory={
                'workflowId': workflow_id,
                'conversationId': conversation_id,
                'extractedEntities': extracted_entities,
            },
            tenant_memory=self._repository.list_recent_trace_examples(auth.tenant_id, limit=6),
            recent_messages=recent_messages[-8:],
        )
