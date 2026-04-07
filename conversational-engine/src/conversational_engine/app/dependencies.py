from functools import lru_cache

from conversational_engine.agents.entity_resolver import EntityResolver
from conversational_engine.agents.help import HelpAgent
from conversational_engine.agents.inventory import InventoryAgent
from conversational_engine.agents.products import ProductsAgent
from conversational_engine.agents.purchasing import PurchasingAgent
from conversational_engine.agents.registry import AgentRegistry
from conversational_engine.agents.reporting import ReportingAgent
from conversational_engine.agents.sales import SalesAgent
from conversational_engine.clients.backend import BackendClient
from conversational_engine.config.model_routing import ModelRouting
from conversational_engine.config.settings import get_settings
from conversational_engine.conversations.service import ConversationService
from conversational_engine.db.repository import EngineRepository
from conversational_engine.orchestrator.service import OrchestratorService
from conversational_engine.providers.factory import build_providers
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
    providers = build_providers(settings)
    routing = ModelRouting.from_settings(settings)
    backend = get_backend_client()
    resolver = EntityResolver(backend)
    registry = AgentRegistry(
        [
            InventoryAgent(backend=backend, resolver=resolver, chat_provider=providers.chat, routing=routing),
            ProductsAgent(backend=backend, resolver=resolver, chat_provider=providers.chat, routing=routing),
            PurchasingAgent(backend=backend, resolver=resolver, chat_provider=providers.chat, routing=routing),
            SalesAgent(backend=backend, resolver=resolver, chat_provider=providers.chat, routing=routing),
            ReportingAgent(backend=backend, resolver=resolver, chat_provider=providers.chat, routing=routing),
            HelpAgent(retrieval=get_retrieval_service(), chat_provider=providers.chat, routing=routing),
        ]
    )
    return OrchestratorService(
        backend_client=backend,
        retrieval_service=get_retrieval_service(),
        agent_registry=registry,
        model_routing=routing,
        intent_classifier=providers.classifier,
        mutations_enabled=settings.mutations_enabled,
        retrieval_enabled=settings.retrieval_enabled,
    )


def get_app_settings():
    return get_settings()
