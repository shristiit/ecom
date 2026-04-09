from __future__ import annotations

from collections.abc import Callable
from typing import Any

from conversational_engine.providers.router import ProviderRouter, ProviderTrace
from conversational_engine.providers.runtime import ProviderMessage

REVIEWER_SCHEMA = {
    'type': 'object',
    'additionalProperties': False,
    'properties': {
        'action': {'type': 'string', 'enum': ['complete', 'continue', 'clarify']},
        'assistantMessage': {'type': 'string'},
        'feedback': {'type': ['string', 'null']},
        'requiredInputs': {'type': 'array', 'items': {'type': 'string'}},
    },
    'required': ['action', 'assistantMessage', 'feedback', 'requiredInputs'],
}


class ReviewerAgent:
    def __init__(self, router: ProviderRouter) -> None:
        self._router = router

    async def review(
        self,
        *,
        user_message: str,
        plan: dict[str, Any],
        proposal: dict[str, Any],
        tool_result: dict[str, Any],
        history: list[dict[str, Any]],
        trace_callback: Callable[[str, ProviderTrace], None] | None = None,
    ) -> dict[str, Any]:
        response = await self._router.complete_json(
            role='reviewer',
            messages=[
                ProviderMessage(
                    role='system',
                    content=(
                        'You are the reviewer agent for an internal inventory AI runtime. '
                        'Check whether the tool result satisfies the user goal, whether another tool step is needed, '
                        'or whether the user must clarify something.'
                    ),
                ),
                ProviderMessage(
                    role='user',
                    content=(
                        f'User message:\n{user_message}\n\n'
                        f'Planner decision:\n{plan}\n\n'
                        f'Executor proposal:\n{proposal}\n\n'
                        f'Tool result:\n{tool_result}\n\n'
                        f'History:\n{history}'
                    ),
                ),
            ],
            json_schema=REVIEWER_SCHEMA,
            max_tokens=600,
            trace_callback=trace_callback,
        )
        return response.parsed or {}
