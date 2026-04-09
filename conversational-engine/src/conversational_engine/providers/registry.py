from __future__ import annotations

from conversational_engine.config.settings import Settings
from conversational_engine.providers.gemini_runtime import GeminiRuntimeProvider
from conversational_engine.providers.openai_runtime import OpenAICompatibleRuntimeProvider
from conversational_engine.providers.runtime import ProviderCandidate, RoleRoute, RuntimeProvider


def _parse_chain(raw: str) -> list[str]:
    return [item.strip().lower() for item in raw.split(',') if item.strip()]


def _candidates(chain: list[str], models: dict[str, str]) -> list[ProviderCandidate]:
    items: list[ProviderCandidate] = []
    for provider_name in chain:
        model_name = models.get(provider_name)
        if model_name:
            items.append(ProviderCandidate(provider_name=provider_name, model_name=model_name))
    return items


def build_runtime_providers(settings: Settings) -> dict[str, RuntimeProvider]:
    providers: dict[str, RuntimeProvider] = {}
    openai_api_key = settings.llm_api_key or settings.openai_api_key

    if openai_api_key:
        providers['openai'] = OpenAICompatibleRuntimeProvider(
            name='openai',
            base_url=settings.llm_base_url,
            api_key=openai_api_key,
        )
    if settings.gemini_api_key:
        providers['gemini'] = GeminiRuntimeProvider(
            base_url=settings.gemini_base_url,
            api_key=settings.gemini_api_key,
        )
    if settings.deepseek_api_key:
        providers['deepseek'] = OpenAICompatibleRuntimeProvider(
            name='deepseek',
            base_url=settings.deepseek_base_url,
            api_key=settings.deepseek_api_key,
        )

    return providers


def build_role_route(settings: Settings) -> RoleRoute:
    planner_models = {
        'openai': settings.openai_planner_model,
        'gemini': settings.gemini_planner_model,
        'deepseek': settings.deepseek_planner_model,
    }
    executor_models = {
        'openai': settings.openai_executor_model,
        'gemini': settings.gemini_executor_model,
        'deepseek': settings.deepseek_executor_model,
    }
    reviewer_models = {
        'openai': settings.openai_reviewer_model,
        'gemini': settings.gemini_reviewer_model,
        'deepseek': settings.deepseek_reviewer_model,
    }
    narrator_models = {
        'openai': settings.openai_narrator_model,
        'gemini': settings.gemini_narrator_model,
        'deepseek': settings.deepseek_narrator_model,
    }

    return RoleRoute(
        planner=_candidates(_parse_chain(settings.planner_provider_chain), planner_models),
        executor=_candidates(_parse_chain(settings.executor_provider_chain), executor_models),
        reviewer=_candidates(_parse_chain(settings.reviewer_provider_chain), reviewer_models),
        narrator=_candidates(_parse_chain(settings.narrator_provider_chain), narrator_models),
    )
