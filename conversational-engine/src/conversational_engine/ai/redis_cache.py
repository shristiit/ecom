from __future__ import annotations

import json
import logging
from typing import Any

from conversational_engine.contracts.common import WorkflowState

logger = logging.getLogger(__name__)


class RedisActiveStateCache:
    def __init__(self, client) -> None:
        self._client = client

    @property
    def enabled(self) -> bool:
        return self._client is not None

    async def get_workflow_state(self, tenant_id: str, workflow_id: str) -> WorkflowState | None:
        payload = await self._get_json(self._workflow_state_key(tenant_id, workflow_id))
        if payload is None:
            return None
        return WorkflowState.model_validate(payload)

    async def set_workflow_state(
        self,
        tenant_id: str,
        workflow_id: str,
        state: WorkflowState,
        ttl_seconds: int = 24 * 60 * 60,
    ) -> None:
        await self._set_json(self._workflow_state_key(tenant_id, workflow_id), state.model_dump(by_alias=True, mode='json'), ttl_seconds)

    async def delete_workflow_state(self, tenant_id: str, workflow_id: str) -> None:
        await self._delete(self._workflow_state_key(tenant_id, workflow_id))

    async def acquire_lock(self, tenant_id: str, workflow_id: str, ttl_seconds: int = 60) -> bool:
        if not self._client:
            return True
        try:
            return bool(
                await self._client.set(
                    self._lock_key(tenant_id, workflow_id),
                    '1',
                    ex=ttl_seconds,
                    nx=True,
                )
            )
        except Exception:
            logger.exception('Redis lock acquire failed')
            return True

    async def release_lock(self, tenant_id: str, workflow_id: str) -> None:
        await self._delete(self._lock_key(tenant_id, workflow_id))

    async def get_stream_state(self, tenant_id: str, run_id: str) -> dict[str, Any] | None:
        return await self._get_json(self._stream_key(tenant_id, run_id))

    async def set_stream_state(
        self,
        tenant_id: str,
        run_id: str,
        payload: dict[str, Any],
        ttl_seconds: int = 60 * 60,
    ) -> None:
        await self._set_json(self._stream_key(tenant_id, run_id), payload, ttl_seconds)

    async def _get_json(self, key: str) -> dict[str, Any] | None:
        if not self._client:
            return None
        try:
            payload = await self._client.get(key)
        except Exception:
            logger.exception('Redis get failed')
            return None
        if payload is None:
            return None
        try:
            if isinstance(payload, bytes):
                payload = payload.decode('utf-8')
            return json.loads(payload)
        except Exception:
            logger.exception('Redis payload decode failed')
            return None

    async def _set_json(self, key: str, payload: dict[str, Any], ttl_seconds: int) -> None:
        if not self._client:
            return
        try:
            await self._client.set(key, json.dumps(payload), ex=ttl_seconds)
        except Exception:
            logger.exception('Redis set failed')

    async def _delete(self, key: str) -> None:
        if not self._client:
            return
        try:
            await self._client.delete(key)
        except Exception:
            logger.exception('Redis delete failed')

    @staticmethod
    def _workflow_state_key(tenant_id: str, workflow_id: str) -> str:
        return f'ai:{tenant_id}:workflow:{workflow_id}:state'

    @staticmethod
    def _stream_key(tenant_id: str, run_id: str) -> str:
        return f'ai:{tenant_id}:run:{run_id}:stream'

    @staticmethod
    def _lock_key(tenant_id: str, workflow_id: str) -> str:
        return f'ai:{tenant_id}:lock:{workflow_id}'
