from __future__ import annotations

from collections.abc import Callable
from typing import Any

from conversational_engine.providers.router import ProviderRouter, ProviderTrace
from conversational_engine.providers.runtime import ProviderMessage

NARRATOR_SCHEMA = {
    'type': 'object',
    'additionalProperties': False,
    'properties': {
        'message': {'type': 'string'},
    },
    'required': ['message'],
}


class NarratorAgent:
    def __init__(self, router: ProviderRouter) -> None:
        self._router = router

    async def write_message(
        self,
        *,
        user_message: str,
        directive: str,
        supporting_context: dict[str, Any],
        trace_callback: Callable[[str, ProviderTrace], None] | None = None,
    ) -> str:
        response = await self._router.complete_json(
            role='narrator',
            messages=[
                ProviderMessage(
                    role='system',
                    content=(
                        'You are the user-facing response writer for an internal inventory AI runtime. '
                        'Write natural, direct assistant messages for the user. '
                        'Do not expose internal planning language, reasoning labels, or agent roles.'
                    ),
                ),
                ProviderMessage(
                    role='user',
                    content=(
                        f'Original user message:\n{user_message}\n\n'
                        f'Directive for what to communicate:\n{directive}\n\n'
                        f'Supporting context:\n{supporting_context}'
                    ),
                ),
            ],
            json_schema=NARRATOR_SCHEMA,
            max_tokens=300,
            trace_callback=trace_callback,
        )
        message = response.parsed.get('message') if response.parsed else None
        if not isinstance(message, str) or not message.strip():
            return directive
        return message.strip()
