from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class ProviderMessage:
    role: str
    content: str
    image_data_urls: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class ProviderResponse:
    provider_name: str
    model_name: str
    content: str
    parsed: dict[str, Any] | None = None
    raw_payload: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ProviderCandidate:
    provider_name: str
    model_name: str


@dataclass(frozen=True, slots=True)
class RoleRoute:
    planner: list[ProviderCandidate]
    executor: list[ProviderCandidate]
    reviewer: list[ProviderCandidate]
    narrator: list[ProviderCandidate]


class RuntimeProvider(ABC):
    name: str

    @abstractmethod
    async def complete_text(
        self,
        *,
        model: str,
        messages: list[ProviderMessage],
        max_tokens: int = 600,
    ) -> ProviderResponse:
        raise NotImplementedError

    @abstractmethod
    async def complete_json(
        self,
        *,
        model: str,
        messages: list[ProviderMessage],
        json_schema: dict[str, Any],
        max_tokens: int = 600,
    ) -> ProviderResponse:
        raise NotImplementedError
