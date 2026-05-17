from __future__ import annotations

from datetime import datetime, timedelta
import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from conversational_engine.agents.parsing import extract_color_names, parse_size_labels
from conversational_engine.keyword_sets import (
    CONTACT_COMMAND_WORDS_PATTERN,
    CONTACT_FIELDS,
    CUSTOMER_NOUNS_PATTERN,
    DOMAIN_KEYWORDS,
    GENERIC_CONFIRMATION_PHRASES,
    LOCATION_NOUNS_PATTERN,
    MASTER_CREATE_VERBS_PATTERN,
    MASTER_DELETE_VERBS_PATTERN,
    MASTER_UPDATE_VERBS_PATTERN,
    MUTATION_FOLLOW_UP_KEYWORDS,
    NAVIGATION_PREFIXES,
    NON_DOMAIN_SMALL_TALK,
    REUSE_REFERENCE_PHRASES,
    SUPPLIER_NOUNS_PATTERN,
)
from conversational_engine.retrieval.service import RetrievalService
from conversational_engine.utils.casing import to_camel
from conversational_engine.utils.time import utc_now

if TYPE_CHECKING:
    from conversational_engine.agents.state_updater import StateUpdateAgent

ROUTE_NAVIGATION = 'navigation'
ROUTE_READ = 'read'
ROUTE_MUTATION = 'mutation'
ROUTE_MIXED = 'mixed'

