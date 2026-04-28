from __future__ import annotations

from uuid import UUID

from conversational_engine.ai.redis_cache import RedisActiveStateCache
from conversational_engine.ai.repository import AIRepository
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import MessageRole, WorkflowState
from conversational_engine.orchestrator.service import OrchestratorOutcome


class ConversationOutcomeStore:
    def __init__(self, repository: AIRepository, redis_cache: RedisActiveStateCache) -> None:
        self._repository = repository
        self._redis_cache = redis_cache

    async def store(
        self,
        *,
        auth: AuthContext,
        conversation_id: UUID,
        workflow_id: UUID,
        raw_text: str | None,
        outcome: OrchestratorOutcome,
    ) -> None:
        await self._repository.append_message(
            tenant_id=auth.tenant_id,
            conversation_id=conversation_id,
            workflow_id=workflow_id,
            role=MessageRole.ASSISTANT,
            blocks=outcome.blocks,
            raw_text=raw_text,
        )
        await self._repository.save_workflow_state(
            auth.tenant_id,
            workflow_id,
            status=outcome.status,
            current_task=outcome.current_task,
            extracted_entities=outcome.extracted_entities,
            missing_fields=outcome.missing_fields,
            active_preview_id=outcome.active_preview_id,
            active_approval_id=outcome.active_approval_id,
        )
        workflow = await self._repository.find_workflow_by_id(auth.tenant_id, workflow_id)
        if workflow is not None:
            await self._redis_cache.set_workflow_state(auth.tenant_id, str(workflow_id), workflow)

    @staticmethod
    def sanitize_workflow(workflow: WorkflowState | None) -> WorkflowState | None:
        if workflow is None:
            return None
        extracted_entities = dict(workflow.extracted_entities or {})
        extracted_entities.pop('requesterAccessToken', None)
        return workflow.model_copy(update={'extracted_entities': extracted_entities})
