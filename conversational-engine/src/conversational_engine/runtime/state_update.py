from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Any

from conversational_engine.retrieval.service import RetrievalService

ROUTE_NAVIGATION = 'navigation'
ROUTE_READ = 'read'
ROUTE_MUTATION = 'mutation'
ROUTE_MIXED = 'mixed'

_NAVIGATION_PREFIXES = (
    'go to ',
    'open ',
    'take me to ',
    'navigate to ',
    'show me ',
    'show ',
)
_MUTATION_PATTERNS: tuple[tuple[str, str], ...] = (
    ('inventory.transfer_stock', r'\b(transfer|move)\b'),
    ('inventory.receive_stock', r'\b(receive|receipt)\b'),
    ('inventory.adjust_stock', r'\b(adjust)\b'),
    ('inventory.adjust_stock', r'\bwrite[ -]?off\b'),
    ('purchasing.create_po', r'\b(purchase order|create po|create a po|draft po)\b'),
    ('sales.create_invoice', r'\b(invoice|sales order|create so|create invoice)\b'),
    ('products.create_product', r'\b(create product|create a product|new product)\b'),
)
_READ_PATTERNS: tuple[tuple[str, str], ...] = (
    ('inventory.stock_on_hand', r'\b(stock|stock on hand|available)\b'),
    ('reporting.stock_summary', r'\b(summary|report)\b'),
)


@dataclass(slots=True)
class RuntimeStateUpdate:
    planner_message: str
    primary_route: str
    primary_intent: str
    confidence: float
    rationale: str
    used_memory: bool
    is_workflow_edit: bool
    task_context: dict[str, Any]
    extracted_entities: dict[str, Any]
    navigation_rows: list[dict[str, Any]] = field(default_factory=list)
    new_post_actions: list[dict[str, Any]] = field(default_factory=list)


def task_context_from_entities(extracted_entities: dict[str, Any]) -> dict[str, Any]:
    existing = extracted_entities.get('taskContext')
    if isinstance(existing, dict):
        context = dict(existing)
    else:
        context = {'primaryRoute': None, 'primaryIntent': None}
    context.setdefault('primaryRoute', None)
    context.setdefault('primaryIntent', None)
    context.setdefault('entities', {})
    context.setdefault('missingFields', [])
    context.setdefault('postActions', [])
    context.setdefault('lastResolvedRoute', None)
    context.setdefault('clarificationCount', 0)
    context.setdefault('status', 'drafting')
    return context


def apply_task_context(extracted_entities: dict[str, Any], task_context: dict[str, Any]) -> dict[str, Any]:
    merged = dict(extracted_entities)
    merged['taskContext'] = task_context
    entities = task_context.get('entities')
    if isinstance(entities, dict):
        for key, value in entities.items():
            merged[key] = value
    return merged


def increment_clarification_count(task_context: dict[str, Any]) -> dict[str, Any]:
    updated = dict(task_context)
    updated['clarificationCount'] = int(updated.get('clarificationCount') or 0) + 1
    return updated


def mark_task_status(extracted_entities: dict[str, Any], status: str, *, clear_post_actions: bool = False) -> dict[str, Any]:
    updated = dict(extracted_entities)
    task_context = task_context_from_entities(updated)
    task_context['status'] = status
    if clear_post_actions:
        task_context['postActions'] = []
    updated['taskContext'] = task_context
    return apply_task_context(updated, task_context)


def build_post_action_blocks(post_actions: list[dict[str, Any]]) -> list[dict[str, str]]:
    blocks: list[dict[str, str]] = []
    for action in post_actions:
        route = action.get('route')
        if not isinstance(route, dict):
            continue
        href = route.get('href')
        label = route.get('label')
        if not isinstance(href, str) or not isinstance(label, str):
            continue
        blocks.append(
            {
                'label': label,
                'href': href,
                'description': str(route.get('description') or ''),
            }
        )
    return blocks


async def resolve_state_update(
    *,
    user_message: str,
    extracted_entities: dict[str, Any],
    retrieval_service: RetrievalService,
) -> RuntimeStateUpdate:
    task_context = task_context_from_entities(extracted_entities)
    prior_entities = task_context.get('entities')
    merged_entities = dict(prior_entities) if isinstance(prior_entities, dict) else {}
    text = user_message.strip()
    normalized = _normalize(text)
    action_text, post_action_text = _split_post_action_text(text)
    patches = _extract_entity_patches(text, normalized)

    is_workflow_edit = bool(
        task_context.get('status') in {'drafting', 'awaiting_confirmation', 'awaiting_approval'}
        and (patches or post_action_text or _looks_like_contextual_edit(normalized))
        and task_context.get('primaryIntent')
    )

    if is_workflow_edit:
        primary_route = str(task_context.get('primaryRoute') or ROUTE_MUTATION)
        primary_intent = str(task_context.get('primaryIntent') or 'inventory.transfer_stock')
        rationale = 'Applied this turn as an update to the active workflow context.'
        confidence = 0.9
        used_memory = True
    else:
        primary_route, primary_intent, rationale, confidence = _resolve_primary_route_and_intent(action_text or text)
        used_memory = False

    if primary_route == ROUTE_MUTATION and post_action_text:
        primary_route = ROUTE_MIXED
        rationale = f'{rationale} Queued a post-action navigation step after the mutation succeeds.'

    merged_entities.update(patches)
    task_context['primaryRoute'] = primary_route
    task_context['primaryIntent'] = primary_intent
    task_context['entities'] = merged_entities
    task_context['status'] = task_context.get('status') or 'drafting'

    navigation_rows: list[dict[str, Any]] = []
    new_post_actions: list[dict[str, Any]] = []

    if primary_route == ROUTE_NAVIGATION:
        navigation_rows = await _resolve_navigation_rows(text, task_context, retrieval_service)
        if navigation_rows:
            task_context['lastResolvedRoute'] = navigation_rows[0]
    elif post_action_text:
        navigation_rows = await _resolve_navigation_rows(post_action_text, task_context, retrieval_service)
        if navigation_rows:
            new_post_actions = [{'type': 'navigate', 'query': post_action_text, 'route': navigation_rows[0]}]
            existing_actions = task_context.get('postActions')
            task_context['postActions'] = [*existing_actions] if isinstance(existing_actions, list) else []
            task_context['postActions'].extend(new_post_actions)

    task_context['missingFields'] = list(task_context.get('missingFields') or [])
    updated_entities = apply_task_context(extracted_entities, task_context)
    planner_message = _build_planner_message(
        original_message=text,
        action_text=action_text,
        is_workflow_edit=is_workflow_edit,
        primary_intent=primary_intent,
        entities=merged_entities,
        post_actions=new_post_actions,
    )

    return RuntimeStateUpdate(
        planner_message=planner_message,
        primary_route=primary_route,
        primary_intent=primary_intent,
        confidence=confidence,
        rationale=rationale,
        used_memory=used_memory,
        is_workflow_edit=is_workflow_edit,
        task_context=task_context,
        extracted_entities=updated_entities,
        navigation_rows=navigation_rows,
        new_post_actions=new_post_actions,
    )