_PENDING_TASK_TTL = timedelta(minutes=30)
_MUTATION_PATTERNS: tuple[tuple[str, str], ...] = (
    (
        'purchasing.receive_po',
        r'\b(receive|book in)\b.*\b(purchase order|po)\b|\b(purchase order|po)\b.*\b(receive|book in)\b',
    ),
    (
        'purchasing.close_po',
        r'\bclose\b.*\b(purchase order|po)\b|\b(purchase order|po)\b.*\bclose\b',
    ),
    (
        'sales.dispatch_invoice',
        r'\b(dispatch|ship)\b.*\b(sales order|invoice|so)\b|\b(sales order|invoice|so)\b.*\b(dispatch|ship)\b',
    ),
    (
        'sales.cancel_invoice',
        r'\bcancel\b.*\b(sales order|invoice|so)\b|\b(sales order|invoice|so)\b.*\bcancel\b',
    ),
    ('inventory.transfer_stock', r'\b(transfer|move)\b'),
    ('inventory.receive_stock', r'\b(receive|receipt)\b'),
    ('inventory.adjust_stock', r'\b(adjust)\b'),
    ('inventory.write_off_stock', r'\bwrite[ -]?off\b'),
    ('purchasing.create_po', r'\b(purchase order|create po|create a po|draft po|new po)\b'),
    (
        'sales.create_invoice',
        r'\b(invoice|sales order|create so|create invoice|create order|new order|place order|raise order|raise invoice|make a sale)\b',
    ),
    ('products.create_product', r'\b(create product|create a product|new product)\b'),
    (
        'master.create_location',
        rf'\b{MASTER_CREATE_VERBS_PATTERN}\b.*\b{LOCATION_NOUNS_PATTERN}\b|\b{LOCATION_NOUNS_PATTERN}\b.*\b{MASTER_CREATE_VERBS_PATTERN}\b',
    ),
    (
        'master.update_location',
        rf'\b{MASTER_UPDATE_VERBS_PATTERN}\b.*\b{LOCATION_NOUNS_PATTERN}\b|\b{LOCATION_NOUNS_PATTERN}\b.*\b{MASTER_UPDATE_VERBS_PATTERN}\b',
    ),
    (
        'master.delete_location',
        rf'\b{MASTER_DELETE_VERBS_PATTERN}\b.*\b{LOCATION_NOUNS_PATTERN}\b|\b{LOCATION_NOUNS_PATTERN}\b.*\b{MASTER_DELETE_VERBS_PATTERN}\b',
    ),
    (
        'master.create_supplier',
        rf'\b{MASTER_CREATE_VERBS_PATTERN}\b.*\b{SUPPLIER_NOUNS_PATTERN}\b|\b{SUPPLIER_NOUNS_PATTERN}\b.*\b{MASTER_CREATE_VERBS_PATTERN}\b',
    ),
    (
        'master.update_supplier',
        rf'\b{MASTER_UPDATE_VERBS_PATTERN}\b.*\b{SUPPLIER_NOUNS_PATTERN}\b|\b{SUPPLIER_NOUNS_PATTERN}\b.*\b{MASTER_UPDATE_VERBS_PATTERN}\b',
    ),
    (
        'master.delete_supplier',
        rf'\b{MASTER_DELETE_VERBS_PATTERN}\b.*\b{SUPPLIER_NOUNS_PATTERN}\b|\b{SUPPLIER_NOUNS_PATTERN}\b.*\b{MASTER_DELETE_VERBS_PATTERN}\b',
    ),
    (
        'master.create_customer',
        rf'\b{MASTER_CREATE_VERBS_PATTERN}\b.*\b{CUSTOMER_NOUNS_PATTERN}\b|\b{CUSTOMER_NOUNS_PATTERN}\b.*\b{MASTER_CREATE_VERBS_PATTERN}\b',
    ),
    (
        'master.update_customer',
        rf'\b{MASTER_UPDATE_VERBS_PATTERN}\b.*\b{CUSTOMER_NOUNS_PATTERN}\b|\b{CUSTOMER_NOUNS_PATTERN}\b.*\b{MASTER_UPDATE_VERBS_PATTERN}\b',
    ),
    (
        'master.delete_customer',
        rf'\b{MASTER_DELETE_VERBS_PATTERN}\b.*\b{CUSTOMER_NOUNS_PATTERN}\b|\b{CUSTOMER_NOUNS_PATTERN}\b.*\b{MASTER_DELETE_VERBS_PATTERN}\b',
    ),
)
_READ_PATTERNS: tuple[tuple[str, str], ...] = (
    (
        'master.search_locations',
        r'\b(list|show|search|find)\b.*\b(locations?|warehouses?)\b',
    ),
    (
        'inventory.variant_availability',
        r'\b(?:what|which|show|find)\b.*\b(?:sizes?|colors?)\b.*\b(?:available|have|has|stock|product|products)\b'
        r'|\b(?:products?|product)\b.*\b(?:sizes?|colors?)\b'
        r'|\b(?:sizes?|colors?)\b.*\b(?:low\s+stock|out\s+of\s+stock|available)\b',
    ),
    (
        'analytics.top_selling',
        r'\b(top|best)[- ]sell(?:ing)?\b|\btop\s+\d+\b.*\bproducts?\b|\bhighest\s+sales\b',
    ),
    (
        'analytics.out_of_stock',
        r'\bout\s+of\s+stock\b|\bzero\s+stock\b|\bno\s+stock\b',
    ),
    (
        'analytics.reorder_needed',
        r'\breorder(?:ed)?\s+(?:soon|needed|first|level)\b|\bneed(?:s)?\s+to\s+be\s+reorder(?:ed)?\b|\brestock\b',
    ),
    (
        'analytics.no_recent_sales',
        r'\bnot\s+sold\b|\bno\s+(?:recent\s+)?sales\b',
    ),
    (
        'analytics.slow_moving',
        r'\bslow[- ]mov(?:ing)?\b',
    ),
    (
        'analytics.stock_value',
        r'\bstock\s+value\b',
    ),
    (
        'analytics.high_demand_low_stock',
        r'\bhigh\s+(?:sales|demand).*low\s+stock\b',
    ),
    (
        'analytics.recently_added',
        r'\brecently\s+added\b|\bnew\s+products?\b',
    ),
    (
        'analytics.data_quality',
        r'\bnegative\s+stock\b|\bduplicate\s+sku\b|\bdata\s+quality\b|\bstock\s+mismatch\b|\bmissing\s+fields?\b|\bzero\s+price\b',
    ),
    (
        'analytics.low_stock',
        r'\blow\s+stock\b|\bbelow\s+\d+\s+(?:units?|quantity)\b|\bless\s+than\s+\d+\b.*\b(?:units?|quantity)\b|\bbelow\s+threshold\b',
    ),
    (
        'purchasing.list_pos',
        r'\b(list|show|search|find)\b.*\b(open\s+)?(purchase orders|purchase order|pos|po)\b',
    ),
    (
        'purchasing.get_po',
        r'\b(status of|what(?:s| is) the status of|lines in|details of|inspect)\b.*\b(purchase order|po)\b',
    ),
    (
        'sales.list_invoices',
        r'\b(list|show|search|find)\b.*\b(open\s+)?(sales orders|sales order|invoices|invoice|sos|so)\b',
    ),
    (
        'sales.get_invoice',
        r'\b(status of|what(?:s| is) the status of|lines in|details of|inspect)\b.*\b(sales order|invoice|so)\b',
    ),
    (
        'analytics.top_selling',
        r'\b(?:how\s+many\s+(?:sold|units|were\s+sold)|units?\s+sold|qty\s+sold|quantity\s+sold|total\s+sold|sales\s+count)\b',
    ),
    ('reporting.movement_summary', r'\b(movement|movements|movement\s+summary|stock\s+history|transfer\s+report|receipt\s+report|inbound\s+report)\b'),
    ('reporting.po_summary', r'\b(po\s+summary|po\s+report|purchase\s+order\s+summary|purchase\s+order\s+report|supplier\s+orders\s+report)\b'),
    ('reporting.receipt_summary', r'\b(receipt\s+summary|receipt\s+report|booked\s+in\s+report|inbound\s+stock\s+report)\b'),
    ('inventory.stock_on_hand', r'\b(stock|stock on hand|available)\b'),
    ('inventory.stock_on_hand', r'\b(size|sizes|variant|variants|color|colors)\b'),
    ('reporting.stock_summary', r'\b(stock\s+summary|stock\s+report|summary|report)\b'),
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
        pending_task = _active_pending_task(extracted_entities)
        context = {
            'primaryRoute': pending_task.get('route') if pending_task else None,
            'primaryIntent': pending_task.get('intent') if pending_task else None,
            'entities': dict(pending_task.get('entities') or {}) if pending_task else {},
            'missingFields': list(pending_task.get('missingFields') or []) if pending_task else [],
            'status': str(pending_task.get('status') or 'drafting') if pending_task else 'drafting',
        }
    context.setdefault('primaryRoute', None)
    context.setdefault('primaryIntent', None)
    context.setdefault('entities', {})
    context.setdefault('missingFields', [])
    context.setdefault('postActions', [])
    context.setdefault('lastResolvedRoute', None)
    context.setdefault('clarificationCount', 0)
    context.setdefault('status', 'drafting')
    return context


def fresh_task_context() -> dict[str, Any]:
    return {
        'primaryRoute': None,
        'primaryIntent': None,
        'entities': {},
        'missingFields': [],
        'postActions': [],
        'lastResolvedRoute': None,
        'clarificationCount': 0,
        'status': 'drafting',
    }


def apply_task_context(extracted_entities: dict[str, Any], task_context: dict[str, Any]) -> dict[str, Any]:
    merged = dict(extracted_entities)
    merged['taskContext'] = task_context
    entities = task_context.get('entities')
    if isinstance(entities, dict):
        for key, value in entities.items():
            merged[key] = value
    _sync_pending_task(merged, task_context)
    return merged


def increment_clarification_count(task_context: dict[str, Any]) -> dict[str, Any]:
    updated = dict(task_context)
    updated['clarificationCount'] = int(updated.get('clarificationCount') or 0) + 1
    return updated


def mark_task_status(
    extracted_entities: dict[str, Any],
    status: str,
    *,
    clear_post_actions: bool = False,
) -> dict[str, Any]:
    updated = dict(extracted_entities)
    task_context = task_context_from_entities(updated)
    task_context['status'] = status
    if status in {'awaiting_confirmation', 'awaiting_approval', 'completed'}:
        task_context['missingFields'] = []
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
    recent_messages: list[dict[str, object]],
    retrieval_service: RetrievalService,
    state_updater: StateUpdateAgent | None = None,
) -> RuntimeStateUpdate:
    task_context = task_context_from_entities(extracted_entities)
    prior_entities = task_context.get('entities')
    merged_entities = dict(prior_entities) if isinstance(prior_entities, dict) else {}
    text = user_message.strip()
    decision = None
    if state_updater is not None:
        try:
            decision = await state_updater.decide(
                user_message=text,
                task_context=task_context,
                recent_messages=recent_messages,
            )
        except Exception:
            decision = None

    action_text, post_action_text = _split_post_action_text(text)
    route_fallback, intent_fallback, fallback_rationale, fallback_confidence = _resolve_primary_route_and_intent(
        action_text or text
    )

    decision_patches = decision.get('entityPatches') if isinstance(decision, dict) else None
    patches = dict(decision_patches) if isinstance(decision_patches, dict) else {}

    is_workflow_edit = bool(decision.get('useActiveWorkflow')) if isinstance(decision, dict) else False
    if is_workflow_edit:
        primary_route = str(decision.get('primaryRoute') or task_context.get('primaryRoute') or route_fallback)
        primary_intent = str(decision.get('primaryIntent') or task_context.get('primaryIntent') or intent_fallback)
        rationale = str(
            decision.get('rationale') or 'Applied this turn as an update to the active workflow context.'
        ) if isinstance(decision, dict) else 'Applied this turn as an update to the active workflow context.'
        confidence = _coerce_confidence(decision.get('confidence') if isinstance(decision, dict) else None, 0.9)
        used_memory = True
    else:
        primary_route = (
            str(decision.get('primaryRoute') or route_fallback) if isinstance(decision, dict) else route_fallback
        )
        primary_intent = (
            str(decision.get('primaryIntent') or intent_fallback) if isinstance(decision, dict) else intent_fallback
        )
        rationale = (
            str(decision.get('rationale') or fallback_rationale)
            if isinstance(decision, dict)
            else fallback_rationale
        )
        confidence = _coerce_confidence(
            decision.get('confidence') if isinstance(decision, dict) else None,
            fallback_confidence,
        )
        used_memory = bool(decision and decision.get('useActiveWorkflow'))

    navigation_query = (
        str(decision.get('navigationQuery')).strip()
        if isinstance(decision, dict)
        and isinstance(decision.get('navigationQuery'), str)
        and str(decision.get('navigationQuery')).strip()
        else None
    )
    post_action_query = (
        str(decision.get('postActionQuery')).strip()
        if isinstance(decision, dict)
        and isinstance(decision.get('postActionQuery'), str)
        and str(decision.get('postActionQuery')).strip()
        else post_action_text
    )

    if primary_route == ROUTE_MUTATION and post_action_query:
        primary_route = ROUTE_MIXED
        rationale = f'{rationale} Queued a post-action navigation step after the mutation succeeds.'

    active_intent = str(task_context.get('primaryIntent') or '')
    merged_entities.update(patches)
    if primary_intent == 'master.create_location' or active_intent == 'master.create_location':
        merged_entities.update(_extract_location_create_entities(action_text or text))
    if (
        primary_intent in {'master.create_supplier', 'master.create_customer'}
        or active_intent in {'master.create_supplier', 'master.create_customer'}
    ):
        merged_entities.update(_extract_contact_create_entities(action_text or text))
    analytics_intent = ''
    if primary_intent.startswith('analytics.'):
        analytics_intent = primary_intent
    elif active_intent.startswith('analytics.'):
        analytics_intent = active_intent
    if analytics_intent:
        merged_entities.update(_extract_analytics_entities(action_text or text, analytics_intent=analytics_intent))
    if primary_intent == 'inventory.variant_availability' or active_intent == 'inventory.variant_availability':
        merged_entities.update(_extract_variant_query_entities(action_text or text))

    if not is_workflow_edit and _should_continue_pending_task(
        text=action_text or text,
        task_context=task_context,
        route_fallback=route_fallback,
        intent_fallback=intent_fallback,
        merged_entities=merged_entities,
    ):
        is_workflow_edit = True
        primary_route = str(task_context.get('primaryRoute') or ROUTE_MUTATION)
        primary_intent = active_intent or primary_intent
        rationale = 'Applied this turn as missing-field input for the active workflow.'
        confidence = max(confidence, 0.91)
        used_memory = True
    elif not is_workflow_edit and _should_reset_mutation_context(
        task_context=task_context,
        primary_route=primary_route,
        primary_intent=primary_intent,
    ):
        carryover_entities: dict[str, Any] = {}
        if isinstance(prior_entities, dict):
            if active_intent == 'master.create_supplier' and primary_intent == 'purchasing.create_po':
                for key in ('supplierId', 'supplierName'):
                    value = prior_entities.get(key)
                    if value is not None:
                        carryover_entities[key] = value
            if active_intent == 'master.create_customer' and primary_intent == 'sales.create_invoice':
                for key in ('customerId', 'customerName'):
                    value = prior_entities.get(key)
                    if value is not None:
                        carryover_entities[key] = value
        extracted_entities = _clear_runtime_workflow_state(extracted_entities, task_context)
        task_context = fresh_task_context()
        merged_entities = {**carryover_entities, **patches}
        if primary_intent == 'master.create_location':
            merged_entities.update(_extract_location_create_entities(action_text or text))
        if primary_intent in {'master.create_supplier', 'master.create_customer'}:
            merged_entities.update(_extract_contact_create_entities(action_text or text))

    task_context['primaryRoute'] = primary_route
    task_context['primaryIntent'] = primary_intent
    task_context['entities'] = merged_entities
    task_context['status'] = task_context.get('status') or 'drafting'

    navigation_rows: list[dict[str, Any]] = []
    new_post_actions: list[dict[str, Any]] = []

    if primary_route == ROUTE_NAVIGATION:
        navigation_rows = await _resolve_navigation_rows(navigation_query or text, task_context, retrieval_service)
        if navigation_rows:
            task_context['lastResolvedRoute'] = navigation_rows[0]
    elif post_action_query:
        navigation_rows = await _resolve_navigation_rows(post_action_query, task_context, retrieval_service)
        if navigation_rows:
            new_post_actions = [{'type': 'navigate', 'query': post_action_query, 'route': navigation_rows[0]}]
            existing_actions = task_context.get('postActions')
            task_context['postActions'] = [*existing_actions] if isinstance(existing_actions, list) else []
            task_context['postActions'].extend(new_post_actions)

    # When continuing an active workflow, remove any missing fields that are
    # now satisfied by the merged entities so the planner doesn't keep asking
    # for them even after the user has supplied the values.
    if is_workflow_edit:
        task_context['missingFields'] = [
            field for field in (task_context.get('missingFields') or [])
            if not _entity_has_value(merged_entities, field)
        ]
    else:
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


