from __future__ import annotations

import logging
from typing import Any

import httpx

from conversational_engine.ai.repository import AIRepository
from conversational_engine.config.settings import Settings

logger = logging.getLogger(__name__)


class SemanticMemoryService:
    def __init__(self, repository: AIRepository, settings: Settings) -> None:
        self._repository = repository
        self._settings = settings

    async def index_message_summary(
        self,
        *,
        tenant_id: str,
        conversation_id: str,
        user_id: str,
        content: str,
        metadata: dict[str, object] | None = None,
    ) -> None:
        await self._index_document(
            tenant_id=tenant_id,
            payload={
                'userId': user_id,
                'conversationId': conversation_id,
                'memoryType': 'summary',
                'content': content,
                'metadata': metadata or {},
            },
        )

    async def index_entity_memory(self, *, tenant_id: str, payload: dict[str, object]) -> None:
        await self._index_document(
            tenant_id=tenant_id,
            payload={
                'userId': payload.get('userId'),
                'conversationId': payload.get('conversationId'),
                'memoryType': 'entity',
                'content': str(payload.get('label') or ''),
                'metadata': payload,
            },
        )

    async def index_business_memory(self, *, tenant_id: str, payload: dict[str, object]) -> None:
        await self._index_document(
            tenant_id=tenant_id,
            payload={
                'memoryType': 'business_memory',
                'content': str(payload.get('key') or ''),
                'metadata': payload,
            },
        )

    async def search_relevant_memory(
        self,
        *,
        tenant_id: str,
        query_text: str,
        user_id: str | None,
        conversation_id: str | None,
        limit: int = 6,
    ) -> list[dict[str, object]]:
        embedding = await self._generate_embedding(query_text)
        if embedding is None:
            return []
        return await self._repository.search_semantic_memory(
            tenant_id=tenant_id,
            query_embedding=embedding,
            user_id=user_id,
            conversation_id=conversation_id,
            limit=limit,
        )

    async def _index_document(self, *, tenant_id: str, payload: dict[str, object]) -> None:
        if not self._settings.ai_vector_search_enabled:
            return
        content = str(payload.get('content') or '').strip()
        if not content:
            return
        embedding = await self._generate_embedding(content)
        if embedding is None:
            return
        try:
            await self._repository.upsert_semantic_memory(
                tenant_id=tenant_id,
                payload={**payload, 'embedding': embedding},
            )
        except Exception:  # pragma: no cover - depends on backing store
            logger.exception('Failed to index semantic memory')

    async def _generate_embedding(self, text: str) -> list[float] | None:
        if not self._settings.ai_vector_search_enabled or not self._settings.llm_api_key:
            return None
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    f'{self._settings.llm_base_url.rstrip("/")}/embeddings',
                    headers={
                        'Authorization': f'Bearer {self._settings.llm_api_key}',
                        'Content-Type': 'application/json',
                    },
                    json={'model': self._settings.embeddings_model, 'input': text},
                )
                response.raise_for_status()
            payload = response.json()
            data = payload.get('data') or []
            if not data:
                return None
            embedding = data[0].get('embedding')
            if not isinstance(embedding, list):
                return None
            return [float(value) for value in embedding]
        except Exception:  # pragma: no cover - external API failure path
            logger.exception('Embedding generation failed')
            return None
