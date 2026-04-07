from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class ProviderMessage:
    role: str
    content: str


@dataclass(slots=True)
class ClassificationResult:
    intent: str
    confidence: float


class ChatProvider(ABC):
    @abstractmethod
    async def complete_text(self, *, model: str, messages: list[ProviderMessage]) -> str:
        raise NotImplementedError

    @abstractmethod
    async def complete_json(
        self,
        *,
        model: str,
        messages: list[ProviderMessage],
        json_schema: dict[str, Any],
        max_tokens: int = 400,
    ) -> dict[str, Any]:
        raise NotImplementedError


class EmbeddingsProvider(ABC):
    @abstractmethod
    async def embed(self, *, model: str, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError


class IntentClassifier(ABC):
    @abstractmethod
    async def classify(self, *, model: str, text: str, intents: list[str]) -> ClassificationResult:
        raise NotImplementedError