def _coerce_confidence(value: object, default: float) -> float:
    if isinstance(value, (int, float)):
        return max(0.0, min(float(value), 1.0))
    return default


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


def _resolve_primary_route_and_intent(text: str) -> tuple[str, str, str, float]:
    normalized = _normalize(text)
    for intent, pattern in _MUTATION_PATTERNS:
        if re.search(pattern, normalized):
            return (ROUTE_MUTATION, intent, f'Detected write-oriented language for {intent}.', 0.82)

    for intent, pattern in _READ_PATTERNS:
        if re.search(pattern, normalized):
            return (ROUTE_READ, intent, f'Detected read-oriented language for {intent}.', 0.76)

    for prefix in NAVIGATION_PREFIXES:
        if normalized.startswith(prefix):
            return (
                ROUTE_NAVIGATION,
                'navigation.find_screen',
                'Detected an explicit navigation request.',
                0.96,
            )

    if _is_off_topic(normalized):
        return (ROUTE_READ, 'off_topic', 'Detected a request outside the inventory domain.', 0.95)

    return (ROUTE_READ, 'inventory.stock_on_hand', 'Defaulted to a read workflow.', 0.42)


def _is_off_topic(normalized: str) -> bool:
    if not normalized:
        return False
    if normalized in NON_DOMAIN_SMALL_TALK:
        return False
    if any(keyword in normalized for keyword in DOMAIN_KEYWORDS):
        return False
    if any(normalized.startswith(prefix.strip()) for prefix in NAVIGATION_PREFIXES):
        return False
    tokens = re.findall(r"[a-z0-9']+", normalized)
    if len(tokens) <= 3:
        return False
    return True


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


