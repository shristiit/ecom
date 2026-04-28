from __future__ import annotations

from conversational_engine.ai.repository import AIRepository


class TenantAISettingsService:
    def __init__(self, repository: AIRepository) -> None:
        self._repository = repository

    async def get_tenant_ai_settings(self, tenant_id: str) -> dict[str, object]:
        return await self._repository.get_tenant_ai_settings(tenant_id)

    async def upsert_tenant_ai_settings(self, tenant_id: str, payload: dict[str, object]) -> dict[str, object]:
        return await self._repository.upsert_tenant_ai_settings(tenant_id, payload)
