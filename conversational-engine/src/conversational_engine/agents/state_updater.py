from __future__ import annotations

from collections.abc import Callable
import json
from typing import Any

from conversational_engine.providers.router import ProviderRouter, ProviderTrace
from conversational_engine.providers.runtime import ProviderMessage

STATE_UPDATER_SCHEMA = {
    'type': 'object',
    'additionalProperties': False,
    'properties': {
        'useActiveWorkflow': {'type': 'boolean'},
        'primaryRoute': {'type': 'string', 'enum': ['navigation', 'read', 'mutation', 'mixed']},
        'primaryIntent': {'type': 'string'},
        'confidence': {'type': 'number'},
        'rationale': {'type': 'string'},
        'entityPatchesJson': {'type': 'string'},
        'navigationQuery': {'type': ['string', 'null']},
        'postActionQuery': {'type': ['string', 'null']},
    },
    'required': [
        'useActiveWorkflow',
        'primaryRoute',
        'primaryIntent',
        'confidence',
        'rationale',
        'entityPatchesJson',
        'navigationQuery',
        'postActionQuery',
    ],
}


class StateUpdateAgent:
    def __init__(self, router: ProviderRouter) -> None:
        self._router = router

    async def decide(
        self,
        *,
        user_message: str,
        task_context: dict[str, Any],
        recent_messages: list[dict[str, Any]],
        trace_callback: Callable[[str, ProviderTrace], None] | None = None,
    ) -> dict[str, Any]:
        response = await self._router.complete_json(
            role='state_updater',
            messages=[
                ProviderMessage(
                    role='system',
                    content=(
                        'You are the state-update agent for an internal inventory AI runtime. '
                        'Decide whether the latest user turn continues the active workflow or starts a new one. '
                        'Use the recent conversation and task context together. '
                        'Do not invent product names, locations, or other entities. '
                        'If the user refers to an existing entity indirectly, such as "this product" or '
                        '"the product we discussed earlier", keep useActiveWorkflow true and leave entityPatchesJson '
                        'empty instead of fabricating a new productName. '
                        'If the user is accepting a prior assistant offer, such as asking for more detail after a summary, '
                        'treat that as continuing the active workflow. '
                        'Return entityPatchesJson as a JSON object string only.'
                    ),
                ),
                ProviderMessage(
                    role='user',
                    content=(
                        f'Latest user message:\n{user_message}\n\n'
                        f'Active task context:\n{task_context}\n\n'
                        f'Recent conversation:\n{_format_recent_messages(recent_messages)}'
                    ),
                ),
            ],
            json_schema=STATE_UPDATER_SCHEMA,
            max_tokens=700,
            trace_callback=trace_callback,
        )
        parsed = response.parsed or {}
        return _normalize_state_update_payload(parsed)


def _format_recent_messages(recent_messages: list[dict[str, Any]]) -> str:
    if not recent_messages:
        return '[]'

    lines: list[str] = []
    for message in recent_messages[-8:]:
        role = str(message.get('role') or 'unknown')
        blocks = message.get('blocks')
        content_parts: list[str] = []
        if isinstance(blocks, list):
            for block in blocks:
                if not isinstance(block, dict):
                    continue
                block_type = str(block.get('type') or '')
                if block_type == 'text' and isinstance(block.get('content'), str):
                    content_parts.append(block['content'])
                elif block_type == 'clarification' and isinstance(block.get('prompt'), str):
                    content_parts.append(block['prompt'])
                elif block_type == 'confirmation_required' and isinstance(block.get('prompt'), str):
                    content_parts.append(block['prompt'])
                elif block_type == 'navigation' and isinstance(block.get('label'), str):
                    content_parts.append(f'navigation: {block["label"]}')
        if not content_parts:
            content_parts.append('[non-text blocks]')
        lines.append(f'{role}: {" | ".join(content_parts)}')
    return '\n'.join(lines)


def _normalize_state_update_payload(parsed: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(parsed)

    raw_patches = normalized.get('entityPatchesJson')
    if isinstance(raw_patches, str):
        try:
            decoded = json.loads(raw_patches)
        except json.JSONDecodeError as exc:
            raise RuntimeError('State updater returned invalid entityPatchesJson') from exc
        if not isinstance(decoded, dict):
            raise RuntimeError('State updater returned non-object entityPatchesJson')
        normalized['entityPatches'] = decoded
    elif isinstance(raw_patches, dict):
        normalized['entityPatches'] = raw_patches
    else:
        normalized['entityPatches'] = {}

    normalized.pop('entityPatchesJson', None)
    return normalized