def _extract_analytics_entities(text: str, *, analytics_intent: str) -> dict[str, Any]:
    normalized = _normalize(text)
    extracted: dict[str, Any] = {}

    threshold_match = re.search(
        r'\b(?:below|less than|under|fewer than)\s+(\d+)\b|\b(?:threshold|reorder threshold)\s*(?:of|is|=)?\s*(\d+)\b',
        normalized,
    )
    if threshold_match:
        extracted['threshold'] = int(next(group for group in threshold_match.groups() if group is not None))
    elif analytics_intent in {'analytics.low_stock', 'analytics.reorder_needed', 'analytics.high_demand_low_stock'} and normalized.isdigit():
        extracted['threshold'] = int(normalized)

    days_match = re.search(r'\b(?:last|past)\s+(\d+)\s+days?\b', normalized)
    if days_match:
        extracted['days'] = int(days_match.group(1))
    elif 'this month' in normalized:
        extracted['period'] = 'this_month'
    elif 'this week' in normalized:
        extracted['period'] = 'this_week'
    elif normalized == 'today':
        extracted['period'] = 'today'

    top_match = re.search(r'\btop\s+(\d+)\b', normalized)
    if top_match:
        extracted['limit'] = int(top_match.group(1))

    if 'highest' in normalized:
        extracted['sort'] = 'desc'
    elif 'lowest' in normalized:
        extracted['sort'] = 'asc'

    if re.search(r'\bacross\s+all\s+locations?\b|\ball\s+locations?\b', normalized):
        extracted['allLocations'] = True

    location_match = re.search(r'\b(?:in|at|from)\s+([a-z][a-z0-9 .&\'/-]+)$', text.strip(), re.IGNORECASE)
    if location_match:
        location_candidate = location_match.group(1).strip(' .')
        if _normalize(location_candidate) not in {'table', 'tables', 'grid', 'list', 'results', 'csv', 'excel', 'file'}:
            extracted['locationId'] = location_candidate
    elif (
        analytics_intent.startswith('analytics.')
        and 'locationId' not in extracted
        and normalized
        and normalized not in NON_DOMAIN_SMALL_TALK
        and normalized not in GENERIC_CONFIRMATION_PHRASES
        and normalized not in REUSE_REFERENCE_PHRASES
        and len(re.findall(r"[a-z0-9']+", normalized)) <= 5
        and not any(char.isdigit() for char in normalized)
        and not any(
            keyword in normalized
            for keyword in (
                'stock',
                'product',
                'products',
                'sku',
                'reorder',
                'sales',
                'selling',
                'download',
                'export',
                'show',
                'which',
            )
        )
    ):
        extracted['locationId'] = text.strip()

    return extracted


