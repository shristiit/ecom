from __future__ import annotations

from collections.abc import Callable
import re
from typing import Any

from conversational_engine.providers.router import ProviderRouter, ProviderTrace
from conversational_engine.providers.runtime import ProviderMessage
from conversational_engine.utils.json_parsing import parse_json_object, strip_markdown_fences

# Keys that are part of the executor response envelope, not tool arguments.
_SCHEMA_KEYS = frozenset({
    'action',
    'assistantMessage',
    'toolName',
    'toolArguments',
    'toolArgumentsJson',
    'requiredInputs',
    'tool',
    'tool_name',
    'arguments',
    'parameters',
})

# Matches dotted tool names like "master.create_supplier" or "products.create_product".
_DOTTED_TOOL_NAME_RE = re.compile(r'^[a-z_]+\.[a-z_]+$')

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
        expected_tool_name: str | None = None,
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
        parsed = _normalize_executor_payload(parsed, expected_tool_name=expected_tool_name)
        return parsed


def _normalize_executor_payload(
    parsed: dict[str, Any],
    *,
    expected_tool_name: str | None = None,
) -> dict[str, Any]:
    normalized = dict(parsed)

    # Recovery 1: toolName from aliased keys 'tool' or 'tool_name'.
    if not normalized.get('toolName'):
        fallback_tool_name = normalized.get('tool') or normalized.get('tool_name')
        if isinstance(fallback_tool_name, str) and fallback_tool_name.strip():
            normalized['toolName'] = fallback_tool_name

    # Recovery 2: toolName from 'name' when it looks like a dotted tool path
    # e.g. {'name': 'master.create_supplier', 'toolArguments': {...}}.
    name_promoted = False
    if not normalized.get('toolName'):
        name_val = normalized.get('name')
        if isinstance(name_val, str) and _DOTTED_TOOL_NAME_RE.match(name_val.strip()):
            normalized['toolName'] = name_val.strip()
            name_promoted = True

    # Resolve toolArguments via existing logic.
    parsed_tool_arguments = _parse_tool_arguments(normalized.get('toolArguments'))
    if parsed_tool_arguments is None:
        raw_arguments = (
            normalized.get('toolArgumentsJson')
            if 'toolArgumentsJson' in normalized
            else normalized.get('arguments') or normalized.get('parameters')
        )
        parsed_tool_arguments = _parse_tool_arguments(raw_arguments)

    # Recovery 3: when toolArguments is still None, collect any top-level keys
    # that are not part of the executor response envelope.  This handles the
    # case where the LLM puts tool arguments directly on the root object, e.g.:
    #   {'name': 'saitees', 'styleCode': 'sai-0204', ..., 'toolArguments': None}
    if parsed_tool_arguments is None:
        excluded = set(_SCHEMA_KEYS)
        if name_promoted:
            # 'name' was promoted to toolName — don't also include it as an argument.
            excluded.add('name')
        top_level = {k: v for k, v in normalized.items() if k not in excluded}
        if top_level:
            parsed_tool_arguments = top_level

    normalized['toolArguments'] = parsed_tool_arguments

    # Recovery 4: last-resort toolName from the caller-supplied expected intent,
    # used when the LLM omits toolName entirely but the planner already resolved it.
    if not normalized.get('toolName') and expected_tool_name:
        normalized['toolName'] = expected_tool_name

    normalized.pop('toolArgumentsJson', None)
    return normalized


def _parse_tool_arguments(raw_arguments: Any) -> dict[str, Any] | None:
    if raw_arguments is None:
        return None
    if isinstance(raw_arguments, dict):
        return raw_arguments
    if isinstance(raw_arguments, str):
        stripped = strip_markdown_fences(raw_arguments)
        if not stripped:
            return None
        try:
            decoded = parse_json_object(stripped, source='Executor')
        except RuntimeError:
            decoded = _extract_json_object(stripped)
        if not isinstance(decoded, dict):
            raise RuntimeError('Executor returned a non-object tool argument payload')
        return decoded
    raise RuntimeError('Executor returned an unsupported tool argument payload')


def _extract_json_object(raw_arguments: str) -> dict[str, Any] | None:
    import json

    decoder = json.JSONDecoder()
    for start in (index for index, char in enumerate(raw_arguments) if char == '{'):
        try:
            decoded, _offset = decoder.raw_decode(raw_arguments[start:])
        except json.JSONDecodeError:
            continue
        if isinstance(decoded, dict):
            return decoded
    raise RuntimeError('Executor returned invalid toolArguments JSON')
