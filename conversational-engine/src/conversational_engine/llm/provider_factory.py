from __future__ import annotations

from dataclasses import dataclass

from conversational_engine.config.settings import Settings
from conversational_engine.llm.provider_interfaces import ChatProvider, EmbeddingsProvider, IntentClassifier
from conversational_engine.llm.openai_compatible_model import (
    OpenAICompatibleChatProvider,
    OpenAICompatibleEmbeddingsProvider,
    OpenAICompatibleIntentClassifier,
)


@dataclass(frozen=True, slots=True)
class Providers:
    chat: ChatProvider | None
    embeddings: EmbeddingsProvider | None
    classifier: IntentClassifier | None


def build_providers(settings: Settings) -> Providers:
    api_key = settings.llm_api_key or settings.openai_api_key
    if not api_key:
        return Providers(chat=None, embeddings=None, classifier=None)

    chat = OpenAICompatibleChatProvider(base_url=settings.llm_base_url, api_key=api_key)
    embeddings = OpenAICompatibleEmbeddingsProvider(base_url=settings.llm_base_url, api_key=api_key)
    classifier = OpenAICompatibleIntentClassifier(chat_provider=chat)
    return Providers(chat=chat, embeddings=embeddings, classifier=classifier)

