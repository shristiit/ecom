from __future__ import annotations

from collections.abc import Callable
from typing import Any

from conversational_engine.providers.router import ProviderRouter, ProviderTrace
from conversational_engine.providers.runtime import ProviderMessage

PLANNER_SCHEMA = {
    'type': 'object',
    'additionalProperties': False,
    'properties': {
        'goal': {'type': 'string'},
        'action': {'type': 'string', 'enum': ['tool', 'clarify', 'respond']},
        'reasoning': {'type': 'string'},
        'clarificationQuestion': {'type': ['string', 'null']},
        'requiredInputs': {'type': 'array', 'items': {'type': 'string'}},
        'toolObjective': {'type': ['string', 'null']},
    },
    'required': ['goal', 'action', 'reasoning', 'clarificationQuestion', 'requiredInputs', 'toolObjective'],
}


class PlannerAgent:
    def __init__(self, router: ProviderRouter) -> None:
        self._router = router

    async def plan(
        self,
        *,
        user_message: str,
        memory: dict[str, Any],
        tools: list[dict[str, Any]],
        history: list[dict[str, Any]],
        image_data_urls: tuple[str, ...] = (),
        trace_callback: Callable[[str, ProviderTrace], None] | None = None,
    ) -> dict[str, Any]:
        image_note = '\n\nAttached images: the user has provided image(s) above — describe what you observe and use that as context.' if image_data_urls else ''
        response = await self._router.complete_json(
            role='planner',
            messages=[
                ProviderMessage(
                    role='system',
                    content=(
                        'You are the planning agent for an internal inventory AI runtime. '
                        'Own semantic routing, clarification, and tool strategy. '
                        'Never invent tool names outside the provided catalog.'
                    ),
                ),
                ProviderMessage(
                    role='user',
                    content=(
                        f'User message:\n{user_message}\n\n'
                        f'Memory:\n{memory}\n\n'
                        f'Available tools:\n{tools}\n\n'
                        f'Prior tool history:\n{history}'
                        f'{image_note}'
                    ),
                    image_data_urls=image_data_urls,
                ),
            ],
            json_schema=PLANNER_SCHEMA,
            max_tokens=500,
            trace_callback=trace_callback,
        )
        return response.parsed or {}