def _extract_variant_query_entities(text: str) -> dict[str, Any]:
    normalized = _normalize(text)
    extracted: dict[str, Any] = {}

    sizes = parse_size_labels(text)
    if sizes:
        if len(sizes) == 1:
            extracted['size'] = sizes[0]
        else:
            extracted['sizes'] = sizes
            extracted['matchAllSizes'] = not bool(re.search(r'\b(?:or|either)\b', normalized))

    colors = extract_color_names(text)
    if colors:
        extracted['color'] = colors[0]

    if re.search(r'\bout\s+of\s+stock\b', normalized):
        extracted['availability'] = 'out_of_stock'
    elif re.search(r'\blow\s+(?:in\s+)?stock\b|\blow\s+stock\b', normalized):
        extracted['availability'] = 'low_stock'
    elif re.search(r'\bavailable\b|\bin\s+stock\b', normalized):
        extracted['availability'] = 'in_stock'
    else:
        extracted['availability'] = 'any'

    threshold_match = re.search(
        r'\b(?:below|less than|under|fewer than)\s+(\d+)\b|\bthreshold\s*(?:of|is|=)?\s*(\d+)\b',
        normalized,
    )
    if threshold_match:
        extracted['threshold'] = int(next(group for group in threshold_match.groups() if group is not None))
    elif extracted.get('availability') == 'low_stock':
        extracted['threshold'] = 10

    if re.search(r'\bwhat\s+sizes?\b|\bwhich\s+sizes?\b', normalized):
        extracted['groupBy'] = 'size'
    elif re.search(r'\bwhat\s+colors?\b|\bwhich\s+colors?\b', normalized):
        extracted['groupBy'] = 'color'
    else:
        extracted['groupBy'] = 'product'

    if 'multiple colors' in normalized:
        extracted['minColorCount'] = 2
    if 'only one color' in normalized:
        extracted['maxColorCount'] = 1
        extracted['availability'] = 'in_stock'
    if 'only one size left in stock' in normalized:
        extracted['maxInStockSizeCount'] = 1
        extracted['availability'] = 'in_stock'
        extracted['groupBy'] = 'product'

    exclude_size_match = re.search(r'\bnot\s+([a-z0-9]+)\s+size\b', normalized, re.IGNORECASE)
    if exclude_size_match:
        extracted['excludeSize'] = exclude_size_match.group(1).upper()

    product_match = re.search(
        r'\b(?:for|of)\s+(.+?)(?:\s+product)?(?:\s+(?:at|in)\s+[a-z0-9 .&\'/-]+)?\s*$',
        text.strip(' ?'),
        re.IGNORECASE,
    )
    if product_match:
        candidate = product_match.group(1).strip(' "\'')
        normalized_candidate = _normalize(candidate)
        if candidate and not any(
            keyword in normalized_candidate
            for keyword in (
                'size',
                'sizes',
                'color',
                'colors',
                'stock',
                'available',
                'products',
                'product',
                'low',
                'out',
            )
        ):
            extracted['productName'] = candidate

    if re.search(r'\bacross\s+all\s+locations?\b|\ball\s+locations?\b', normalized):
        extracted['allLocations'] = True

    location_match = re.search(r'\b(?:in|at)\s+([a-z][a-z0-9 .&\'/-]+)$', text.strip(), re.IGNORECASE)
    if location_match and 'productName' not in extracted:
        location_candidate = location_match.group(1).strip(' .')
        if _normalize(location_candidate) not in {'table', 'tables', 'grid', 'list', 'results', 'csv', 'excel', 'file'}:
            extracted['locationId'] = location_candidate

    return extracted


