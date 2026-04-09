from conversational_engine.config.settings import Settings
from conversational_engine.providers.registry import build_runtime_providers


def test_runtime_registry_uses_llm_api_key_for_openai_provider():
    settings = Settings(
        CONVERSATIONAL_ENGINE_LLM_API_KEY='test-openai-key',
        CONVERSATIONAL_ENGINE_LLM_BASE_URL='https://api.openai.com/v1',
        CONVERSATIONAL_ENGINE_DATABASE_URL='postgres://user:pass@localhost:5432/stockaisle',
        CONVERSATIONAL_ENGINE_BACKEND_BASE_URL='http://localhost:4000/api',
    )

    providers = build_runtime_providers(settings)

    assert 'openai' in providers
