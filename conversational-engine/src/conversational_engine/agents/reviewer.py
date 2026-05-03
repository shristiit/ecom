from __future__ import annotations

from collections.abc import Callable
from typing import Any

from conversational_engine.providers.router import ProviderRouter, ProviderTrace
from conversational_engine.providers.runtime import ProviderMessage
from conversational_engine.utils.json_parsing import parse_json_object

REVIEWER_SCHEMA = {
    'type': 'object',
    'additionalProperties': False,
    'properties': {
        'action': {'type': 'string', 'enum': ['complete', 'continue', 'clarify']},
        'assistantMessage': {'type': 'string'},
        'feedback': {'type': ['string', 'null']},
        'requiredInputs': {'type': 'array', 'items': {'type': 'string'}},
        'includeTable': {'type': 'boolean'},
        'resolvedEntitiesJson': {'type': 'string'},
    },
    'required': ['action', 'assistantMessage', 'feedback', 'requiredInputs', 'includeTable', 'resolvedEntitiesJson'],
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
                        'or whether the user must clarify something. '
                        'Also decide whether the final response should include the raw row table. '
                        'Set includeTable to true only when the user is clearly asking for detailed records, a listing, '
                        'or the answer materially depends on showing the underlying rows. '
                        'For simple summary, comparison, count, lowest/highest, or direct factual answers, prefer includeTable=false. '
                        'When your answer identifies a specific product, color, size, or location that the user is likely to refer to next, '
                        'return those fields in resolvedEntitiesJson as a JSON object string. '
                        'Use keys like productName, colorName, sizeLabel, locationName, or sku. '
                        'If there is no single focal entity to carry forward, return {}.'
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
        parsed = response.parsed or {}
        return _normalize_reviewer_payload(parsed)


def _normalize_reviewer_payload(parsed: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(parsed)
    raw_entities = normalized.get('resolvedEntitiesJson')
    if isinstance(raw_entities, str):
        normalized['resolvedEntities'] = parse_json_object(raw_entities, source='Reviewer')
    elif isinstance(raw_entities, dict):
        normalized['resolvedEntities'] = raw_entities
    else:
        normalized['resolvedEntities'] = {}
    normalized.pop('resolvedEntitiesJson', None)
    return normalized