def _extract_location_create_entities(text: str) -> dict[str, Any]:
    extracted: dict[str, Any] = {}
    normalized = text.strip()
    unlabeled_lines: list[str] = []
    for raw_line in normalized.splitlines():
        line = raw_line.strip(' ,')
        if not line:
            continue
        field_match = re.match(r'^(name|named|code|type|address|status)\b\s*[:=]?\s*(.+)$', line, re.IGNORECASE)
        if field_match:
            field_name = field_match.group(1).lower()
            value = field_match.group(2).strip().strip('"')
            if not value:
                continue
            if field_name in {'name', 'named'}:
                extracted['name'] = value
            elif field_name == 'code':
                extracted['code'] = value
            elif field_name == 'type':
                normalized_type = _normalize_location_type(value)
                extracted['type'] = normalized_type or value.lower()
            elif field_name == 'address':
                extracted['address'] = value
            elif field_name == 'status':
                extracted['status'] = value.lower()
            continue
        normalized_type = _normalize_location_type(line)
        if normalized_type and 'type' not in extracted:
            extracted['type'] = normalized_type
            continue
        if re.fullmatch(r'(active|inactive)', line, re.IGNORECASE) and 'status' not in extracted:
            extracted['status'] = line.lower()
            continue
        if _looks_like_location_code(line) and 'code' not in extracted:
            extracted['code'] = line
            continue
        unlabeled_lines.append(line)

    if 'code' not in extracted:
        code_match = re.search(r'\bcode\b\s*[:=]?\s*([A-Za-z0-9][A-Za-z0-9_-]*)', normalized, re.IGNORECASE)
        if code_match:
            extracted['code'] = code_match.group(1).strip()

    if 'name' not in extracted:
        name_match = re.search(
            r'\b(?:name|named)\b\s*[:=]?\s*"?([^\n,]+?)"?(?=\s*(?:$|,|\bcode\b|\btype\b|\baddress\b|\bstatus\b))',
            normalized,
            re.IGNORECASE,
        )
        if name_match:
            extracted['name'] = name_match.group(1).strip()

    if 'type' not in extracted:
        type_match = re.search(
            r'\btype\b\s*[:=]?\s*([^\n,]+?)(?=\s*(?:$|,|\bcode\b|\bname\b|\bnamed\b|\baddress\b|\bstatus\b))',
            normalized,
            re.IGNORECASE,
        )
        if type_match:
            extracted['type'] = _normalize_location_type(type_match.group(1)) or type_match.group(1).strip().lower()
        else:
            normalized_type = _normalize_location_type(normalized)
            if normalized_type:
                extracted['type'] = normalized_type
            elif re.search(r'\bware\s*house\b|\bwarehouse\b|\bwarehosue\b', normalized, re.IGNORECASE):
                extracted['type'] = 'warehouse'
            elif re.search(r'\boutlet\b', normalized, re.IGNORECASE):
                extracted['type'] = 'outlet'
            elif re.search(r'\bstore\b', normalized, re.IGNORECASE):
                extracted['type'] = 'store'

    if 'address' not in extracted:
        address_match = re.search(
            r'\baddress\b\s*[:=]?\s*"?(.+?)"?(?=\s+\bstatus\b|$)',
            normalized,
            re.IGNORECASE,
        )
        if address_match:
            extracted['address'] = address_match.group(1).strip()

    if 'status' not in extracted:
        status_match = re.search(r'\b(active|inactive)\b', normalized, re.IGNORECASE)
        if status_match:
            extracted['status'] = status_match.group(1).strip().lower()

    if unlabeled_lines and 'name' not in extracted and not _looks_like_location_creation_request(normalized):
        candidate = unlabeled_lines[0].strip()
        normalized_candidate = _normalize(candidate)
        if normalized_candidate not in {
            *GENERIC_CONFIRMATION_PHRASES,
            'yes correct',
            'same',
            'same one',
        }:
            extracted['name'] = candidate
    return extracted


def _active_pending_task(extracted_entities: dict[str, Any]) -> dict[str, Any] | None:
    raw = extracted_entities.get('pendingTask')
    if not isinstance(raw, dict):
        raw = extracted_entities.get('pending_task')
    if not isinstance(raw, dict):
        return None
    updated_at = raw.get('updatedAt')
    if not isinstance(updated_at, str):
        return None
    try:
        age = utc_now() - datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
    except ValueError:
        return None
    if age > _PENDING_TASK_TTL:
        return None
    return raw


