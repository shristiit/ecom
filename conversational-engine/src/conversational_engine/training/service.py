from __future__ import annotations

from uuid import UUID

from conversational_engine.ai.repository import AIRepository
from conversational_engine.training.redaction import redact_payload


class TrainingDataService:
    def __init__(self, repository: AIRepository) -> None:
        self._repository = repository

    def redact_trace(self, payload: dict[str, object]) -> dict[str, object]:
        redacted = redact_payload(payload)
        return redacted if isinstance(redacted, dict) else {}

    async def record_trace(
        self,
        *,
        tenant_id: str,
        run_id: UUID,
        conversation_id: UUID | None,
        workflow_id: UUID | None,
        agent_role: str,
        provider_name: str,
        model_name: str,
        stage: str,
        payload: dict[str, object],
    ) -> None:
        await self._repository.record_trace(
            tenant_id=tenant_id,
            run_id=run_id,
            conversation_id=conversation_id,
            workflow_id=workflow_id,
            agent_role=agent_role,
            provider_name=provider_name,
            model_name=model_name,
            stage=stage,
            payload=payload,
            redacted_payload=self.redact_trace(payload),
        )

    async def create_dataset(
        self,
        *,
        tenant_id: str,
        name: str,
        version: str,
        status: str = 'draft',
    ) -> dict[str, object]:
        return await self._repository.create_training_dataset(
            tenant_id=tenant_id,
            name=name,
            version=version,
            status=status,
        )