def _normalize(value: str) -> str:
    return ' '.join(value.lower().strip().split())


def _split_post_action_text(text: str) -> tuple[str, str | None]:
    lowered = text.lower()
    match = re.search(r'\b(?:and then|then)\s+(show|open|take me to|go to|navigate to)\b(.+)$', lowered)
    if match:
        index = match.start()
        return text[:index].strip(' ,.'), text[index:].strip(' ,.')
    trailing = re.search(r'\b(show|open|take me to|go to|navigate to)\b(.+)\bafter\b', lowered)
    if trailing:
        return '', text.strip()
    return text, None


def _extract_entity_patches(text: str, normalized: str) -> dict[str, Any]:
    patches: dict[str, Any] = {}

    quantity_match = re.search(
        r'\b(?:actually make it|actually change it to|change it to|make it|make that|change that to)\s+(\d+)\b',
        normalized,
    )
    if quantity_match:
        patches['quantity'] = int(quantity_match.group(1))

    source_match = re.search(r'\buse\s+(.+?)\s+as the source\b', text, re.IGNORECASE)
    if source_match:
        patches['fromLocationId'] = source_match.group(1).strip()

    destination_match = re.search(r'\buse\s+(.+?)\s+as the destination\b', text, re.IGNORECASE)
    if destination_match:
        patches['toLocationId'] = destination_match.group(1).strip()

    location_match = re.search(r'\buse\s+(.+?)\s+as the location\b', text, re.IGNORECASE)
    if location_match:
        patches['locationId'] = location_match.group(1).strip()

    return patches


def _looks_like_contextual_edit(normalized: str) -> bool:
    return any(
        token in normalized
        for token in ('actually', 'instead', 'make it', 'change it', 'use ', 'after', 'there')
    )


def _resolve_primary_route_and_intent(text: str) -> tuple[str, str, str, float]:
    normalized = _normalize(text)
    for intent, pattern in _MUTATION_PATTERNS:
        if re.search(pattern, normalized):
            return (ROUTE_MUTATION, intent, f'Detected write-oriented language for {intent}.', 0.82)

    for intent, pattern in _READ_PATTERNS:
        if re.search(pattern, normalized):
            return (ROUTE_READ, intent, f'Detected read-oriented language for {intent}.', 0.76)

    for prefix in _NAVIGATION_PREFIXES:
        if normalized.startswith(prefix):
            return (
                ROUTE_NAVIGATION,
                'navigation.find_screen',
                'Detected an explicit navigation request.',
                0.96,
            )

    return (ROUTE_READ, 'inventory.stock_on_hand', 'Defaulted to a read workflow.', 0.42)


async def _resolve_navigation_rows(
    query: str,
    task_context: dict[str, Any],
    retrieval_service: RetrievalService,
) -> list[dict[str, Any]]:
    normalized = _normalize(query)
    if normalized in {'there', 'take me there', 'go there'}:
        previous = task_context.get('lastResolvedRoute')
        if isinstance(previous, dict):
            return [previous]

    cleaned = re.sub(r'^(show me|show|open|go to|take me to|navigate to)\s+', '', normalized).strip()
    results = await retrieval_service.resolve_navigation(cleaned or normalized)
    return [row for row in results if isinstance(row, dict)]


def _build_planner_message(
    *,
    original_message: str,
    action_text: str,
    is_workflow_edit: bool,
    primary_intent: str,
    entities: dict[str, Any],
    post_actions: list[dict[str, Any]],
) -> str:
    if not is_workflow_edit:
        return action_text or original_message

    updates = ', '.join(f'{key}={value}' for key, value in entities.items() if value is not None)
    message = f'Update the active {primary_intent} workflow. Latest user instruction: {original_message}.'
    if updates:
        message += f' Current resolved entities: {updates}.'
    if post_actions:
        route = post_actions[0].get('route')
        if isinstance(route, dict):
            message += f' After success, navigate to {route.get("label") or route.get("href")}.'
    return message
