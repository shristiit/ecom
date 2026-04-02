from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


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
    async def complete(self, messages: list[ProviderMessage]) -> str:
        raise NotImplementedError


class EmbeddingsProvider(ABC):
    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError


class IntentClassifier(ABC):
    @abstractmethod
    async def classify(self, text: str) -> ClassificationResult:
        raise NotImplementedError
