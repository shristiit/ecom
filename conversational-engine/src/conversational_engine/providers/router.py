from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from conversational_engine.providers.runtime import (
    ProviderCandidate,
    ProviderMessage,
    ProviderResponse,
    RoleRoute,
    RuntimeProvider,
)


class ProviderExhaustedError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class ProviderAttempt:
    provider_name: str
    model_name: str
    error: str


@dataclass(frozen=True, slots=True)
class ProviderTrace:
    response: ProviderResponse | None
    attempts: list[ProviderAttempt]


class ProviderRouter:
    def __init__(
        self,
        *,
        providers: dict[str, RuntimeProvider],
        route: RoleRoute,
        trace_callback: Callable[[str, ProviderTrace], None] | None = None,
    ) -> None:
        self._providers = providers
        self._route = route
        self._trace_callback = trace_callback

    async def complete_json(
        self,
        *,
        role: str,
        messages: list[ProviderMessage],
        json_schema: dict[str, Any],
        max_tokens: int = 600,
        trace_callback: Callable[[str, ProviderTrace], None] | None = None,
    ) -> ProviderResponse:
        return await self._complete(
            role=role,
            trace_callback=trace_callback,
            call=lambda provider, candidate: provider.complete_json(
                model=candidate.model_name,
                messages=messages,
                json_schema=json_schema,
                max_tokens=max_tokens,
            ),
        )

    async def complete_text(
        self,
        *,
        role: str,
        messages: list[ProviderMessage],
        max_tokens: int = 600,
        trace_callback: Callable[[str, ProviderTrace], None] | None = None,
    ) -> ProviderResponse:
        return await self._complete(
            role=role,
            trace_callback=trace_callback,
            call=lambda provider, candidate: provider.complete_text(
                model=candidate.model_name,
                messages=messages,
                max_tokens=max_tokens,
            ),
        )

    async def _complete(
        self,
        *,
        role: str,
        call: Callable[[RuntimeProvider, ProviderCandidate], Any],
        trace_callback: Callable[[str, ProviderTrace], None] | None,
    ) -> ProviderResponse:
        candidates = self._candidates_for_role(role)
        attempts: list[ProviderAttempt] = []

        for candidate in candidates:
            provider = self._providers.get(candidate.provider_name)
            if provider is None:
                attempts.append(
                    ProviderAttempt(
                        provider_name=candidate.provider_name,
                        model_name=candidate.model_name,
                        error='provider_not_configured',
                    )
                )
                continue
            try:
                response = await call(provider, candidate)
                self._record_trace(role, ProviderTrace(response=response, attempts=attempts), trace_callback)
                return response
            except Exception as exc:
                attempts.append(
                    ProviderAttempt(
                        provider_name=candidate.provider_name,
                        model_name=candidate.model_name,
                        error=str(exc),
                    )
                )

        self._record_trace(role, ProviderTrace(response=None, attempts=attempts), trace_callback)
        raise ProviderExhaustedError(f'All providers failed for role {role}')

    def _record_trace(
        self,
        role: str,
        trace: ProviderTrace,
        trace_callback: Callable[[str, ProviderTrace], None] | None,
    ) -> None:
        if trace_callback:
            trace_callback(role, trace)
        if self._trace_callback:
            self._trace_callback(role, trace)

    def _candidates_for_role(self, role: str) -> list[ProviderCandidate]:
        if role == 'planner':
            return self._route.planner
        if role == 'executor':
            return self._route.executor
        if role == 'reviewer':
            return self._route.reviewer
        if role == 'narrator':
            return self._route.narrator
        raise ValueError(f'Unsupported provider role: {role}')
