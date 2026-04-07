from __future__ import annotations

from collections.abc import Callable
import json
from typing import Any

from conversational_engine.providers.router import ProviderRouter, ProviderTrace
from conversational_engine.providers.runtime import ProviderMessage

EXECUTOR_SCHEMA = {
    'type': 'object',
    'additionalProperties': False,
    'properties': {
        'action': {'type': 'string', 'enum': ['tool', 'respond', 'clarify']},
        'assistantMessage': {'type': ['string', 'null']},
        'toolName': {'type': ['string', 'null']},
        'toolArgumentsJson': {'type': ['string', 'null']},
        'requiredInputs': {'type': 'array', 'items': {'type': 'string'}},
    },
    'required': ['action', 'assistantMessage', 'toolName', 'toolArgumentsJson', 'requiredInputs'],
}


class ExecutorAgent:
    def __init__(self, router: ProviderRouter) -> None:
        self._router = router

    async def propose(
        self,
        *,
        user_message: str,
        plan: dict[str, Any],
        tools: list[dict[str, Any]],
        history: list[dict[str, Any]],
        trace_callback: Callable[[str, ProviderTrace], None] | None = None,
    ) -> dict[str, Any]:
        response = await self._router.complete_json(
            role='executor',
            messages=[
                ProviderMessage(
                    role='system',
                    content=(
                        'You are the execution agent for an internal inventory AI runtime. '
                        'If a tool is needed, select exactly one tool from the catalog '
                        'and provide arguments that match its schema. '
                        'When action is "tool", return toolArgumentsJson as a JSON object string only.'
                    ),
                ),
                ProviderMessage(
                    role='user',
                    content=(
                        f'User message:\n{user_message}\n\n'
                        f'Planner decision:\n{plan}\n\n'
                        f'Available tools:\n{tools}\n\n'
                        f'Prior tool history:\n{history}'
                    ),
                ),
            ],
            json_schema=EXECUTOR_SCHEMA,
            max_tokens=700,
            trace_callback=trace_callback,
        )
        parsed = response.parsed or {}
        if 'toolArgumentsJson' in parsed and 'toolArguments' not in parsed:
            raw_arguments = parsed.get('toolArgumentsJson')
            if raw_arguments is None:
                parsed['toolArguments'] = None
            elif isinstance(raw_arguments, str):
                parsed['toolArguments'] = json.loads(raw_arguments)
            else:
                raise RuntimeError('Executor returned a non-string toolArgumentsJson payload')
        parsed.pop('toolArgumentsJson', None)
        return parsed
