from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from conversational_engine.ai.repository import AIRepository
from conversational_engine.ai.semantic_memory import SemanticMemoryService
from conversational_engine.config.settings import Settings
from conversational_engine.contracts.auth import AuthContext


@dataclass(frozen=True, slots=True)
class LayeredContext:
    session_memory: dict[str, Any]
    workflow_memory: dict[str, Any]
    recent_messages: list[dict[str, Any]]
    latest_summary: dict[str, Any] | None
    recent_entities: list[dict[str, Any]]
    business_memory: list[dict[str, Any]]
    user_memory: list[dict[str, Any]]
    semantic_memory: list[dict[str, Any]]


class LayeredMemoryService:
    def __init__(
        self,
        repository: AIRepository,
        settings: Settings,
        semantic_memory_service: SemanticMemoryService,
    ) -> None:
        self._repository = repository
        self._settings = settings
        self._semantic_memory_service = semantic_memory_service

    async def build(
        self,
        *,
        auth: AuthContext,
        workflow_id: str,
        conversation_id: str,
        workflow_status: str | None,
        current_task: str | None,
        recent_messages: list[dict[str, Any]],
        extracted_entities: dict[str, Any],
        missing_fields: list[str] | None = None,
    ) -> LayeredContext:
        latest_summary = await self._repository.get_latest_conversation_summary(auth.tenant_id, conversation_id)
        recent_entities = await self._repository.list_recent_entity_memory(
            auth.tenant_id,
            conversation_id=conversation_id,
            user_id=auth.id,
            limit=10,
        )
        business_memory = await self._repository.list_business_memory(auth.tenant_id, limit=10)
        user_memory = await self._repository.list_user_memory(auth.tenant_id, auth.id, limit=10)
        semantic_memory = await self._semantic_memory_service.search_relevant_memory(
            tenant_id=auth.tenant_id,
            query_text=self._query_text(recent_messages, extracted_entities),
            user_id=auth.id,
            conversation_id=conversation_id,
            limit=6,
        )
        bounded_messages = recent_messages[-self._settings.chat_recent_message_limit :]
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
                'status': workflow_status,
                'currentTask': current_task,
                'extractedEntities': extracted_entities,
                'missingFields': missing_fields or [],
            },
            recent_messages=bounded_messages,
            latest_summary=latest_summary,
            recent_entities=recent_entities,
            business_memory=business_memory,
            user_memory=user_memory,
            semantic_memory=semantic_memory,
        )

    @staticmethod
    def _query_text(recent_messages: list[dict[str, Any]], extracted_entities: dict[str, Any]) -> str:
        for message in reversed(recent_messages):
            blocks = message.get('blocks')
            if not isinstance(blocks, list):
                continue
            for block in blocks:
                if isinstance(block, dict) and isinstance(block.get('content'), str):
                    return block['content']
        return ' '.join(f'{key}:{value}' for key, value in extracted_entities.items())
