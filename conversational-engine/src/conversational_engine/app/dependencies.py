from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from fastapi import Request

from conversational_engine.ai import (
    MongoAIRepository,
    RedisActiveStateCache,
    S3AttachmentService,
    SemanticMemoryService,
    TenantAISettingsService,
)
from conversational_engine.agents.executor import ExecutorAgent
from conversational_engine.agents.narrator import NarratorAgent
from conversational_engine.agents.planner import PlannerAgent
from conversational_engine.agents.reviewer import ReviewerAgent
from conversational_engine.agents.state_updater import StateUpdateAgent
from conversational_engine.audit.service import AuditService
from conversational_engine.clients.backend import BackendClient
from conversational_engine.config.settings import Settings, get_settings
from conversational_engine.conversations.service import ConversationService
from conversational_engine.memory.layered import LayeredMemoryService
from conversational_engine.providers.registry import build_role_route, build_runtime_providers
from conversational_engine.providers.router import ProviderRouter
from conversational_engine.retrieval.service import RetrievalService
from conversational_engine.runtime.service import AgentRuntimeService
from conversational_engine.training.service import TrainingDataService


@dataclass(slots=True)
class AppServices:
    settings: Settings
    backend_client: BackendClient
    repository: MongoAIRepository
    redis_cache: RedisActiveStateCache
    audit_service: AuditService
    attachment_service: S3AttachmentService
    semantic_memory_service: SemanticMemoryService
    tenant_settings_service: TenantAISettingsService
    retrieval_service: RetrievalService
    runtime_service: AgentRuntimeService
    conversation_service: ConversationService


def build_app_services(*, settings: Settings, mongo_client, redis_client, s3_client) -> AppServices:
    backend_client = BackendClient(
        settings.backend_base_url,
        max_connections=settings.backend_http_max_connections,
        max_keepalive_connections=settings.backend_http_max_keepalive_connections,
        retry_attempts=settings.backend_http_retry_attempts,
    )
    repository = MongoAIRepository(mongo_client, settings)
    redis_cache = RedisActiveStateCache(redis_client)
    audit_service = AuditService(repository)
    semantic_memory_service = SemanticMemoryService(repository, settings)
    attachment_service = S3AttachmentService(repository, settings, s3_client)
    retrieval_service = RetrievalService(repository)
    router = ProviderRouter(
        providers=build_runtime_providers(settings),
        route=build_role_route(settings),
    )
    runtime_service = AgentRuntimeService(
        backend_client=backend_client,
        planner=PlannerAgent(router),
        executor=ExecutorAgent(router),
        reviewer=ReviewerAgent(router),
        state_updater=StateUpdateAgent(router),
        narrator=NarratorAgent(router),
        audit_service=audit_service,
        memory_service=LayeredMemoryService(
            repository=repository,
            settings=settings,
            semantic_memory_service=semantic_memory_service,
        ),
        training_data_service=TrainingDataService(repository),
        retrieval_service=retrieval_service,
    )
    return AppServices(
        settings=settings,
        backend_client=backend_client,
        repository=repository,
        redis_cache=redis_cache,
        audit_service=audit_service,
        attachment_service=attachment_service,
        semantic_memory_service=semantic_memory_service,
        tenant_settings_service=TenantAISettingsService(repository),
        retrieval_service=retrieval_service,
        runtime_service=runtime_service,
        conversation_service=ConversationService(
            repository=repository,
            backend_client=backend_client,
            runtime_service=runtime_service,
            audit_service=audit_service,
            attachment_service=attachment_service,
            redis_cache=redis_cache,
            settings=settings,
        ),
    )


def _require_services(request: Request) -> AppServices:
    services = getattr(request.app.state, 'services', None)
    if services is None:  # pragma: no cover - startup wiring failure
        raise RuntimeError('Application services are not initialized')
    return services


async def get_conversation_service(request: Request) -> ConversationService:
    services = _require_services(request)
    await services.repository.ensure_indexes()
    return services.conversation_service


@lru_cache(maxsize=1)
def get_backend_client() -> BackendClient:
    settings = get_settings()
    return BackendClient(
        settings.backend_base_url,
        max_connections=settings.backend_http_max_connections,
        max_keepalive_connections=settings.backend_http_max_keepalive_connections,
        retry_attempts=settings.backend_http_retry_attempts,
    )


async def get_retrieval_service(request: Request) -> RetrievalService:
    services = _require_services(request)
    await services.repository.ensure_indexes()
    return services.retrieval_service


async def get_agent_runtime_service(request: Request) -> AgentRuntimeService:
    services = _require_services(request)
    await services.repository.ensure_indexes()
    return services.runtime_service


async def get_attachment_service(request: Request) -> S3AttachmentService:
    services = _require_services(request)
    await services.repository.ensure_indexes()
    return services.attachment_service


def get_app_settings() -> Settings:
    return get_settings()