def _sync_pending_task(extracted_entities: dict[str, Any], task_context: dict[str, Any]) -> None:
    status = str(task_context.get('status') or '')
    if status in {'completed', 'failed'}:
        extracted_entities.pop('pendingTask', None)
        extracted_entities.pop('pending_task', None)
        return
    primary_intent = str(task_context.get('primaryIntent') or '')
    if not primary_intent:
        extracted_entities.pop('pendingTask', None)
        extracted_entities.pop('pending_task', None)
        return
    extracted_entities['pendingTask'] = {
        'route': task_context.get('primaryRoute'),
        'intent': primary_intent,
        'entities': dict(task_context.get('entities') or {}),
        'missingFields': list(task_context.get('missingFields') or []),
        'status': status or 'drafting',
        'updatedAt': utc_now().isoformat(),
    }


def _should_reset_mutation_context(
    *,
    task_context: dict[str, Any],
    primary_route: str,
    primary_intent: str,
) -> bool:
    active_route = str(task_context.get('primaryRoute') or '')
    active_intent = str(task_context.get('primaryIntent') or '')
    if active_route != ROUTE_MUTATION or primary_route != ROUTE_MUTATION:
        return False
    if not active_intent or not primary_intent:
        return False
    return active_intent != primary_intent


def _clear_runtime_workflow_state(
    extracted_entities: dict[str, Any],
    task_context: dict[str, Any],
) -> dict[str, Any]:
    cleared = dict(extracted_entities)
    entities = task_context.get('entities')
    if isinstance(entities, dict):
        for key in entities:
            cleared.pop(key, None)

    for key in (
        'taskContext',
        'pendingTask',
        'pending_task',
        'toolName',
        'executionPayload',
        'preview',
        'approvalRequired',
        'approvalReason',
        'summary',
        'activeApprovalId',
        'activeApprovalStatus',
        '_pendingActions',
        '_pendingPrompt',
        '_pendingApprovalUpdateOriginal',
        '_approvalOperation',
    ):
        cleared.pop(key, None)
    return cleared


def _should_continue_pending_task(
    *,
    text: str,
    task_context: dict[str, Any],
    route_fallback: str,
    intent_fallback: str,
    merged_entities: dict[str, Any],
) -> bool:
    active_route = str(task_context.get('primaryRoute') or '')
    active_intent = str(task_context.get('primaryIntent') or '')
    missing_fields = [str(item) for item in task_context.get('missingFields') or []]
    status = str(task_context.get('status') or '')
    if status == 'failed':
        return False
    if active_route not in {ROUTE_MUTATION, ROUTE_READ} or not active_intent:
        return False
    # A new mutation for a *different* intent starts a fresh workflow.
    if route_fallback == ROUTE_MUTATION and intent_fallback and intent_fallback != active_intent:
        return False
    if not missing_fields:
        normalized = _normalize(text)
        if (
            active_route == ROUTE_MUTATION
            and status in {'drafting', 'awaiting_confirmation', 'awaiting_approval'}
            and route_fallback != ROUTE_MUTATION
            and bool(normalized)
            and not normalized.endswith('?')
            and _looks_like_mutation_follow_up(normalized)
        ):
            return True
        if (
            active_route == ROUTE_READ
            and (active_intent.startswith('analytics.') or active_intent == 'inventory.variant_availability')
            and status in {'drafting', 'completed'}
            and bool(normalized)
            and normalized not in NON_DOMAIN_SMALL_TALK
            and not normalized.endswith('?')
        ):
            return len(re.findall(r"[a-z0-9']+", normalized)) <= 5
        return (
            active_route == ROUTE_MUTATION
            and status in {'drafting', 'awaiting_confirmation', 'awaiting_approval'}
            and route_fallback != ROUTE_MUTATION
            and bool(normalized)
            and not normalized.endswith('?')
            and _looks_like_mutation_follow_up(normalized)
        )
    # Always continue when an entity extracted from this turn satisfies a missing field.
    if any(_entity_has_value(merged_entities, field) for field in missing_fields):
        return True
    normalized = _normalize(text)
    if not normalized or normalized.endswith('?'):
        return False
    # Structured input (key:value or multiline) is clearly a follow-up.
    if ':' in text or '\n' in text:
        return True
    # When an active mutation workflow is waiting for input and the user's
    # message didn't resolve to a competing mutation intent, continue only for
    # follow-up-shaped replies. This still catches short answers like
    # "Cloud XS" or "PO-0001", but avoids trapping unrelated small talk like
    # "hello" inside the old draft.
    if active_route == ROUTE_MUTATION and route_fallback != ROUTE_MUTATION:
        if normalized in NON_DOMAIN_SMALL_TALK:
            return False
        return _looks_like_mutation_follow_up(normalized) or len(re.findall(r"[a-z0-9']+", normalized)) <= 4
    # Legacy short-message heuristic for read workflows.
    return len(re.findall(r"[a-z0-9']+", normalized)) <= 4


def _entity_has_value(entities: dict[str, Any], field: str) -> bool:
    for key in _entity_field_aliases(field):
        value = entities.get(key)
        if isinstance(value, str) and value.strip():
            return True
        if value is not None:
            return True
    return False


