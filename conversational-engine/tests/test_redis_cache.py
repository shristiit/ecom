from conversational_engine.ai.redis_cache import RedisActiveStateCache
from conversational_engine.contracts.common import WorkflowState, WorkflowStatus


async def _build_state() -> WorkflowState:
    return WorkflowState(
        id='4cc3575b-845a-470c-b7b8-b79f8ee76d83',
        status=WorkflowStatus.IDLE,
        current_task='conversation_bootstrap',
        extracted_entities={},
        missing_fields=[],
    )


def test_redis_cache_disabled_falls_back_cleanly():
    async def run():
        cache = RedisActiveStateCache(None)
        state = await _build_state()

        assert cache.enabled is False
        assert await cache.get_workflow_state('tenant-1', 'workflow-1') is None
        await cache.set_workflow_state('tenant-1', 'workflow-1', state)
        assert await cache.get_stream_state('tenant-1', 'run-1') is None
        assert await cache.acquire_lock('tenant-1', 'workflow-1') is True

    import asyncio

    asyncio.run(run())
