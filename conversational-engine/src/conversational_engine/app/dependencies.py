from functools import lru_cache

from conversational_engine.agents.executor import ExecutorAgent
from conversational_engine.agents.narrator import NarratorAgent
from conversational_engine.agents.planner import PlannerAgent
from conversational_engine.agents.reviewer import ReviewerAgent
from conversational_engine.agents.state_updater import StateUpdateAgent
from conversational_engine.clients.backend import BackendClient
from conversational_engine.config.settings import get_settings
from conversational_engine.conversations.service import ConversationService
from conversational_engine.db.repository import EngineRepository
from conversational_engine.memory.layered import LayeredMemoryService
from conversational_engine.providers.registry import build_role_route, build_runtime_providers
from conversational_engine.providers.router import ProviderRouter
from conversational_engine.retrieval.service import RetrievalService
from conversational_engine.runtime.service import AgentRuntimeService
from conversational_engine.training.service import TrainingDataService


@lru_cache(maxsize=1)
def get_conversation_service() -> ConversationService:
    return ConversationService(
        repository=get_engine_repository(),
        backend_client=get_backend_client(),
        runtime_service=get_agent_runtime_service(),
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
def get_agent_runtime_service() -> AgentRuntimeService:
    settings = get_settings()
    router = ProviderRouter(
        providers=build_runtime_providers(settings),
        route=build_role_route(settings),
    )
    repository = get_engine_repository()
    return AgentRuntimeService(
        backend_client=get_backend_client(),
        planner=PlannerAgent(router),
        executor=ExecutorAgent(router),
        reviewer=ReviewerAgent(router),
        state_updater=StateUpdateAgent(router),
        narrator=NarratorAgent(router),
        memory_service=LayeredMemoryService(repository),
        training_data_service=TrainingDataService(repository),
        retrieval_service=get_retrieval_service(),
    )


def get_app_settings():
    return get_settings()
