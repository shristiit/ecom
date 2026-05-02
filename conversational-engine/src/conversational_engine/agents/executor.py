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
        'toolArguments': {
            'type': ['object', 'null'],
            'additionalProperties': True,
        },
        'toolArgumentsJson': {'type': ['string', 'null']},
        'requiredInputs': {'type': 'array', 'items': {'type': 'string'}},
    },
    'required': ['action', 'assistantMessage', 'toolName', 'toolArguments', 'toolArgumentsJson', 'requiredInputs'],
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
                        'When action is "tool", prefer returning toolArguments as a JSON object. '
                        'Use toolArgumentsJson only as a fallback when nested objects cannot be emitted directly.'
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
        parsed = _normalize_executor_payload(parsed)
        return parsed


def _normalize_executor_payload(parsed: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(parsed)

    if not normalized.get('toolName'):
        fallback_tool_name = normalized.get('tool') or normalized.get('tool_name')
        if isinstance(fallback_tool_name, str) and fallback_tool_name.strip():
            normalized['toolName'] = fallback_tool_name

    parsed_tool_arguments = _parse_tool_arguments(normalized.get('toolArguments'))
    if parsed_tool_arguments is None:
        raw_arguments = (
            normalized.get('toolArgumentsJson')
            if 'toolArgumentsJson' in normalized
            else normalized.get('arguments') or normalized.get('parameters')
        )
        parsed_tool_arguments = _parse_tool_arguments(raw_arguments)
    normalized['toolArguments'] = parsed_tool_arguments

    normalized.pop('toolArgumentsJson', None)
    return normalized


def _parse_tool_arguments(raw_arguments: Any) -> dict[str, Any] | None:
    if raw_arguments is None:
        return None
    if isinstance(raw_arguments, dict):
        return raw_arguments
    if isinstance(raw_arguments, str):
        stripped = raw_arguments.strip()
        if not stripped:
            return None
        try:
            decoded = json.loads(stripped)
        except json.JSONDecodeError:
            decoded = _extract_json_object(stripped)
        if not isinstance(decoded, dict):
            raise RuntimeError('Executor returned a non-object tool argument payload')
        return decoded
    raise RuntimeError('Executor returned an unsupported tool argument payload')


def _extract_json_object(raw_arguments: str) -> dict[str, Any] | None:
    decoder = json.JSONDecoder()
    for start in (index for index, char in enumerate(raw_arguments) if char == '{'):
        try:
            decoded, _offset = decoder.raw_decode(raw_arguments[start:])
        except json.JSONDecodeError:
            continue
        if isinstance(decoded, dict):
            return decoded
    raise RuntimeError('Executor returned invalid toolArguments JSON')