def _entity_field_aliases(field: str) -> tuple[str, ...]:
    aliases = {
        'sku_and_size': ('sizeId', 'skuCode', 'sizeLabel'),
        'location_and_quantity': ('locationId', 'quantity'),
        'color_name': ('colorName',),
        'size_labels': ('sizeLabels',),
        'base_price': ('basePrice',),
        'style_code': ('styleCode',),
        'product_id': ('productId',),
        'supplier_id': ('supplierId',),
        'customer_id': ('customerId',),
        'threshold': ('threshold',),
        'days': ('days',),
        'po_id': ('poId',),
        'invoice_id': ('invoiceId',),
        'location_id': ('locationId',),
        'from_location_id': ('fromLocationId',),
        'to_location_id': ('toLocationId',),
    }
    return (field, to_camel(field), *aliases.get(field, ()))


def _looks_like_mutation_follow_up(normalized: str) -> bool:
    if any(char.isdigit() for char in normalized):
        return True
    return any(
        keyword in normalized
        for keyword in MUTATION_FOLLOW_UP_KEYWORDS
    )


def _looks_like_location_code(value: str) -> bool:
    stripped = value.strip()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]*', stripped):
        return False
    return any(char.isdigit() for char in stripped) or '-' in stripped or '_' in stripped


def _normalize_location_type(value: str) -> str | None:
    collapsed = re.sub(r'[^a-z]', '', value.lower())
    if collapsed in {'warehouse', 'warehosue', 'warehous'}:
        return 'warehouse'
    if collapsed == 'store':
        return 'store'
    if collapsed == 'outlet':
        return 'outlet'
    return None


def _extract_contact_create_entities(text: str) -> dict[str, Any]:
    """Extract name/email/phone/address from a supplier or customer creation message.

    Handles inputs like:
      "raghu"
      "name : raghu"
      "name : raghubez email raghu@bez.com"
      "raghu, raghu@example.com, +447700123456, 10 Baker St"
    """
    extracted: dict[str, Any] = {}
    working = text.strip()

    # ── email ──────────────────────────────────────────────────────────────────
    email_match = re.search(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b', working)
    if email_match:
        extracted['email'] = email_match.group(0)
        working = (working[: email_match.start()] + ' ' + working[email_match.end() :]).strip()

    # ── phone ──────────────────────────────────────────────────────────────────
    phone_match = re.search(r'(?<!\w)(\+?[0-9][\d\s\-()]{6,15}[0-9])(?!\w)', working)
    if phone_match:
        extracted['phone'] = phone_match.group(1).strip()
        working = (working[: phone_match.start()] + ' ' + working[phone_match.end() :]).strip()

    # ── labelled fields (field : value  or  field = value) ────────────────────
    # Allow optional stray punctuation after the separator, e.g. "name:; raghu" or "name:, raghu".
    _FIELD_BOUNDARY = r'(?=\s*(?:$|,|;|\b(?:name|email|phone|address|status)\b))'
    for field in CONTACT_FIELDS:
        if field in extracted:
            continue
        if field == 'address':
            m = re.search(
                r'\baddress\b(?:\s*[:=][;,]?\s*|\s+\bis\b\s+|\s+)(.+?)(?=\s*(?:$|;|\b(?:name|email|phone|status)\b))',
                working,
                re.IGNORECASE,
            )
        else:
            m = re.search(
                rf'\b{field}\b(?:\s*[:=][;,]?\s*|\s+\bis\b\s+)([^\n,;:]+?){_FIELD_BOUNDARY}',
                working,
                re.IGNORECASE,
            )
        if m:
            value = m.group(1).strip().strip('"\'')
            if value:
                extracted[field] = value

    if 'name' not in extracted:
        named_match = re.search(
            r'\b(?:name|named|called)\b\s*[:=]?\s*"?(.+?)"?(?=\s*(?:$|,|;|\b(?:with\s+email|email|phone|address|status)\b))',
            working,
            re.IGNORECASE,
        )
        if named_match:
            value = named_match.group(1).strip().strip('"\'')
            if value:
                extracted['name'] = value

    # ── bare name fallback ─────────────────────────────────────────────────────
    if 'name' not in extracted:
        _COMMAND_WORDS = rf'\b{CONTACT_COMMAND_WORDS_PATTERN}\b'
        # Also strip any remaining "field:;" style label artifacts before extracting the bare name.
        _LABEL_ARTIFACTS = r'\b(?:name|email|phone|address|status)\b\s*[:=][;,]?\s*'
        candidate = re.sub(_COMMAND_WORDS, '', working, flags=re.IGNORECASE)
        candidate = re.sub(_LABEL_ARTIFACTS, '', candidate, flags=re.IGNORECASE).strip(' ,;:')
        normalized_candidate = _normalize(candidate)
        if (
            candidate
            and normalized_candidate not in {*GENERIC_CONFIRMATION_PHRASES, *REUSE_REFERENCE_PHRASES}
            and not re.search(r'\b(?:phone|email|address|status)\b', candidate, re.IGNORECASE)
        ):
            extracted['name'] = candidate

    return extracted


def _looks_like_location_creation_request(value: str) -> bool:
    normalized = _normalize(value)
    return bool(re.search(rf'\b{MASTER_CREATE_VERBS_PATTERN}\b.*\b{LOCATION_NOUNS_PATTERN}\b', normalized))
