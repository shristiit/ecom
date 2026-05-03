from __future__ import annotations

from conversational_engine.ai.repository import AIRepository


class AuditService:
    def __init__(self, repository: AIRepository) -> None:
        self._repository = repository

    async def record(
        self,
        *,
        tenant_id: str,
        user_id: str | None,
        actor_email: str | None,
        event_type: str,
        conversation_id: str | None = None,
        workflow_id: str | None = None,
        approval_id: str | None = None,
        tool_name: str | None = None,
        payload: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return await self._repository.record_audit_event(
            tenant_id=tenant_id,
            user_id=user_id,
            actor_email=actor_email,
            event_type=event_type,
            conversation_id=conversation_id,
            workflow_id=workflow_id,
            approval_id=approval_id,
            tool_name=tool_name,
            payload=payload or {},
        )

    async def list_recent_events(
        self,
        *,
        tenant_id: str,
        limit: int = 50,
        conversation_id: str | None = None,
        workflow_id: str | None = None,
    ) -> list[dict[str, object]]:
        return await self._repository.list_audit_events(
            tenant_id=tenant_id,
            limit=limit,
            conversation_id=conversation_id,
            workflow_id=workflow_id,
        )
