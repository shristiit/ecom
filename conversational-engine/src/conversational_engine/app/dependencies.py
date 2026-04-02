from functools import lru_cache

from conversational_engine.clients.backend import BackendClient
from conversational_engine.config.settings import get_settings
from conversational_engine.conversations.service import ConversationService
from conversational_engine.db.repository import EngineRepository
from conversational_engine.orchestrator.service import OrchestratorService
from conversational_engine.retrieval.service import RetrievalService


@lru_cache(maxsize=1)
def get_conversation_service() -> ConversationService:
    return ConversationService(
        repository=get_engine_repository(),
        backend_client=get_backend_client(),
        orchestrator=get_orchestrator_service(),
    )


@lru_cache(maxsize=1)
def get_engine_repository() -> EngineRepository:
    settings = get_settings()
    return EngineRepository(settings.database_url)


@lru_cache(maxsize=1)
def get_backend_client() -> BackendClient:
    settings = get_settings()
    return BackendClient(settings.backend_base_url)


@lru_cache(maxsize=1)
def get_retrieval_service() -> RetrievalService:
    settings = get_settings()
    return RetrievalService(settings.database_url)


@lru_cache(maxsize=1)
def get_orchestrator_service() -> OrchestratorService:
    settings = get_settings()
    return OrchestratorService(
        backend_client=get_backend_client(),
        retrieval_service=get_retrieval_service(),
        mutations_enabled=settings.mutations_enabled,
        retrieval_enabled=settings.retrieval_enabled,
    )


def get_app_settings():
    return get_settings()
