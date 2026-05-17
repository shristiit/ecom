from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import asdict
import logging
import re
from time import perf_counter
from uuid import UUID

from conversational_engine.agents.parsing import extract_color_names, parse_size_labels
from conversational_engine.agents.executor import ExecutorAgent
from conversational_engine.agents.narrator import NarratorAgent
from conversational_engine.agents.planner import PlannerAgent
from conversational_engine.agents.reviewer import ReviewerAgent
from conversational_engine.agents.state_updater import StateUpdateAgent
from conversational_engine.audit.service import AuditService
from conversational_engine.clients.backend import BackendClient, BackendValidationError
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import PendingActionType, TextBlock, WorkflowStatus
from conversational_engine.keyword_sets import (
    COMPOUND_SEQUENCE_VERBS,
    GENERIC_CONFIRMATION_PHRASES,
    REUSE_REFERENCE_PHRASES,
    SIZE_LABEL_ALIASES,
)
from conversational_engine.memory.layered import LayeredMemoryService
from conversational_engine.providers.router import ProviderExhaustedError
from conversational_engine.retrieval.service import RetrievalService
from conversational_engine.runtime.contracts import RuntimeOutcome
from conversational_engine.runtime.commerce_matching import (
    match_customer,
    match_location,
    match_supplier,
    parse_po_lines,
    parse_sales_lines,
)
from conversational_engine.runtime.renderer import (
    render_clarification,
    render_confirmation_required,
    render_failure,
    render_navigation_blocks,
    render_tool_result,
)
from conversational_engine.runtime.state_update import (
    ROUTE_NAVIGATION,
    RuntimeStateUpdate,
    _extract_contact_create_entities,
    _extract_location_create_entities,
    apply_task_context,
    build_post_action_blocks,
    increment_clarification_count,
    mark_task_status,
    resolve_state_update,
    task_context_from_entities,
)
from conversational_engine.tools.catalog import SemanticToolCatalog
from conversational_engine.tools.catalog.resolvers import EntityResolver
from conversational_engine.tools.catalog.utils import ToolPreparationError
from conversational_engine.tools.validation import ToolSchemaValidationError
from conversational_engine.training.service import TrainingDataService

EventSink = Callable[[str, dict[str, object]], None]
logger = logging.getLogger(__name__)

_WRITE_TOOL_ENTITY_FIELDS: dict[str, tuple[str, ...]] = {
    'master.create_supplier': ('name', 'email', 'phone', 'address', 'status'),
    'master.create_customer': ('name', 'email', 'phone', 'address', 'status'),
    'master.create_location': ('name', 'code', 'type', 'address', 'status'),
    'purchasing.cancel_po': ('poId',),
    'purchasing.close_po': ('poId',),
    'purchasing.create_po': ('supplierId', 'expectedDate', 'lines'),
    'purchasing.receive_po': ('poId', 'locationId', 'lines'),
    'purchasing.update_po': ('poId', 'headerPatch', 'lines', 'lineOps'),
    'sales.cancel_invoice': ('invoiceId',),
    'sales.create_invoice': ('customerId', 'lines'),
    'sales.dispatch_invoice': ('invoiceId', 'locationId'),
    'sales.update_invoice': ('invoiceId', 'headerPatch', 'lines', 'lineOps'),
}
_WRITE_TOOL_REQUIRED_FIELDS: dict[str, tuple[str, ...]] = {
    'master.create_supplier': ('name',),
    'master.create_customer': ('name',),
    'master.create_location': ('name', 'code', 'type'),
    'purchasing.cancel_po': ('poId',),
    'purchasing.close_po': ('poId',),
    'purchasing.create_po': ('supplierId', 'lines'),
    'purchasing.receive_po': ('poId', 'locationId', 'lines'),
    'purchasing.update_po': ('poId',),
    'sales.cancel_invoice': ('invoiceId',),
    'sales.create_invoice': ('customerId', 'lines'),
    'sales.dispatch_invoice': ('invoiceId', 'locationId'),
    'sales.update_invoice': ('invoiceId',),
}
_COMPOUND_SEQUENCE_SPLIT_PATTERN = re.compile(
    r'\s*(?:,\s*)?(?:then|and then)\s+|\s*,?\s+and\s+(?=(?:'
    + '|'.join(re.escape(verb) for verb in COMPOUND_SEQUENCE_VERBS)
    + r')\b)',
    re.IGNORECASE,
)
_COMPOUND_SEQUENCE_ACTION_PATTERN = re.compile(
    r'^(?:' + '|'.join(re.escape(verb) for verb in COMPOUND_SEQUENCE_VERBS) + r')\b',
    re.IGNORECASE,
)


def _estimate_tokens(text: str) -> int:
    return max(1, (len(text.strip()) + 3) // 4)


def _has_meaningful_value(value: object) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict, tuple, set)):
        return bool(value)
    return True


def _is_generic_clarification_prompt(prompt: str) -> bool:
    normalized = ' '.join(prompt.strip().split()).lower()
    return normalized in {
        '',
        'please clarify your request.',
        'please clarify your request',
        'could you clarify what you need?',
        'could you clarify your request?',
    }


def _parse_iso_date_from_message(message: str) -> str | None:
    match = re.search(r'\b(20\d{2}-\d{2}-\d{2})\b', message)
    if not match:
        return None
    return match.group(1)


def _extract_quantity_change_ops(message: str) -> list[dict[str, object]]:
    ops: list[dict[str, object]] = []
    patterns = (
        re.compile(
            r'(?:change|update|adjust|set)\s+(?:the\s+)?quantity(?:\s+of)?\s+'
            r'(?P<sku>[A-Za-z0-9-]+)\s*/\s*(?P<size>[A-Za-z0-9]+)\s+(?:to|=)\s*(?P<qty>\d+)',
            re.IGNORECASE,
        ),
        re.compile(
            r'(?P<sku>[A-Za-z0-9-]+)\s*/\s*(?P<size>[A-Za-z0-9]+)\s+'
            r'(?:quantity\s+)?(?:to|=)\s*(?P<qty>\d+)',
            re.IGNORECASE,
        ),
    )
    for pattern in patterns:
        for match in pattern.finditer(message):
            ops.append(
                {
                    'op': 'change_qty',
                    'lineRef': {
                        'skuCode': match.group('sku').upper(),
                        'sizeLabel': match.group('size').upper(),
                    },
                    'qty': int(match.group('qty')),
                }
            )
        if ops:
            break
    return ops


def _extract_remove_line_ops(message: str) -> list[dict[str, object]]:
    ops: list[dict[str, object]] = []
    pattern = re.compile(
        r'(?:remove|removing|delete|deleting|drop|dropping)\s+(?:the\s+)?(?:line\s+)?'
        r'(?P<sku>[A-Za-z0-9-]+)\s*/\s*(?P<size>[A-Za-z0-9]+)\b',
        re.IGNORECASE,
    )
    for match in pattern.finditer(message):
        ops.append(
            {
                'op': 'remove',
                'lineRef': {
                    'skuCode': match.group('sku').upper(),
                    'sizeLabel': match.group('size').upper(),
                },
            }
        )
    return ops


def _message_implies_add_line(message: str) -> bool:
    return bool(re.search(r'\badd(?:\s+another)?\s+line\b|\badd\b', message, re.IGNORECASE))


def _merge_line_ops(
    existing_ops: object,
    new_ops: list[dict[str, object]],
) -> list[dict[str, object]]:
    merged_ops = [op for op in existing_ops if isinstance(op, dict)] if isinstance(existing_ops, list) else []
    for new_op in new_ops:
        new_name = str(new_op.get('op') or '')
        new_ref = new_op.get('lineRef')
        if new_name and isinstance(new_ref, dict):
            merged_ops = [
                existing_op
                for existing_op in merged_ops
                if not (
                    str(existing_op.get('op') or '') == new_name
                    and existing_op.get('lineRef') == new_ref
                )
            ]
        merged_ops.append(new_op)
    return merged_ops


def _extract_purchase_order_reference(message: str) -> str | None:
    patterns = (
        re.compile(
            r'\b(?:my\s+last|last|latest)\s+(?:purchase order|po)\s+for\s+[^,.;]+?(?=\s+(?:expected|status|with|from|to|at|change|update|cancel|close|receive|dispatch)\b|$)',
            re.IGNORECASE,
        ),
        re.compile(r'\b(?:my\s+last|last|latest)\s+(?:purchase order|po)\b', re.IGNORECASE),
        re.compile(r'\b(?:this|that)\s+(?:purchase order|po)\b', re.IGNORECASE),
        re.compile(r'\bpo[-\s]?\d+\b', re.IGNORECASE),
        re.compile(
            r'\b(?:purchase order|po)\s+for\s+([^,.;]+?)(?=\s+(?:expected|status|with|from|to|at|by|change|changing|update|updating|cancel|close|receive)\b|$)',
            re.IGNORECASE,
        ),
    )
    for pattern in patterns:
        match = pattern.search(message)
        if not match:
            continue
        if match.lastindex:
            return str(match.group(1)).strip()
        return match.group(0).strip()
    return None


def _extract_invoice_reference(message: str) -> str | None:
    patterns = (
        re.compile(
            r'\b(?:my\s+last|last|latest)\s+(?:sales order|invoice|so)\s+for\s+[^,.;]+?(?=\s+(?:from|to|at|status|with|by|change|changing|update|updating|cancel|dispatch|receive)\b|$)',
            re.IGNORECASE,
        ),
        re.compile(r'\b(?:my\s+last|last|latest)\s+(?:sales order|invoice|so)\b', re.IGNORECASE),
        re.compile(r'\b(?:this|that)\s+(?:sales order|invoice|so)\b', re.IGNORECASE),
        re.compile(r'\bso[-\s]?\d+\b', re.IGNORECASE),
        re.compile(
            r'\b(?:sales order|invoice|so)\s+for\s+([^,.;]+?)(?=\s+(?:from|to|at|status|with|by|change|changing|update|updating|cancel|dispatch)\b|$)',
            re.IGNORECASE,
        ),
    )
    for pattern in patterns:
        match = pattern.search(message)
        if not match:
            continue
        if match.lastindex:
            return str(match.group(1)).strip()
        return match.group(0).strip()
    return None


def _message_requests_same_details(message: str) -> bool:
    normalized = ' '.join(message.strip().lower().split())
    if normalized in {*GENERIC_CONFIRMATION_PHRASES, 'same', 'again'}:
        return True
    return any(phrase in normalized for phrase in REUSE_REFERENCE_PHRASES + ('same as last order', 'same as previous order'))


def _extract_order_product_reference(message: str) -> str | None:
    patterns = (
        re.compile(
            r'\b(?:purchase order|po|sales order|invoice|so)\s+for\s+(.+?)(?=\s+(?:from|to|at|with|for|qty|quantity|size|color|colour|@)\b|[.?!]|$)',
            re.IGNORECASE,
        ),
        re.compile(
            r'\bfor\s+(.+?)(?=\s+(?:from|to|at|with|qty|quantity|size|color|colour|@)\b|[.?!]|$)',
            re.IGNORECASE,
        ),
    )
    for pattern in patterns:
        match = pattern.search(message)
        if match:
            candidate = str(match.group(1)).strip(' ,.;')
            if candidate:
                return candidate
    return None


_ORDINAL_LINE_INDEX: dict[str, int] = {
    '1st': 0,
    'first': 0,
    '2nd': 1,
    'second': 1,
    '3rd': 2,
    'third': 2,
    '4th': 3,
    'fourth': 3,
    '5th': 4,
    'fifth': 4,
    'last': -1,
}

def _extract_ordinal_line_quantity_change(message: str) -> tuple[int, int] | None:
    patterns = (
        re.compile(
            r'(?:change|changing|update|updating|adjust|adjusting|set|setting)\s+(?:the\s+)?(?P<ordinal>1st|first|2nd|second|3rd|third|4th|fourth|5th|fifth|last)\s+line(?:\s+quantity)?\s+(?:to|=)\s*(?P<qty>\d+)',
            re.IGNORECASE,
        ),
        re.compile(
            r'(?:change|changing|update|updating|adjust|adjusting|set|setting)\s+quantity(?:\s+of)?\s+(?:the\s+)?(?P<ordinal>1st|first|2nd|second|3rd|third|4th|fourth|5th|fifth|last)\s+line\s+(?:to|=)\s*(?P<qty>\d+)',
            re.IGNORECASE,
        ),
    )
    for pattern in patterns:
        match = pattern.search(message)
        if not match:
            continue
        ordinal = match.group('ordinal').lower()
        return _ORDINAL_LINE_INDEX[ordinal], int(match.group('qty'))
    return None


def _extract_ordinal_line_remove(message: str) -> int | None:
    match = re.search(
        r'(?:remove|removing|delete|deleting|drop|dropping)\s+(?:the\s+)?(?P<ordinal>1st|first|2nd|second|3rd|third|4th|fourth|5th|fifth|last)\s+line\b',
        message,
        re.IGNORECASE,
    )
    if not match:
        return None
    return _ORDINAL_LINE_INDEX[match.group('ordinal').lower()]


def _extract_line_size_label_reference(message: str) -> str | None:
    lowered = message.lower()
    if 'line' not in lowered:
        return None
    for alias, label in SIZE_LABEL_ALIASES:
        if re.search(rf'\b{re.escape(alias)}\b', lowered, re.IGNORECASE):
            return label
    return None


def _extract_line_quantity_value(message: str) -> int | None:
    patterns = (
        re.compile(
            r'(?:change|changing|update|updating|adjust|adjusting|set|setting)\s+(?:the\s+)?(?:[a-z]+\s+)*line(?:\s+quantity)?\s+(?:to|=)\s*(?P<qty>\d+)',
            re.IGNORECASE,
        ),
        re.compile(
            r'(?:change|changing|update|updating|adjust|adjusting|set|setting)\s+quantity(?:\s+of)?\s+(?:the\s+)?(?:[a-z]+\s+)*line\s+(?:to|=)\s*(?P<qty>\d+)',
            re.IGNORECASE,
        ),
    )
    for pattern in patterns:
        match = pattern.search(message)
        if match:
            return int(match.group('qty'))
    return None


def _message_implies_remove_line(message: str) -> bool:
    return bool(
        re.search(r'\b(?:remove|removing|delete|deleting|drop|dropping)\b', message, re.IGNORECASE)
        and 'line' in message.lower()
    )


def _canonical_po_line_signature(line: dict[str, object]) -> tuple[str, int, int] | None:
    size_id = str(line.get('sizeId') or line.get('skuId') or '').strip()
    if not size_id:
        return None
    raw_qty = line.get('qty', line.get('qtyOrdered'))
    raw_cost = line.get('unitCost')
    if raw_qty is None or raw_cost is None:
        return None
    try:
        return (size_id, int(raw_qty), int(raw_cost))
    except (TypeError, ValueError):
        return None


def _normalize_size_label(value: object) -> str | None:
    raw = str(value or '').strip()
    if not raw:
        return None
    lowered = raw.lower()
    for alias, label in SIZE_LABEL_ALIASES:
        if lowered == alias:
            return label
    return raw.upper()


def _extract_follow_up_quantity(message: str) -> int | None:
    patterns = (
        re.compile(r'\bx\s*(?P<qty>\d+)\b', re.IGNORECASE),
        re.compile(r'(?:^|[\s,;])[-=]\s*(?P<qty>\d+)\b'),
        re.compile(r'\bquantity\s*(?:is|to|=)?\s*(?P<qty>\d+)\b', re.IGNORECASE),
        re.compile(r'\b(?P<qty>\d+)\s*(?:items?|units?|pcs?|pieces?)\b', re.IGNORECASE),
    )
    for pattern in patterns:
        match = pattern.search(message)
        if match:
            return int(match.group('qty'))
    return None


def _extract_follow_up_unit_value(message: str) -> int | None:
    patterns = (
        re.compile(r'@\s*(?P<value>\d+)\b'),
        re.compile(r'\b(?:unit\s+)?(?:cost|price)\s*(?:is|to|=|at)?\s*(?P<value>\d+)\b', re.IGNORECASE),
    )
    for pattern in patterns:
        match = pattern.search(message)
        if match:
            return int(match.group('value'))
    normalized = ' '.join(message.strip().split())
    if re.fullmatch(r'\d+', normalized):
        return int(normalized)
    return None


def _extract_follow_up_size_label(message: str, available_sizes: list[str]) -> str | None:
    lowered = message.lower()
    normalized_available = {_normalize_size_label(size) for size in available_sizes}
    for alias, label in SIZE_LABEL_ALIASES:
        if label not in normalized_available:
            continue
        if re.search(rf'\b{re.escape(alias)}\b', lowered, re.IGNORECASE):
            return label
    return None


def _extract_follow_up_color_name(message: str, available_colors: list[str]) -> str | None:
    lowered = message.lower()
    for color in available_colors:
        normalized = str(color).strip()
        if not normalized:
            continue
        if re.search(rf'\b{re.escape(normalized.lower())}\b', lowered, re.IGNORECASE):
            return normalized
    return None


def _merge_single_line_patch(
    existing_lines: object,
    line_patch: dict[str, object],
) -> list[dict[str, object]] | None:
    if not line_patch:
        return None
    lines = [dict(line) for line in existing_lines if isinstance(line, dict)] if isinstance(existing_lines, list) else []
    if not lines:
        return [line_patch]
    if len(lines) != 1:
        return None
    merged_line = dict(lines[0])
    merged_line.update(line_patch)
    return [merged_line]


def _extract_grouped_variant_lines(
    *,
    message: str,
    product_name: str,
    available_colors: list[str],
    available_sizes: list[str],
    unit_cost: int | None,
) -> list[dict[str, object]]:
    clauses = [part.strip(' ,;') for part in re.split(r'[.\n;]+', message) if part.strip(' ,;')]
    if not clauses:
        return []

    normalized_sizes = {_normalize_size_label(size) for size in available_sizes}
    lines: list[dict[str, object]] = []
    for clause in clauses:
        color_name = _extract_follow_up_color_name(clause, available_colors)
        quantity = _extract_follow_up_quantity(clause)
        if not color_name or quantity is None:
            continue

        matched_sizes: list[str] = []
        lowered = clause.lower()
        for alias, label in SIZE_LABEL_ALIASES:
            if label not in normalized_sizes:
                continue
            if re.search(rf'\b{re.escape(alias)}\b', lowered, re.IGNORECASE) and label not in matched_sizes:
                matched_sizes.append(label)

        if not matched_sizes:
            continue

        for size_label in matched_sizes:
            line: dict[str, object] = {
                'productName': product_name,
                'colorName': color_name,
                'sizeLabel': size_label,
                'quantity': quantity,
            }
            if unit_cost is not None:
                line['unitCost'] = unit_cost
            lines.append(line)

    return lines


class AgentRuntimeService:
    def __init__(
        self,
        *,
        backend_client: BackendClient,
        planner: PlannerAgent,
        executor: ExecutorAgent,
        reviewer: ReviewerAgent,
        narrator: NarratorAgent,
        state_updater: StateUpdateAgent | None = None,
        audit_service: AuditService | None = None,
        memory_service: LayeredMemoryService,
        training_data_service: TrainingDataService,
        retrieval_service: RetrievalService,
    ) -> None:
        self._backend_client = backend_client
        self._planner = planner
        self._executor = executor
        self._reviewer = reviewer
        self._state_updater = state_updater
        self._narrator = narrator
        self._audit_service = audit_service
        self._memory_service = memory_service
        self._training_data_service = training_data_service
        self._retrieval_service = retrieval_service

    async def execute(
        self,
        *,
        auth: AuthContext,
        conversation_id: UUID,
        workflow_id: UUID,
        user_message: str,
        extracted_entities: dict[str, object],
        recent_messages: list[dict[str, object]],
        workflow_status: WorkflowStatus | None,
        emit: EventSink,
        run_id: UUID,
        image_data_urls: tuple[str, ...] = (),
    ) -> RuntimeOutcome:
        queued_message, queued_entities = self._start_compound_sequence(
            user_message=user_message,
            extracted_entities=extracted_entities,
            workflow_status=workflow_status,
        )
        user_message = queued_message
        extracted_entities = queued_entities
        tool_history: list[dict[str, object]] = []
        catalog = SemanticToolCatalog(
            backend=self._backend_client,
            auth=auth,
            context_entities=extracted_entities,
        )
        usage_entries: list[dict[str, object]] = []
        trace_tasks: list[asyncio.Task[None]] = []

        await self._backend_client.check_ai_usage_quota(
            access_token=auth.access_token or '',
            tenant_id=auth.tenant_id,
            requested_tokens=_estimate_tokens(user_message),
        )

        try:
            state_update = await self._run_state_update(
                user_message=user_message,
                extracted_entities=extracted_entities,
                recent_messages=recent_messages,
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                emit=emit,
            )
            current_entities = state_update.extracted_entities

            if self._should_bypass_tool_planning_for_ambiguous_message(
                user_message=user_message,
                state_update=state_update,
            ):
                message = await self._write_narrator_message(
                    emit=emit,
                    conversation_id=conversation_id,
                    workflow_id=workflow_id,
                    route=state_update.primary_route,
                    intent=state_update.primary_intent,
                    user_message=user_message,
                    directive=self._conversational_response_directive(user_message),
                    supporting_context={
                        'classification': 'ambiguous_conversational_turn',
                        'confidence': state_update.confidence,
                    },
                    fallback_message='How can I help?',
                )
                emit('assistant.message.delta', {'content': message})
                return RuntimeOutcome(
                    blocks=render_tool_result(message, 'assistant.response', {}),
                    status=WorkflowStatus.COMPLETED,
                    current_task='response_completed',
                    extracted_entities=mark_task_status(current_entities, 'completed'),
                )

            if state_update.primary_intent == 'off_topic':
                message = (
                    'I can help with inventory, products, purchasing, sales orders, suppliers, customers, and reports.'
                )
                return RuntimeOutcome(
                    blocks=render_tool_result(message, 'assistant.response', {}),
                    status=WorkflowStatus.COMPLETED,
                    current_task='off_topic_redirected',
                    extracted_entities=mark_task_status(current_entities, 'completed'),
                )

            for post_action in state_update.new_post_actions:
                route = post_action.get('route')
                emit(
                    'post_action.queued',
                    self._event_payload(
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        status='queued',
                        extra={
                            'postActionType': str(post_action.get('type') or ''),
                            'label': str(route.get('label') or '') if isinstance(route, dict) else '',
                        },
                    ),
                )

            direct_confirmation_outcome = await self._handle_confirmation_edit(
                auth=auth,
                user_message=user_message,
                workflow_status=workflow_status,
                workflow_id=workflow_id,
                conversation_id=conversation_id,
                current_entities=current_entities,
                state_update=state_update,
                emit=emit,
            )
            if direct_confirmation_outcome is not None:
                return direct_confirmation_outcome
            direct_clarification_outcome = await self._handle_clarification_reply(
                auth=auth,
                user_message=user_message,
                workflow_status=workflow_status,
                workflow_id=workflow_id,
                conversation_id=conversation_id,
                current_entities=current_entities,
                state_update=state_update,
                emit=emit,
            )
            if direct_clarification_outcome is not None:
                return direct_clarification_outcome

            if state_update.primary_route == ROUTE_NAVIGATION:
                route_blocks = render_navigation_blocks(
                    build_post_action_blocks([{'route': row} for row in state_update.navigation_rows]),
                )
                navigation_entities = mark_task_status(current_entities, 'completed')
                return RuntimeOutcome(
                    blocks=[
                        TextBlock(content='Opening the requested screen.'),
                        *route_blocks,
                    ],
                    status=WorkflowStatus.COMPLETED,
                    current_task='navigation_completed',
                    extracted_entities=navigation_entities,
                )

            memory = await self._memory_service.build(
                auth=auth,
                workflow_id=str(workflow_id),
                conversation_id=str(conversation_id),
                workflow_status=workflow_status.value if workflow_status else None,
                current_task=str(current_entities.get('currentTask') or state_update.primary_intent or ''),
                recent_messages=recent_messages,
                extracted_entities=current_entities,
                missing_fields=list(current_entities.get('missingFields') or []),
            )

            for iteration in range(3):
                def record_trace(agent_role: str, current_iteration: int):
                    def _record(_role: str, trace) -> None:
                        payload = {
                            'attempts': [asdict(attempt) for attempt in trace.attempts],
                            'response': trace.response.raw_payload if trace.response else {},
                        }
                        provider_name = trace.response.provider_name if trace.response else 'unavailable'
                        model_name = trace.response.model_name if trace.response else 'unavailable'
                        for attempt in trace.attempts:
                            emit(
                                'fallback.used',
                                self._event_payload(
                                    conversation_id=conversation_id,
                                    workflow_id=workflow_id,
                                    phase=agent_role,
                                    route=state_update.primary_route,
                                    intent=state_update.primary_intent,
                                    status='fallback',
                                    extra={
                                        'fromPhase': agent_role,
                                        'toPhase': provider_name,
                                        'provider': attempt.provider_name,
                                        'attempt': attempt.model_name,
                                        'reason': attempt.error,
                                    },
                                ),
                            )
                        if trace.response and trace.response.raw_payload:
                            usage_entries.append(
                                {
                                    'provider': provider_name,
                                    'model': model_name,
                                    'rawPayload': trace.response.raw_payload,
                                }
                            )
                        trace_tasks.append(
                            asyncio.create_task(
                                self._training_data_service.record_trace(
                                    tenant_id=auth.tenant_id,
                                    run_id=run_id,
                                    conversation_id=conversation_id,
                                    workflow_id=workflow_id,
                                    agent_role=agent_role,
                                    provider_name=provider_name,
                                    model_name=model_name,
                                    stage=f'{agent_role}_iteration_{current_iteration + 1}',
                                    payload=payload,
                                )
                            )
                        )

                    return _record

                plan = await self._run_phase(
                    emit=emit,
                    conversation_id=conversation_id,
                    workflow_id=workflow_id,
                    phase='planning',
                    route=state_update.primary_route,
                    intent=state_update.primary_intent,
                    action=lambda: self._planner.plan(
                        user_message=state_update.planner_message,
                        memory={
                            'session': memory.session_memory,
                            'workflow': memory.workflow_memory,
                            'recentMessages': memory.recent_messages,
                            'latestSummary': memory.latest_summary,
                            'recentEntities': memory.recent_entities,
                            'businessMemory': memory.business_memory,
                            'userMemory': memory.user_memory,
                            'semanticMemory': memory.semantic_memory,
                        },
                        tools=self._schema_catalog_for_state(catalog, state_update),
                        history=tool_history,
                        image_data_urls=image_data_urls if iteration == 0 else (),
                        trace_callback=record_trace('planner', iteration),
                    ),
                )
                emit(
                    'plan.updated',
                    self._event_payload(
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        phase='planning',
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        extra={
                            'iteration': iteration + 1,
                            'goal': plan.get('goal'),
                            'action': plan.get('action'),
                            'reasoning': plan.get('reasoning'),
                        },
                    ),
                )

                if plan.get('action') == 'clarify':
                    question_prompt, required = self._clarification_prompt_and_required(
                        primary_intent=state_update.primary_intent,
                        suggested_prompt=plan.get('clarificationQuestion'),
                        suggested_required=plan.get('requiredInputs'),
                    )
                    question = await self._write_narrator_message(
                        emit=emit,
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        user_message=state_update.planner_message,
                        directive=question_prompt,
                        supporting_context={
                            'requiredInputs': required,
                            'goal': plan.get('goal'),
                        },
                        fallback_message=question_prompt,
                        trace_callback=record_trace('narrator', iteration),
                    )
                    emit('assistant.message.delta', {'content': question})
                    emit(
                        'clarification.requested',
                        self._event_payload(
                            conversation_id=conversation_id,
                            workflow_id=workflow_id,
                            route=state_update.primary_route,
                            intent=state_update.primary_intent,
                            missing_fields=required,
                            status='needs_input',
                        ),
                    )
                    next_entities = self._clarification_entities(current_entities, required)
                    return RuntimeOutcome(
                        blocks=render_clarification(question, required),
                        status=WorkflowStatus.NEEDS_INPUT,
                        current_task='clarification_requested',
                        extracted_entities=next_entities,
                        missing_fields=required,
                    )

                if plan.get('action') == 'respond':
                    fallback_message = str(plan.get('goal') or 'The request is complete.')
                    response_text = await self._write_narrator_message(
                        emit=emit,
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        user_message=state_update.planner_message,
                        directive=fallback_message,
                        supporting_context={'reasoning': plan.get('reasoning')},
                        fallback_message=fallback_message,
                        trace_callback=record_trace('narrator', iteration),
                    )
                    emit('assistant.message.delta', {'content': response_text})
                    return RuntimeOutcome(
                        blocks=render_tool_result(response_text, 'assistant.response', {}),
                        status=WorkflowStatus.COMPLETED,
                        current_task='response_completed',
                        extracted_entities=mark_task_status(current_entities, 'completed'),
                    )

                proposal = await self._run_phase(
                    emit=emit,
                    conversation_id=conversation_id,
                    workflow_id=workflow_id,
                    phase='proposal',
                    route=state_update.primary_route,
                    intent=state_update.primary_intent,
                    action=lambda: self._executor.propose(
                        user_message=state_update.planner_message,
                        plan=plan,
                        tools=self._schema_catalog_for_state(catalog, state_update),
                        history=tool_history,
                        expected_tool_name=state_update.primary_intent or None,
                        trace_callback=record_trace('executor', iteration),
                    ),
                )
                emit(
                    'agent.selected',
                    self._event_payload(
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        phase='proposal',
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        extra={
                            'role': 'executor',
                            'action': proposal.get('action'),
                            'toolName': proposal.get('toolName'),
                        },
                    ),
                )

                if proposal.get('action') == 'clarify':
                    question_prompt, required = self._clarification_prompt_and_required(
                        primary_intent=state_update.primary_intent,
                        suggested_prompt=proposal.get('assistantMessage'),
                        suggested_required=proposal.get('requiredInputs'),
                    )
                    question = await self._write_narrator_message(
                        emit=emit,
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        user_message=state_update.planner_message,
                        directive=question_prompt,
                        supporting_context={
                            'requiredInputs': required,
                            'plan': plan,
                        },
                        fallback_message=question_prompt,
                        trace_callback=record_trace('narrator', iteration),
                    )
                    emit('assistant.message.delta', {'content': question})
                    emit(
                        'clarification.requested',
                        self._event_payload(
                            conversation_id=conversation_id,
                            workflow_id=workflow_id,
                            route=state_update.primary_route,
                            intent=state_update.primary_intent,
                            missing_fields=required,
                            status='needs_input',
                        ),
                    )
                    next_entities = self._clarification_entities(current_entities, required)
                    return RuntimeOutcome(
                        blocks=render_clarification(question, required),
                        status=WorkflowStatus.NEEDS_INPUT,
                        current_task='clarification_requested',
                        extracted_entities=next_entities,
                        missing_fields=required,
                    )

                if proposal.get('action') == 'respond':
                    fallback_message = str(proposal.get('assistantMessage') or 'The request is complete.')
                    response_text = await self._write_narrator_message(
                        emit=emit,
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        user_message=state_update.planner_message,
                        directive=fallback_message,
                        supporting_context={'plan': plan},
                        fallback_message=fallback_message,
                        trace_callback=record_trace('narrator', iteration),
                    )
                    emit('assistant.message.delta', {'content': response_text})
                    return RuntimeOutcome(
                        blocks=render_tool_result(response_text, 'assistant.response', {}),
                        status=WorkflowStatus.COMPLETED,
                        current_task='response_completed',
                        extracted_entities=mark_task_status(current_entities, 'completed'),
                    )

                tool_name = str(proposal.get('toolName') or '')
                tool_arguments = proposal.get('toolArguments')
                if isinstance(tool_arguments, dict):
                    tool_arguments = self._sanitize_tool_arguments(
                        tool_name=tool_name,
                        tool_arguments=tool_arguments,
                        current_entities=current_entities,
                    )
                if (
                    not tool_name
                    or not isinstance(tool_arguments, dict)
                    or self._tool_arguments_need_clarification(tool_name=tool_name, tool_arguments=tool_arguments)
                ):
                    recovered = await self._recover_sparse_mutation_payload(
                        auth=auth,
                        user_message=user_message,
                        primary_intent=state_update.primary_intent,
                        current_entities=current_entities,
                    )
                    if recovered is not None:
                        tool_name, tool_arguments = recovered
                    else:
                        logger.error('Invalid executor proposal: %s', proposal)
                        prompt, required = self._fallback_clarification_for_intent(state_update.primary_intent)
                        return RuntimeOutcome(
                            blocks=render_clarification(prompt, required),
                            status=WorkflowStatus.NEEDS_INPUT,
                            current_task='tool_call_invalid',
                            extracted_entities=self._clarification_entities(current_entities, required),
                            missing_fields=required,
                        )

                if (
                    not tool_name
                    or not isinstance(tool_arguments, dict)
                    or self._tool_arguments_need_clarification(tool_name=tool_name, tool_arguments=tool_arguments)
                ):
                    logger.error('Invalid executor proposal: %s', proposal)
                    prompt, required = self._fallback_clarification_for_intent(state_update.primary_intent)
                    return RuntimeOutcome(
                        blocks=render_clarification(prompt, required),
                        status=WorkflowStatus.NEEDS_INPUT,
                        current_task='tool_call_invalid',
                        extracted_entities=self._clarification_entities(current_entities, required),
                        missing_fields=required,
                    )

                emit(
                    'tool.called',
                    self._event_payload(
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        phase='execution',
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        tool_name=tool_name,
                        extra={'arguments': tool_arguments},
                    ),
                )
                tool = catalog.get(tool_name)
                if tool is None:
                    return RuntimeOutcome(
                        blocks=render_failure(f'Unknown tool selected by AI runtime: {tool_name}'),
                        status=WorkflowStatus.FAILED,
                        current_task='tool_unknown',
                        extracted_entities=mark_task_status(current_entities, 'failed'),
                    )

                if tool.side_effect:
                    return await self._prepare_confirmation(
                        auth=auth,
                        catalog=catalog,
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        state_update=state_update,
                        current_entities=current_entities,
                        tool_name=tool_name,
                        tool_arguments=tool_arguments,
                        message_hint=str(
                            proposal.get('assistantMessage')
                            or f'Prepared {tool_name.replace(".", " ")}. Review the details before continuing.'
                        ),
                        emit=emit,
                    )

                try:
                    catalog.validate(tool_name, tool_arguments)
                except ToolSchemaValidationError as exc:
                    return self._clarification_outcome_from_schema_error(
                        current_entities=current_entities,
                        required=exc.required_fields,
                        prompt=exc.prompt,
                    )

                try:
                    tool_result = await self._run_phase(
                        emit=emit,
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        phase='execution',
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        tool_name=tool_name,
                        action=lambda: catalog.invoke(tool_name, tool_arguments),
                    )
                except BackendValidationError as exc:
                    last_error = exc.user_message
                    emit(
                        'tool.error',
                        self._event_payload(
                            conversation_id=conversation_id,
                            workflow_id=workflow_id,
                            phase='execution',
                            route=state_update.primary_route,
                            intent=state_update.primary_intent,
                            tool_name=tool_name,
                            status='failed',
                            extra={'error': last_error},
                        ),
                    )
                    tool_history.append(
                        {
                            'plan': plan,
                            'proposal': proposal,
                            'toolError': last_error,
                            'errorType': 'backend_validation',
                        }
                    )
                    if iteration < 2:
                        continue
                    return RuntimeOutcome(
                        blocks=render_failure(last_error),
                        status=WorkflowStatus.FAILED,
                        current_task='tool_validation_failed',
                        extracted_entities=mark_task_status(current_entities, 'failed'),
                    )
                except Exception as exc:
                    emit(
                        'tool.failed',
                        self._event_payload(
                            conversation_id=conversation_id,
                            workflow_id=workflow_id,
                            phase='execution',
                            route=state_update.primary_route,
                            intent=state_update.primary_intent,
                            tool_name=tool_name,
                            status='failed',
                            extra={'error': str(exc)},
                        ),
                    )
                    raise

                emit(
                    'tool.succeeded',
                    self._event_payload(
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        phase='execution',
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        tool_name=tool_name,
                        status='completed',
                    ),
                )
                await self._record_audit_event(
                    auth=auth,
                    conversation_id=conversation_id,
                    workflow_id=workflow_id,
                    event_type='tool_executed',
                    tool_name=tool_name,
                    payload={
                        'route': state_update.primary_route,
                        'intent': state_update.primary_intent,
                        'toolArguments': tool_arguments,
                        'toolResult': tool_result,
                    },
                )

                review = await self._run_phase(
                    emit=emit,
                    conversation_id=conversation_id,
                    workflow_id=workflow_id,
                    phase='review',
                    route=state_update.primary_route,
                    intent=state_update.primary_intent,
                    tool_name=tool_name,
                    action=lambda: self._reviewer.review(
                        user_message=state_update.planner_message,
                        plan=plan,
                        proposal=proposal,
                        tool_result=tool_result,
                        history=tool_history,
                        trace_callback=record_trace('reviewer', iteration),
                    ),
                )

                tool_history.append({'plan': plan, 'proposal': proposal, 'toolResult': tool_result, 'review': review})

                if review.get('action') == 'clarify':
                    question_prompt, required = self._clarification_prompt_and_required(
                        primary_intent=state_update.primary_intent,
                        suggested_prompt=review.get('assistantMessage'),
                        suggested_required=review.get('requiredInputs'),
                    )
                    question = await self._write_narrator_message(
                        emit=emit,
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        user_message=state_update.planner_message,
                        directive=question_prompt,
                        supporting_context={'requiredInputs': required},
                        fallback_message=question_prompt,
                        trace_callback=record_trace('narrator', iteration),
                    )
                    emit('assistant.message.delta', {'content': question})
                    emit(
                        'clarification.requested',
                        self._event_payload(
                            conversation_id=conversation_id,
                            workflow_id=workflow_id,
                            route=state_update.primary_route,
                            intent=state_update.primary_intent,
                            missing_fields=required,
                            status='needs_input',
                        ),
                    )
                    next_entities = self._clarification_entities(current_entities, required)
                    return RuntimeOutcome(
                        blocks=render_clarification(question, required),
                        status=WorkflowStatus.NEEDS_INPUT,
                        current_task='clarification_requested',
                        extracted_entities=next_entities,
                        missing_fields=required,
                    )

                if review.get('action') == 'complete':
                    if self._tool_result_has_no_matches(tool_result):
                        return RuntimeOutcome(
                            blocks=render_tool_result("I couldn't find any matches.", tool_name, tool_result),
                            status=WorkflowStatus.COMPLETED,
                            current_task='completed',
                            extracted_entities=mark_task_status(
                                {
                                    **current_entities,
                                    'lastToolName': tool_name,
                                },
                                'completed',
                                clear_post_actions=True,
                            ),
                        )
                    fallback_message = str(review.get('assistantMessage') or proposal.get('assistantMessage') or 'Done.')
                    message = await self._write_narrator_message(
                        emit=emit,
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        tool_name=tool_name,
                        user_message=state_update.planner_message,
                        directive=fallback_message,
                        supporting_context={
                            'toolName': tool_name,
                            'toolResult': tool_result,
                        },
                        fallback_message=fallback_message,
                        trace_callback=record_trace('narrator', iteration),
                    )
                    emit('assistant.message.delta', {'content': message})
                    post_action_blocks = render_navigation_blocks(
                        build_post_action_blocks(task_context_from_entities(current_entities).get('postActions') or []),
                    )
                    for route_block in post_action_blocks:
                        emit(
                            'post_action.executed',
                            self._event_payload(
                                conversation_id=conversation_id,
                                workflow_id=workflow_id,
                                phase='render',
                                route=state_update.primary_route,
                                intent=state_update.primary_intent,
                                status='completed',
                                extra={'label': getattr(route_block, 'label', '')},
                            ),
                        )
                    completed_entities = self._merge_context_from_tool_interaction(
                        current_entities=current_entities,
                        tool_name=tool_name,
                        tool_arguments=tool_arguments,
                        tool_result=tool_result,
                        resolved_entities=review.get('resolvedEntities'),
                    )
                    return RuntimeOutcome(
                        blocks=[
                            *render_tool_result(
                                message,
                                tool_name,
                                tool_result,
                                include_table=bool(review.get('includeTable')),
                            ),
                            *post_action_blocks,
                        ],
                        status=WorkflowStatus.COMPLETED,
                        current_task='completed',
                        extracted_entities=mark_task_status(
                            {
                                **completed_entities,
                                'lastToolName': tool_name,
                            },
                            'completed',
                            clear_post_actions=True,
                        ),
                    )

            return RuntimeOutcome(
                blocks=render_failure('The AI runtime reached its planning limit before completing the task.'),
                status=WorkflowStatus.FAILED,
                current_task='iteration_limit_reached',
                extracted_entities=mark_task_status(current_entities, 'failed'),
            )
        except Exception:
            logger.exception('AI runtime failed for conversation %s workflow %s', conversation_id, workflow_id)
            return RuntimeOutcome(
                blocks=render_failure('The AI runtime could not complete this request.'),
                status=WorkflowStatus.FAILED,
                current_task='runtime_error',
                extracted_entities=mark_task_status(extracted_entities, 'failed'),
            )
        finally:
            if trace_tasks:
                await asyncio.gather(*trace_tasks, return_exceptions=True)
            if usage_entries:
                try:
                    await self._backend_client.record_ai_usage(
                        access_token=auth.access_token or '',
                        tenant_id=auth.tenant_id,
                        entries=usage_entries,
                    )
                except Exception:
                    logger.exception(
                        'failed to record exact ai usage for conversation %s workflow %s',
                        conversation_id,
                        workflow_id,
                    )

    async def _run_state_update(
        self,
        *,
        user_message: str,
        extracted_entities: dict[str, object],
        recent_messages: list[dict[str, object]],
        conversation_id: UUID,
        workflow_id: UUID,
        emit: EventSink,
    ) -> RuntimeStateUpdate:
        emit(
            'phase.started',
            self._event_payload(
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                phase='state_update',
            ),
        )
        started = perf_counter()
        state_update = await resolve_state_update(
            user_message=user_message,
            extracted_entities=extracted_entities,
            recent_messages=recent_messages,
            retrieval_service=self._retrieval_service,
            state_updater=self._state_updater,
        )
        emit(
            'phase.completed',
            self._event_payload(
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                phase='state_update',
                route=state_update.primary_route,
                intent=state_update.primary_intent,
                confidence=state_update.confidence,
                rationale=state_update.rationale,
                latency_ms=(perf_counter() - started) * 1000,
            ),
        )
        emit(
            'route.resolved',
            self._event_payload(
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                phase='state_update',
                route=state_update.primary_route,
                intent=state_update.primary_intent,
                confidence=state_update.confidence,
                rationale=state_update.rationale,
                status='resolved',
                extra={
                    'primaryRoute': state_update.primary_route,
                    'primaryIntent': state_update.primary_intent,
                    'usedMemory': state_update.used_memory,
                    'isWorkflowEdit': state_update.is_workflow_edit,
                },
            ),
        )
        return state_update

    async def _handle_confirmation_edit(
        self,
        *,
        auth: AuthContext,
        user_message: str,
        workflow_status: WorkflowStatus | None,
        workflow_id: UUID,
        conversation_id: UUID,
        current_entities: dict[str, object],
        state_update: RuntimeStateUpdate,
        emit: EventSink,
    ) -> RuntimeOutcome | None:
        if workflow_status not in {WorkflowStatus.AWAITING_CONFIRMATION, WorkflowStatus.AWAITING_APPROVAL}:
            return None
        tool_name = str(current_entities.get('toolName') or '')
        execution_payload = current_entities.get('executionPayload')
        if not tool_name or not isinstance(execution_payload, dict):
            return None
        if not state_update.is_workflow_edit and not state_update.new_post_actions:
            return None

        preview = current_entities.get('preview')
        preview_arguments = preview.get('arguments') if isinstance(preview, dict) else None
        if isinstance(preview_arguments, dict):
            updated_payload = dict(preview_arguments)
            if 'locationId' not in updated_payload and execution_payload.get('locationId') is not None:
                updated_payload['locationId'] = execution_payload['locationId']
            if 'fromLocationId' not in updated_payload and execution_payload.get('fromLocationId') is not None:
                updated_payload['fromLocationId'] = execution_payload['fromLocationId']
            if 'toLocationId' not in updated_payload and execution_payload.get('toLocationId') is not None:
                updated_payload['toLocationId'] = execution_payload['toLocationId']
        else:
            updated_payload = dict(execution_payload)
        task_entities = state_update.task_context.get('entities')
        if isinstance(task_entities, dict):
            for key, value in task_entities.items():
                if key in {
                    'allColors',
                    'allSizes',
                    'colorNames',
                    'color',
                    'quantity',
                    'fromLocationId',
                    'toLocationId',
                    'lines',
                    'locationId',
                    'productName',
                    'colorName',
                    'availability',
                    'threshold',
                    'groupBy',
                    'matchAllSizes',
                    'excludeSize',
                    'minColorCount',
                    'maxColorCount',
                    'maxInStockSizeCount',
                    'sizeLabel',
                    'size',
                    'sizes',
                    'sizeLabels',
                    'sku',
                    'reason',
                } and value is not None:
                    updated_payload[key] = value
            updated_payload = self._merge_follow_up_entities_into_payload(
                tool_name=tool_name,
                updated_payload=updated_payload,
                task_entities=task_entities,
            )
        if tool_name == 'purchasing.create_po':
            updated_payload = self._reuse_last_po_lines_from_context(
                user_message=user_message,
                current_entities=current_entities,
                merged_payload=updated_payload,
            )
        updated_payload = await self._merge_direct_follow_up_payload(
            auth=auth,
            user_message=user_message,
            tool_name=tool_name,
            updated_payload=updated_payload,
        )

        planner_text = state_update.planner_message.lower()
        if tool_name == 'inventory.receive_stock':
            if 'all sizes' in planner_text or 'every size' in planner_text:
                updated_payload['allSizes'] = True
                updated_payload.pop('sizeLabel', None)
                updated_payload.pop('sizeId', None)
            if 'all colors' in planner_text or 'every color' in planner_text:
                updated_payload['allColors'] = True
                updated_payload.pop('colorName', None)
                updated_payload.pop('sizeId', None)

        summary_suffix = ''
        if state_update.new_post_actions:
            route = state_update.new_post_actions[0].get('route')
            if isinstance(route, dict):
                summary_suffix = f' After success, I will open {route.get("label") or route.get("href")}.'

        emit(
            'clarification.resolved',
            self._event_payload(
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                route=state_update.primary_route,
                intent=state_update.primary_intent,
                status='updated',
            ),
        )
        return await self._prepare_confirmation(
            auth=auth,
            catalog=SemanticToolCatalog(
                backend=self._backend_client,
                auth=auth,
                context_entities=current_entities,
            ),
            conversation_id=conversation_id,
            workflow_id=workflow_id,
            state_update=state_update,
            current_entities=current_entities,
            tool_name=tool_name,
            tool_arguments=updated_payload,
            message_hint=f'Updated the draft with your latest changes.{summary_suffix}'.strip(),
            emit=emit,
        )

    async def _handle_clarification_reply(
        self,
        *,
        auth: AuthContext,
        user_message: str,
        workflow_status: WorkflowStatus | None,
        workflow_id: UUID,
        conversation_id: UUID,
        current_entities: dict[str, object],
        state_update: RuntimeStateUpdate,
        emit: EventSink,
    ) -> RuntimeOutcome | None:
        if workflow_status != WorkflowStatus.NEEDS_INPUT:
            return None
        tool_name = str(current_entities.get('toolName') or '')
        execution_payload = current_entities.get('executionPayload')
        if not tool_name or not isinstance(execution_payload, dict):
            return None
        if not state_update.is_workflow_edit and not state_update.new_post_actions:
            return None

        updated_payload = dict(execution_payload)
        task_entities = state_update.task_context.get('entities')
        if isinstance(task_entities, dict):
            updated_payload = self._merge_clarification_task_entities_into_payload(
                tool_name=tool_name,
                updated_payload=updated_payload,
                task_entities=task_entities,
            )
            updated_payload = self._merge_follow_up_entities_into_payload(
                tool_name=tool_name,
                updated_payload=updated_payload,
                task_entities=task_entities,
            )
        if tool_name == 'purchasing.create_po':
            updated_payload = self._reuse_last_po_lines_from_context(
                user_message=user_message,
                current_entities=current_entities,
                merged_payload=updated_payload,
            )
        updated_payload = await self._merge_direct_follow_up_payload(
            auth=auth,
            user_message=user_message,
            tool_name=tool_name,
            updated_payload=updated_payload,
        )

        summary_suffix = ''
        if state_update.new_post_actions:
            route = state_update.new_post_actions[0].get('route')
            if isinstance(route, dict):
                summary_suffix = f' After success, I will open {route.get("label") or route.get("href")}.'

        emit(
            'clarification.resolved',
            self._event_payload(
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                route=state_update.primary_route,
                intent=state_update.primary_intent,
                status='updated',
            ),
        )
        return await self._prepare_confirmation(
            auth=auth,
            catalog=SemanticToolCatalog(
                backend=self._backend_client,
                auth=auth,
                context_entities=current_entities,
            ),
            conversation_id=conversation_id,
            workflow_id=workflow_id,
            state_update=state_update,
            current_entities=current_entities,
            tool_name=tool_name,
            tool_arguments=updated_payload,
            message_hint=f'Updated the draft with your latest details.{summary_suffix}'.strip(),
            emit=emit,
        )

    @staticmethod
    def _line_ref_from_detail_line(line: object) -> dict[str, object] | None:
        if not isinstance(line, dict):
            return None
        line_id = str(line.get('id') or '').strip()
        if line_id:
            return {'lineId': line_id}
        size_id = str(line.get('skuId') or '').strip()
        if size_id:
            return {'sizeId': size_id}
        return None

    async def _resolve_existing_order_line_ref(
        self,
        *,
        auth: AuthContext,
        tool_name: str,
        updated_payload: dict[str, object],
        user_message: str,
    ) -> dict[str, object] | None:
        ordinal_quantity_change = _extract_ordinal_line_quantity_change(user_message)
        ordinal_remove = _extract_ordinal_line_remove(user_message)
        descriptive_size_label = _extract_line_size_label_reference(user_message)
        if ordinal_quantity_change is None and ordinal_remove is None and descriptive_size_label is None:
            return None

        detail: object = None
        if tool_name == 'purchasing.update_po':
            po_id = str(updated_payload.get('poId') or '').strip()
            if not po_id:
                return None
            detail = await self._backend_client.get_po(auth.access_token or '', auth.tenant_id, po_id)
        elif tool_name == 'sales.update_invoice':
            invoice_id = str(updated_payload.get('invoiceId') or '').strip()
            if not invoice_id:
                return None
            get_invoice = getattr(self._backend_client, 'get_invoice', None)
            if not callable(get_invoice):
                return None
            detail = await get_invoice(auth.access_token or '', auth.tenant_id, invoice_id)
        else:
            return None

        detail_lines = detail.get('lines') if isinstance(detail, dict) else None
        lines = [line for line in detail_lines if isinstance(line, dict)] if isinstance(detail_lines, list) else []
        if not lines:
            return None

        line_index: int | None = None
        if ordinal_remove is not None:
            line_index = ordinal_remove
        elif ordinal_quantity_change is not None:
            line_index = ordinal_quantity_change[0]
        if line_index is not None:
            if line_index < 0:
                line_index = len(lines) - 1
            if 0 <= line_index < len(lines):
                return self._line_ref_from_detail_line(lines[line_index])

        if descriptive_size_label is None:
            return None

        try:
            products = await self._backend_client.search_products(auth.access_token or '', auth.tenant_id, q=None)
        except Exception:
            return None
        product_rows = [row for row in products if isinstance(row, dict)] if isinstance(products, list) else []
        if not product_rows:
            return None

        size_labels_by_size_id: dict[str, str] = {}
        for product in product_rows:
            product_id = str(product.get('id') or '').strip()
            if not product_id:
                continue
            try:
                product_detail = await self._backend_client.get_product(auth.access_token or '', auth.tenant_id, product_id)
            except Exception:
                continue
            sizes = product_detail.get('sizes') if isinstance(product_detail, dict) else None
            if not isinstance(sizes, list):
                continue
            for size in sizes:
                if not isinstance(size, dict):
                    continue
                size_id = str(size.get('id') or '').strip()
                size_label = str(size.get('size_label') or '').strip().upper()
                if size_id and size_label:
                    size_labels_by_size_id[size_id] = size_label

        matching_refs: list[dict[str, object]] = []
        for line in lines:
            size_id = str(line.get('skuId') or '').strip()
            if size_labels_by_size_id.get(size_id) != descriptive_size_label:
                continue
            line_ref = self._line_ref_from_detail_line(line)
            if line_ref is not None:
                matching_refs.append(line_ref)
        if len(matching_refs) == 1:
            return matching_refs[0]
        return None

    async def _build_confirmation_warnings(
        self,
        *,
        auth: AuthContext,
        tool_name: str,
        prepared_arguments: dict[str, object],
    ) -> list[str]:
        if tool_name != 'purchasing.create_po':
            return []

        supplier_id = str(prepared_arguments.get('supplierId') or '').strip()
        raw_lines = prepared_arguments.get('lines')
        if not supplier_id or not isinstance(raw_lines, list) or not raw_lines:
            return []

        expected_signature = sorted(
            signature
            for signature in (
                _canonical_po_line_signature(line)
                for line in raw_lines
                if isinstance(line, dict)
            )
            if signature is not None
        )
        if not expected_signature:
            return []

        try:
            payload = await self._backend_client.list_pos(auth.access_token or '', auth.tenant_id)
        except Exception:
            return []
        items = payload.get('items') if isinstance(payload, dict) else None
        rows = [row for row in items if isinstance(row, dict)] if isinstance(items, list) else []

        duplicates: list[str] = []
        for row in rows:
            row_supplier_id = str(row.get('supplierId') or '').strip()
            if row_supplier_id and row_supplier_id != supplier_id:
                continue
            po_id = str(row.get('id') or '').strip()
            if not po_id:
                continue
            try:
                detail = await self._backend_client.get_po(auth.access_token or '', auth.tenant_id, po_id)
            except Exception:
                continue
            detail_lines = detail.get('lines') if isinstance(detail, dict) else None
            existing_signature = sorted(
                signature
                for signature in (
                    _canonical_po_line_signature(line)
                    for line in detail_lines
                    if isinstance(detail_lines, list) and isinstance(line, dict)
                )
                if signature is not None
            )
            if existing_signature != expected_signature:
                continue
            po_number = str(row.get('number') or row.get('poNumber') or po_id).strip()
            duplicates.append(po_number)

        if not duplicates:
            return []
        listed = ', '.join(duplicates[:3])
        if len(duplicates) == 1:
            return [f'Possible duplicate purchase order: {listed} already has the same supplier and line items.']
        return [f'Possible duplicate purchase orders: {listed} already match this supplier and line set.']

    @staticmethod
    def _reuse_last_po_lines_from_context(
        *,
        user_message: str,
        current_entities: dict[str, object],
        merged_payload: dict[str, object],
    ) -> dict[str, object]:
        if not _message_requests_same_details(user_message):
            return merged_payload

        task_context = task_context_from_entities(current_entities)
        task_entities = task_context.get('entities')
        if not isinstance(task_entities, dict):
            return merged_payload

        raw_last_lines = task_entities.get('lastPoLines')
        last_lines = [dict(line) for line in raw_last_lines if isinstance(line, dict)] if isinstance(raw_last_lines, list) else []
        if not last_lines:
            return merged_payload

        next_payload = dict(merged_payload)
        next_payload['lines'] = last_lines
        if not _has_meaningful_value(next_payload.get('supplierId')):
            supplier_id = task_entities.get('supplierId')
            if supplier_id is not None:
                next_payload['supplierId'] = supplier_id
        return next_payload

    async def _product_detail_for_reference(
        self,
        *,
        auth: AuthContext,
        reference: str,
    ) -> dict[str, object] | None:
        normalized = reference.strip()
        if not normalized:
            return None

        search_skus = getattr(self._backend_client, 'search_skus', None)
        if callable(search_skus):
            try:
                sku_rows = await search_skus(auth.access_token or '', auth.tenant_id, q=normalized)
            except Exception:
                sku_rows = []
            if isinstance(sku_rows, list):
                for row in sku_rows:
                    if not isinstance(row, dict):
                        continue
                    product_id = str(row.get('product_id') or '').strip()
                    if product_id:
                        try:
                            return await self._backend_client.get_product(auth.access_token or '', auth.tenant_id, product_id)
                        except Exception:
                            return None

        try:
            products = await self._backend_client.search_products(auth.access_token or '', auth.tenant_id, q=normalized)
        except Exception:
            return None
        if not isinstance(products, list):
            return None
        for product in products:
            if not isinstance(product, dict):
                continue
            product_id = str(product.get('id') or '').strip()
            if not product_id:
                continue
            try:
                return await self._backend_client.get_product(auth.access_token or '', auth.tenant_id, product_id)
            except Exception:
                return None
        return None

    async def _merge_create_po_line_follow_up(
        self,
        *,
        auth: AuthContext,
        user_message: str,
        merged_payload: dict[str, object],
    ) -> dict[str, object]:
        raw_lines = merged_payload.get('lines')
        lines = [dict(line) for line in raw_lines if isinstance(line, dict)] if isinstance(raw_lines, list) else []
        if len(lines) != 1:
            return merged_payload

        line = dict(lines[0])
        reference = str(line.get('productName') or line.get('styleCode') or line.get('skuCode') or '').strip()
        if not reference:
            return merged_payload

        detail = await self._product_detail_for_reference(auth=auth, reference=reference)
        if not isinstance(detail, dict):
            return merged_payload

        skus = detail.get('skus')
        sizes = detail.get('sizes')
        if not isinstance(skus, list) or not isinstance(sizes, list):
            return merged_payload

        available_colors = [
            str(sku.get('color_name') or '').strip()
            for sku in skus
            if isinstance(sku, dict) and str(sku.get('color_name') or '').strip()
        ]
        available_sizes = [
            str(size.get('size_label') or '').strip()
            for size in sizes
            if isinstance(size, dict) and str(size.get('size_label') or '').strip()
        ]

        existing_unit_cost = None
        raw_unit_cost = line.get('unitCost')
        if raw_unit_cost is not None:
            try:
                existing_unit_cost = int(raw_unit_cost)
            except (TypeError, ValueError):
                existing_unit_cost = None

        grouped_lines = _extract_grouped_variant_lines(
            message=user_message,
            product_name=reference,
            available_colors=available_colors,
            available_sizes=available_sizes,
            unit_cost=existing_unit_cost,
        )
        if grouped_lines:
            next_payload = dict(merged_payload)
            next_payload['lines'] = grouped_lines
            return next_payload

        line_patch: dict[str, object] = {}
        color_name = _extract_follow_up_color_name(user_message, available_colors)
        if color_name:
            line_patch['colorName'] = color_name

        size_label = _extract_follow_up_size_label(user_message, available_sizes)
        if size_label:
            line_patch['sizeLabel'] = size_label

        quantity = _extract_follow_up_quantity(user_message)
        if quantity is not None:
            if 'qty' in line:
                line_patch['qty'] = quantity
            else:
                line_patch['quantity'] = quantity

        unit_cost = _extract_follow_up_unit_value(user_message)
        if unit_cost is not None:
            has_qty = _has_meaningful_value(line.get('qty')) or _has_meaningful_value(line.get('quantity'))
            has_cost = _has_meaningful_value(line.get('unitCost'))
            if not has_cost or not quantity or not has_qty:
                line_patch['unitCost'] = unit_cost

        merged_lines = _merge_single_line_patch(lines, line_patch)
        if merged_lines is None:
            return merged_payload
        next_payload = dict(merged_payload)
        next_payload['lines'] = merged_lines
        return next_payload

    async def _merge_create_invoice_line_follow_up(
        self,
        *,
        auth: AuthContext,
        user_message: str,
        merged_payload: dict[str, object],
    ) -> dict[str, object]:
        raw_lines = merged_payload.get('lines')
        lines = [dict(line) for line in raw_lines if isinstance(line, dict)] if isinstance(raw_lines, list) else []
        if len(lines) != 1:
            return merged_payload

        line = dict(lines[0])
        reference = str(line.get('productName') or line.get('styleCode') or line.get('skuCode') or '').strip()
        if not reference:
            return merged_payload

        detail = await self._product_detail_for_reference(auth=auth, reference=reference)
        if not isinstance(detail, dict):
            return merged_payload

        skus = detail.get('skus')
        sizes = detail.get('sizes')
        if not isinstance(skus, list) or not isinstance(sizes, list):
            return merged_payload

        available_colors = [
            str(sku.get('color_name') or '').strip()
            for sku in skus
            if isinstance(sku, dict) and str(sku.get('color_name') or '').strip()
        ]
        available_sizes = [
            str(size.get('size_label') or '').strip()
            for size in sizes
            if isinstance(size, dict) and str(size.get('size_label') or '').strip()
        ]

        line_patch: dict[str, object] = {}
        color_name = _extract_follow_up_color_name(user_message, available_colors)
        if color_name:
            line_patch['colorName'] = color_name

        size_label = _extract_follow_up_size_label(user_message, available_sizes)
        if size_label:
            line_patch['sizeLabel'] = size_label

        quantity = _extract_follow_up_quantity(user_message)
        if quantity is not None:
            if 'qty' in line:
                line_patch['qty'] = quantity
            else:
                line_patch['quantity'] = quantity

        unit_price = _extract_follow_up_unit_value(user_message)
        if unit_price is not None:
            has_qty = _has_meaningful_value(line.get('qty')) or _has_meaningful_value(line.get('quantity'))
            has_price = _has_meaningful_value(line.get('unitPrice'))
            if not has_price or not quantity or not has_qty:
                line_patch['unitPrice'] = unit_price

        merged_lines = _merge_single_line_patch(lines, line_patch)
        if merged_lines is None:
            return merged_payload
        next_payload = dict(merged_payload)
        next_payload['lines'] = merged_lines
        return next_payload

    async def _variant_rows_for_clarification(
        self,
        *,
        catalog: SemanticToolCatalog,
        tool_name: str,
        tool_arguments: dict[str, object],
        prompt: str,
    ) -> dict[str, object] | None:
        lowered_prompt = prompt.lower()
        if tool_name not in {'purchasing.create_po', 'sales.create_invoice'}:
            return None

        raw_lines = tool_arguments.get('lines')
        lines = [line for line in raw_lines if isinstance(line, dict)] if isinstance(raw_lines, list) else []
        if len(lines) != 1:
            return None
        line = lines[0]
        if line.get('sizeId'):
            return None
        product_reference = str(line.get('productName') or line.get('styleCode') or line.get('skuCode') or '').strip()
        if not product_reference:
            return None
        if not any(marker in lowered_prompt for marker in ('variant', 'color', 'colour', 'size', 'available', 'quantity')):
            return None

        try:
            return await catalog.invoke('products.get_product_variants', {'product': product_reference})
        except Exception:
            return None

    async def _merge_direct_follow_up_payload(
        self,
        *,
        auth: AuthContext,
        user_message: str,
        tool_name: str,
        updated_payload: dict[str, object],
    ) -> dict[str, object]:
        merged_payload = dict(updated_payload)

        if tool_name == 'purchasing.create_po':
            supplier = await match_supplier(self._backend_client, auth, user_message)
            if supplier:
                merged_payload['supplierId'] = supplier['id']
            lines = await parse_po_lines(
                self._backend_client,
                auth,
                user_message,
                po_id='',
                allow_missing_cost=True,
            )
            if lines:
                merged_payload['lines'] = lines
                return merged_payload
            return await self._merge_create_po_line_follow_up(
                auth=auth,
                user_message=user_message,
                merged_payload=merged_payload,
            )

        if tool_name == 'sales.create_invoice':
            customer = await match_customer(self._backend_client, auth, user_message)
            if customer:
                merged_payload['customerId'] = customer['id']
            lines = await parse_sales_lines(
                self._backend_client,
                auth,
                user_message,
                invoice_id='',
            )
            if lines:
                merged_payload['lines'] = lines
                return merged_payload
            return await self._merge_create_invoice_line_follow_up(
                auth=auth,
                user_message=user_message,
                merged_payload=merged_payload,
            )

        if tool_name == 'purchasing.update_po':
            date_value = _parse_iso_date_from_message(user_message)
            if date_value:
                header_patch = dict(merged_payload.get('headerPatch') or {})
                header_patch['expectedDate'] = date_value
                merged_payload['headerPatch'] = header_patch
            if _message_implies_add_line(user_message):
                lines = await parse_po_lines(
                    self._backend_client,
                    auth,
                    user_message,
                    po_id='',
                    allow_missing_cost=True,
                )
                if lines:
                    merged_payload['lineOps'] = _merge_line_ops(
                        merged_payload.get('lineOps'),
                        [{'op': 'add', 'values': line} for line in lines],
                    )
            quantity_ops = _extract_quantity_change_ops(user_message)
            if quantity_ops:
                merged_payload['lineOps'] = _merge_line_ops(merged_payload.get('lineOps'), quantity_ops)
            remove_ops = _extract_remove_line_ops(user_message)
            if remove_ops:
                merged_payload['lineOps'] = _merge_line_ops(merged_payload.get('lineOps'), remove_ops)
            ordinal_line_ref = await self._resolve_existing_order_line_ref(
                auth=auth,
                tool_name=tool_name,
                updated_payload=merged_payload,
                user_message=user_message,
            )
            ordinal_quantity_change = _extract_ordinal_line_quantity_change(user_message)
            if ordinal_line_ref and ordinal_quantity_change is not None:
                merged_payload['lineOps'] = _merge_line_ops(
                    merged_payload.get('lineOps'),
                    [{'op': 'change_qty', 'lineRef': ordinal_line_ref, 'qty': ordinal_quantity_change[1]}],
                )
            descriptive_quantity = _extract_line_quantity_value(user_message)
            if ordinal_line_ref and ordinal_quantity_change is None and descriptive_quantity is not None:
                merged_payload['lineOps'] = _merge_line_ops(
                    merged_payload.get('lineOps'),
                    [{'op': 'change_qty', 'lineRef': ordinal_line_ref, 'qty': descriptive_quantity}],
                )
            ordinal_remove = _extract_ordinal_line_remove(user_message)
            if ordinal_line_ref and ordinal_remove is not None:
                merged_payload['lineOps'] = _merge_line_ops(
                    merged_payload.get('lineOps'),
                    [{'op': 'remove', 'lineRef': ordinal_line_ref}],
                )
            if ordinal_line_ref and ordinal_remove is None and not remove_ops and _message_implies_remove_line(user_message):
                merged_payload['lineOps'] = _merge_line_ops(
                    merged_payload.get('lineOps'),
                    [{'op': 'remove', 'lineRef': ordinal_line_ref}],
                )
            return merged_payload

        if tool_name == 'sales.update_invoice':
            if _message_implies_add_line(user_message):
                lines = await parse_sales_lines(
                    self._backend_client,
                    auth,
                    user_message,
                    invoice_id='',
                )
                if lines:
                    merged_payload['lineOps'] = _merge_line_ops(
                        merged_payload.get('lineOps'),
                        [{'op': 'add', 'values': line} for line in lines],
                    )
            quantity_ops = _extract_quantity_change_ops(user_message)
            if quantity_ops:
                merged_payload['lineOps'] = _merge_line_ops(merged_payload.get('lineOps'), quantity_ops)
            remove_ops = _extract_remove_line_ops(user_message)
            if remove_ops:
                merged_payload['lineOps'] = _merge_line_ops(merged_payload.get('lineOps'), remove_ops)
            ordinal_line_ref = await self._resolve_existing_order_line_ref(
                auth=auth,
                tool_name=tool_name,
                updated_payload=merged_payload,
                user_message=user_message,
            )
            ordinal_quantity_change = _extract_ordinal_line_quantity_change(user_message)
            if ordinal_line_ref and ordinal_quantity_change is not None:
                merged_payload['lineOps'] = _merge_line_ops(
                    merged_payload.get('lineOps'),
                    [{'op': 'change_qty', 'lineRef': ordinal_line_ref, 'qty': ordinal_quantity_change[1]}],
                )
            descriptive_quantity = _extract_line_quantity_value(user_message)
            if ordinal_line_ref and ordinal_quantity_change is None and descriptive_quantity is not None:
                merged_payload['lineOps'] = _merge_line_ops(
                    merged_payload.get('lineOps'),
                    [{'op': 'change_qty', 'lineRef': ordinal_line_ref, 'qty': descriptive_quantity}],
                )
            ordinal_remove = _extract_ordinal_line_remove(user_message)
            if ordinal_line_ref and ordinal_remove is not None:
                merged_payload['lineOps'] = _merge_line_ops(
                    merged_payload.get('lineOps'),
                    [{'op': 'remove', 'lineRef': ordinal_line_ref}],
                )
            if ordinal_line_ref and ordinal_remove is None and not remove_ops and _message_implies_remove_line(user_message):
                merged_payload['lineOps'] = _merge_line_ops(
                    merged_payload.get('lineOps'),
                    [{'op': 'remove', 'lineRef': ordinal_line_ref}],
                )
            return merged_payload

        if tool_name == 'purchasing.receive_po':
            location = await match_location(self._backend_client, auth, user_message)
            if location:
                merged_payload['locationId'] = location['id']
            po_id = str(merged_payload.get('poId') or '')
            lines = await parse_po_lines(
                self._backend_client,
                auth,
                user_message,
                po_id=po_id,
                allow_missing_cost=True,
            )
            if lines:
                merged_payload['lines'] = lines
            return merged_payload

        if tool_name == 'sales.dispatch_invoice':
            location = await match_location(self._backend_client, auth, user_message)
            if location:
                merged_payload['locationId'] = location['id']
            return merged_payload

        if tool_name.startswith('analytics.'):
            normalized = user_message.strip().lower()
            if tool_name in {'analytics.low_stock', 'analytics.reorder_needed', 'analytics.high_demand_low_stock'}:
                threshold_match = re.search(
                    r'\b(?:below|less than|under|fewer than)\s+(\d+)\b|\bthreshold\s*(?:of|is|=)?\s*(\d+)\b',
                    normalized,
                )
                if threshold_match:
                    merged_payload['threshold'] = int(
                        next(group for group in threshold_match.groups() if group is not None)
                    )
                elif normalized.isdigit():
                    merged_payload['threshold'] = int(normalized)
            days_match = re.search(r'\b(?:last|past)\s+(\d+)\s+days?\b', normalized)
            if days_match:
                merged_payload['days'] = int(days_match.group(1))
            elif 'this month' in normalized:
                merged_payload['period'] = 'this_month'
            elif 'this week' in normalized:
                merged_payload['period'] = 'this_week'
            top_match = re.search(r'\btop\s+(\d+)\b', normalized)
            if top_match:
                merged_payload['limit'] = int(top_match.group(1))
            if 'highest' in normalized:
                merged_payload['sort'] = 'desc'
            elif 'lowest' in normalized:
                merged_payload['sort'] = 'asc'
            if re.search(r'\bacross\s+all\s+locations?\b|\ball\s+locations?\b', normalized):
                merged_payload.pop('locationId', None)
            else:
                location = await match_location(self._backend_client, auth, user_message)
                if location:
                    merged_payload['locationId'] = location['id']
            return merged_payload

        if tool_name == 'inventory.variant_availability':
            normalized = user_message.strip().lower()
            sizes = parse_size_labels(user_message)
            if sizes:
                if len(sizes) == 1:
                    merged_payload['size'] = sizes[0]
                    merged_payload.pop('sizes', None)
                else:
                    merged_payload['sizes'] = sizes
                    merged_payload['matchAllSizes'] = not bool(re.search(r'\b(?:or|either)\b', normalized))
                    merged_payload.pop('size', None)
            colors = extract_color_names(user_message)
            if colors:
                merged_payload['color'] = colors[0]
            if re.search(r'\bout\s+of\s+stock\b', normalized):
                merged_payload['availability'] = 'out_of_stock'
            elif re.search(r'\blow\s+(?:in\s+)?stock\b|\blow\s+stock\b', normalized):
                merged_payload['availability'] = 'low_stock'
            elif re.search(r'\bavailable\b|\bin\s+stock\b', normalized):
                merged_payload['availability'] = 'in_stock'
            if re.search(r'\bwhat\s+sizes?\b|\bwhich\s+sizes?\b', normalized):
                merged_payload['groupBy'] = 'size'
            elif re.search(r'\bwhat\s+colors?\b|\bwhich\s+colors?\b', normalized):
                merged_payload['groupBy'] = 'color'
            if 'multiple colors' in normalized:
                merged_payload['minColorCount'] = 2
            if 'only one color' in normalized:
                merged_payload['maxColorCount'] = 1
                merged_payload['availability'] = 'in_stock'
            if 'only one size left in stock' in normalized:
                merged_payload['maxInStockSizeCount'] = 1
                merged_payload['availability'] = 'in_stock'
            exclude_size_match = re.search(r'\bnot\s+([a-z0-9]+)\s+size\b', normalized, re.IGNORECASE)
            if exclude_size_match:
                merged_payload['excludeSize'] = exclude_size_match.group(1).upper()
            threshold_match = re.search(
                r'\b(?:below|less than|under|fewer than)\s+(\d+)\b|\bthreshold\s*(?:of|is|=)?\s*(\d+)\b',
                normalized,
            )
            if threshold_match:
                merged_payload['threshold'] = int(next(group for group in threshold_match.groups() if group is not None))
            if re.search(r'\bacross\s+all\s+locations?\b|\ball\s+locations?\b', normalized):
                merged_payload.pop('locationId', None)
            else:
                location = await match_location(self._backend_client, auth, user_message)
                if location:
                    merged_payload['locationId'] = location['id']
            return merged_payload

        return merged_payload

    async def _recover_sparse_mutation_payload(
        self,
        *,
        auth: AuthContext,
        user_message: str,
        primary_intent: str,
        current_entities: dict[str, object],
    ) -> tuple[str, dict[str, object]] | None:
        recovered: dict[str, object] = {}
        task_context = task_context_from_entities(current_entities)
        task_entities = task_context.get('entities')
        task_entities = task_entities if isinstance(task_entities, dict) else {}

        if primary_intent == 'purchasing.create_po':
            supplier = await match_supplier(self._backend_client, auth, user_message)
            if supplier:
                recovered['supplierId'] = supplier['id']
            else:
                supplier_id = str(task_entities.get('supplierId') or '').strip()
                if supplier_id:
                    recovered['supplierId'] = supplier_id

            lines = await parse_po_lines(
                self._backend_client,
                auth,
                user_message,
                po_id='',
                allow_missing_cost=True,
            )
            if lines:
                recovered['lines'] = lines
            else:
                product_reference = _extract_order_product_reference(user_message)
                if product_reference:
                    recovered['lines'] = [{'productName': product_reference}]

            date_value = _parse_iso_date_from_message(user_message)
            if date_value:
                recovered['expectedDate'] = date_value

            if recovered.get('supplierId') and recovered.get('lines'):
                return primary_intent, recovered
            return None

        if primary_intent == 'sales.create_invoice':
            customer = await match_customer(self._backend_client, auth, user_message)
            if customer:
                recovered['customerId'] = customer['id']
            else:
                customer_id = str(task_entities.get('customerId') or '').strip()
                if customer_id:
                    recovered['customerId'] = customer_id

            lines = await parse_sales_lines(
                self._backend_client,
                auth,
                user_message,
                invoice_id='',
            )
            if lines:
                recovered['lines'] = lines
            else:
                product_reference = _extract_order_product_reference(user_message)
                if product_reference:
                    recovered['lines'] = [{'productName': product_reference}]

            if recovered.get('customerId') and recovered.get('lines'):
                return primary_intent, recovered
            return None

        if primary_intent == 'master.create_supplier':
            recovered.update(
                {
                    key: value
                    for key, value in task_entities.items()
                    if key in {'name', 'email', 'phone', 'address', 'status'} and value is not None
                }
            )
            recovered.update(_extract_contact_create_entities(user_message))
            if str(recovered.get('name') or '').strip():
                return primary_intent, recovered
            return None

        if primary_intent == 'master.create_customer':
            recovered.update(
                {
                    key: value
                    for key, value in task_entities.items()
                    if key in {'name', 'email', 'phone', 'address', 'status'} and value is not None
                }
            )
            recovered.update(_extract_contact_create_entities(user_message))
            if str(recovered.get('name') or '').strip():
                return primary_intent, recovered
            return None

        if primary_intent == 'master.create_location':
            recovered.update(
                {
                    key: value
                    for key, value in task_entities.items()
                    if key in {'name', 'code', 'type', 'address', 'status'} and value is not None
                }
            )
            recovered.update(_extract_location_create_entities(user_message))
            if all(str(recovered.get(field) or '').strip() for field in ('name', 'code', 'type')):
                return primary_intent, recovered
            return None

        if primary_intent == 'purchasing.update_po':
            po_ref = _extract_purchase_order_reference(user_message)
            if po_ref:
                recovered['poId'] = po_ref
                try:
                    recovered['poId'] = await EntityResolver(self._backend_client, auth).purchase_order(po_ref)
                except ValueError:
                    pass
            date_value = _parse_iso_date_from_message(user_message)
            if date_value:
                recovered['expectedDate'] = date_value
            if _message_implies_add_line(user_message):
                lines = await parse_po_lines(
                    self._backend_client,
                    auth,
                    user_message,
                    po_id='',
                    allow_missing_cost=True,
                )
                if lines:
                    recovered['lineOps'] = [{'op': 'add', 'values': line} for line in lines]
            quantity_ops = _extract_quantity_change_ops(user_message)
            if quantity_ops:
                recovered['lineOps'] = _merge_line_ops(recovered.get('lineOps'), quantity_ops)
            remove_ops = _extract_remove_line_ops(user_message)
            if remove_ops:
                recovered['lineOps'] = _merge_line_ops(recovered.get('lineOps'), remove_ops)
            recovered_po_id = str(recovered.get('poId') or '').strip()
            if recovered_po_id:
                line_ref = await self._resolve_existing_order_line_ref(
                    auth=auth,
                    tool_name=primary_intent,
                    updated_payload={'poId': recovered_po_id},
                    user_message=user_message,
                )
                descriptive_quantity = _extract_line_quantity_value(user_message)
                if line_ref and descriptive_quantity is not None and not quantity_ops:
                    recovered['lineOps'] = _merge_line_ops(
                        recovered.get('lineOps'),
                        [{'op': 'change_qty', 'lineRef': line_ref, 'qty': descriptive_quantity}],
                    )
                if line_ref and _message_implies_remove_line(user_message) and not remove_ops:
                    recovered['lineOps'] = _merge_line_ops(
                        recovered.get('lineOps'),
                        [{'op': 'remove', 'lineRef': line_ref}],
                    )
            if recovered.get('poId') and any(key in recovered for key in ('expectedDate', 'lineOps')):
                return primary_intent, recovered
            return None

        if primary_intent == 'purchasing.cancel_po':
            po_ref = _extract_purchase_order_reference(user_message)
            if po_ref:
                return primary_intent, {'poId': po_ref, 'confirm': True}
            return None

        if primary_intent == 'purchasing.close_po':
            po_ref = _extract_purchase_order_reference(user_message)
            if po_ref:
                return primary_intent, {'poId': po_ref, 'confirm': True}
            return None

        if primary_intent == 'purchasing.receive_po':
            po_ref = _extract_purchase_order_reference(user_message)
            if po_ref:
                recovered['poId'] = po_ref
            elif str(task_entities.get('poId') or '').strip():
                recovered['poId'] = str(task_entities['poId']).strip()
            location = await match_location(self._backend_client, auth, user_message)
            if location:
                recovered['locationId'] = location['id']
            elif str(task_entities.get('locationId') or '').strip():
                recovered['locationId'] = str(task_entities['locationId']).strip()
            lines = await parse_po_lines(
                self._backend_client,
                auth,
                user_message,
                po_id='',
                allow_missing_cost=True,
            )
            if lines:
                recovered['lines'] = lines
            if 'poId' in recovered and ('locationId' in recovered or 'lines' in recovered):
                recovered['confirm'] = True
                return primary_intent, recovered
            return None

        if primary_intent == 'sales.update_invoice':
            invoice_ref = _extract_invoice_reference(user_message)
            if invoice_ref:
                recovered['invoiceId'] = invoice_ref
                try:
                    recovered['invoiceId'] = await EntityResolver(self._backend_client, auth).invoice(invoice_ref)
                except ValueError:
                    pass
            if _message_implies_add_line(user_message):
                lines = await parse_sales_lines(
                    self._backend_client,
                    auth,
                    user_message,
                    invoice_id='',
                )
                if lines:
                    recovered['lineOps'] = [{'op': 'add', 'values': line} for line in lines]
            quantity_ops = _extract_quantity_change_ops(user_message)
            if quantity_ops:
                recovered['lineOps'] = _merge_line_ops(recovered.get('lineOps'), quantity_ops)
            remove_ops = _extract_remove_line_ops(user_message)
            if remove_ops:
                recovered['lineOps'] = _merge_line_ops(recovered.get('lineOps'), remove_ops)
            recovered_invoice_id = str(recovered.get('invoiceId') or '').strip()
            if recovered_invoice_id:
                line_ref = await self._resolve_existing_order_line_ref(
                    auth=auth,
                    tool_name=primary_intent,
                    updated_payload={'invoiceId': recovered_invoice_id},
                    user_message=user_message,
                )
                descriptive_quantity = _extract_line_quantity_value(user_message)
                if line_ref and descriptive_quantity is not None and not quantity_ops:
                    recovered['lineOps'] = _merge_line_ops(
                        recovered.get('lineOps'),
                        [{'op': 'change_qty', 'lineRef': line_ref, 'qty': descriptive_quantity}],
                    )
                if line_ref and _message_implies_remove_line(user_message) and not remove_ops:
                    recovered['lineOps'] = _merge_line_ops(
                        recovered.get('lineOps'),
                        [{'op': 'remove', 'lineRef': line_ref}],
                    )
            if recovered.get('invoiceId') and recovered.get('lineOps'):
                return primary_intent, recovered
            return None

        if primary_intent == 'sales.cancel_invoice':
            invoice_ref = _extract_invoice_reference(user_message)
            if invoice_ref:
                return primary_intent, {'invoiceId': invoice_ref, 'confirm': True}
            return None

        if primary_intent == 'sales.dispatch_invoice':
            invoice_ref = _extract_invoice_reference(user_message)
            if invoice_ref:
                recovered['invoiceId'] = invoice_ref
            elif str(task_entities.get('invoiceId') or '').strip():
                recovered['invoiceId'] = str(task_entities['invoiceId']).strip()
            location = await match_location(self._backend_client, auth, user_message)
            if location:
                recovered['locationId'] = location['id']
            elif str(task_entities.get('locationId') or '').strip():
                recovered['locationId'] = str(task_entities['locationId']).strip()
            if 'invoiceId' in recovered and 'locationId' in recovered:
                recovered['confirm'] = True
                return primary_intent, recovered
            return None

        if primary_intent == 'purchasing.get_po':
            po_ref = _extract_purchase_order_reference(user_message)
            if po_ref:
                return primary_intent, {'poId': po_ref}
            return None

        if primary_intent == 'sales.get_invoice':
            invoice_ref = _extract_invoice_reference(user_message)
            if invoice_ref:
                return primary_intent, {'invoiceId': invoice_ref}
            return None

        del current_entities
        return None

    async def _prepare_confirmation(
        self,
        *,
        auth: AuthContext,
        catalog: SemanticToolCatalog,
        conversation_id: UUID,
        workflow_id: UUID,
        state_update: RuntimeStateUpdate,
        current_entities: dict[str, object],
        tool_name: str,
        tool_arguments: dict[str, object],
        message_hint: str,
        emit: EventSink,
    ) -> RuntimeOutcome:
        active_approval_id = current_entities.get('activeApprovalId')
        existing_tool_name = str(current_entities.get('toolName') or '')
        has_pending_approval = (
            isinstance(active_approval_id, str)
            and bool(active_approval_id)
            and current_entities.get('activeApprovalStatus') == 'pending'
            and existing_tool_name == tool_name
        )
        try:
            prepared_arguments = await catalog.prepare(tool_name, tool_arguments)
        except ToolSchemaValidationError as exc:
            return self._clarification_outcome_from_schema_error(
                current_entities={
                    **current_entities,
                    'toolName': tool_name,
                    'executionPayload': tool_arguments,
                },
                required=exc.required_fields,
                prompt=exc.prompt,
            )
        except ToolPreparationError as exc:
            required = [str(item) for item in exc.missing_fields]
            emit(
                'clarification.requested',
                self._event_payload(
                    conversation_id=conversation_id,
                    workflow_id=workflow_id,
                    route=state_update.primary_route,
                    intent=state_update.primary_intent,
                    tool_name=tool_name,
                    missing_fields=required,
                    status='needs_input',
                ),
            )
            draft_entities = {
                **current_entities,
                'toolName': tool_name,
                'executionPayload': tool_arguments,
            }
            next_entities = self._clarification_entities(draft_entities, required)
            clarification_blocks = render_clarification(exc.prompt, required)
            variant_rows = await self._variant_rows_for_clarification(
                catalog=catalog,
                tool_name=tool_name,
                tool_arguments=tool_arguments,
                prompt=exc.prompt,
            )
            if isinstance(variant_rows, dict):
                clarification_blocks.extend(
                    render_tool_result(
                        'Available variants for this product:',
                        'products.get_product_variants',
                        variant_rows,
                    )
                )
            return RuntimeOutcome(
                blocks=clarification_blocks,
                status=WorkflowStatus.NEEDS_INPUT,
                current_task='clarification_requested',
                extracted_entities=next_entities,
                missing_fields=required,
            )

        quantity = prepared_arguments.get('quantity')
        evaluation = await self._backend_client.evaluate_approval(
            access_token=auth.access_token or '',
            tenant_id=auth.tenant_id,
            action_type=tool_name,
            quantity=int(quantity) if isinstance(quantity, int) else None,
        )
        if evaluation.requires_approval and has_pending_approval:
            confirmation_prompt = 'Review these updated details and confirm. The pending approval request will be updated.'
        elif evaluation.requires_approval:
            confirmation_prompt = 'Review these details and confirm. The request will then be submitted for approval.'
        else:
            confirmation_prompt = 'Review these details and confirm to continue.'
        preview_warnings = await self._build_confirmation_warnings(
            auth=auth,
            tool_name=tool_name,
            prepared_arguments=prepared_arguments,
        )

        enriched_task_context = task_context_from_entities(state_update.extracted_entities)
        enriched_task_context['missingFields'] = []
        enriched_entities = dict(enriched_task_context.get('entities') or {})
        enriched_entities.update(
            self._derived_context_entities(
                tool_name=tool_name,
                tool_arguments=prepared_arguments,
            )
        )
        enriched_task_context['entities'] = enriched_entities
        enriched_state_entities = apply_task_context(dict(state_update.extracted_entities), enriched_task_context)

        next_entities = {
            **enriched_state_entities,
            '_workflowEngine': 'runtime',
            '_pendingActions': [
                PendingActionType.CONFIRM.value,
                PendingActionType.CANCEL.value,
                PendingActionType.EDIT.value,
            ],
            '_pendingPrompt': confirmation_prompt,
            'toolName': tool_name,
            'executionPayload': prepared_arguments,
            'preview': {
                'tool': tool_name,
                'arguments': tool_arguments,
                'preparedArguments': prepared_arguments,
                'taskContext': enriched_task_context,
                'warnings': preview_warnings,
            },
            'approvalRequired': evaluation.requires_approval,
            'approvalReason': evaluation.reason,
            'summary': str(current_entities.get('summary') or state_update.primary_intent or tool_name),
            'activeApprovalId': active_approval_id if has_pending_approval else None,
            'activeApprovalStatus': 'pending' if has_pending_approval else None,
            '_approvalOperation': 'update_existing' if has_pending_approval else 'create_new',
        }
        next_entities = mark_task_status(next_entities, 'awaiting_confirmation')

        emit(
            'approval.presented',
            self._event_payload(
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                route=state_update.primary_route,
                intent=state_update.primary_intent,
                tool_name=tool_name,
                approval_required=evaluation.requires_approval,
                status='awaiting_confirmation',
            ),
        )

        return RuntimeOutcome(
            blocks=render_confirmation_required(
                message=message_hint,
                tool_name=tool_name,
                tool_arguments=prepared_arguments,
                approval_required=evaluation.requires_approval,
                confirmation_prompt=confirmation_prompt,
                actor=auth.email,
                warnings=preview_warnings,
            ),
            status=WorkflowStatus.AWAITING_CONFIRMATION,
            current_task='awaiting_confirmation',
            extracted_entities=next_entities,
        )

    def _clarification_outcome_from_schema_error(
        self,
        *,
        current_entities: dict[str, object],
        required: list[str],
        prompt: str,
    ) -> RuntimeOutcome:
        next_entities = self._clarification_entities(current_entities, required)
        return RuntimeOutcome(
            blocks=render_clarification(prompt, required),
            status=WorkflowStatus.NEEDS_INPUT,
            current_task='clarification_requested',
            extracted_entities=next_entities,
            missing_fields=required,
        )

    @staticmethod
    def _clarification_entities(current_entities: dict[str, object], required: list[str]) -> dict[str, object]:
        task_context = increment_clarification_count(task_context_from_entities(current_entities))
        task_context['missingFields'] = list(required)
        entities = dict(task_context.get('entities') or {})
        tool_name = str(current_entities.get('toolName') or '')
        execution_payload = current_entities.get('executionPayload')
        if isinstance(execution_payload, dict):
            for field in _WRITE_TOOL_ENTITY_FIELDS.get(tool_name, ()):
                value = execution_payload.get(field)
                if _has_meaningful_value(value):
                    entities[field] = value
        task_context['entities'] = entities
        return mark_task_status(apply_task_context(current_entities, task_context), 'drafting')

    @staticmethod
    def _merge_follow_up_entities_into_payload(
        *,
        tool_name: str,
        updated_payload: dict[str, object],
        task_entities: dict[str, object],
    ) -> dict[str, object]:
        merged_payload = dict(updated_payload)
        if tool_name in {'master.create_supplier', 'master.create_customer'}:
            for key in ('name', 'email', 'phone', 'address', 'status'):
                value = task_entities.get(key)
                if value is None:
                    continue
                if isinstance(value, str):
                    cleaned = value.strip()
                    if cleaned:
                        merged_payload[key] = cleaned
                else:
                    merged_payload[key] = value
            return merged_payload

        if tool_name == 'products.create_product':
            product = dict(merged_payload.get('product') or {})
            if task_entities.get('styleCode'):
                product['styleCode'] = task_entities['styleCode']
            if task_entities.get('name'):
                product['name'] = task_entities['name']
            if task_entities.get('basePrice') is not None:
                product['basePrice'] = task_entities['basePrice']
            if product:
                merged_payload['product'] = product
            return merged_payload

        if tool_name in {'purchasing.create_po', 'sales.create_invoice'}:
            if isinstance(merged_payload.get('lines'), list) and merged_payload.get('lines'):
                return merged_payload
            price_field = 'unitCost' if tool_name == 'purchasing.create_po' else 'unitPrice'
            candidate_patch: dict[str, object] = {}
            for key in ('productName', 'styleCode', 'skuCode', 'colorName'):
                value = task_entities.get(key)
                if isinstance(value, str) and value.strip():
                    candidate_patch[key] = value.strip()
            size_label = _normalize_size_label(task_entities.get('sizeLabel'))
            if size_label:
                candidate_patch['sizeLabel'] = size_label
            if task_entities.get('quantity') is not None:
                candidate_patch['quantity'] = task_entities['quantity']
            elif task_entities.get('qty') is not None:
                candidate_patch['qty'] = task_entities['qty']
            if task_entities.get(price_field) is not None:
                candidate_patch[price_field] = task_entities[price_field]
            elif task_entities.get('price') is not None:
                candidate_patch[price_field] = task_entities['price']
            elif task_entities.get('unitPrice') is not None and price_field == 'unitCost':
                candidate_patch[price_field] = task_entities['unitPrice']
            elif task_entities.get('unitCost') is not None and price_field == 'unitPrice':
                candidate_patch[price_field] = task_entities['unitCost']

            merged_lines = _merge_single_line_patch(merged_payload.get('lines'), candidate_patch)
            if merged_lines is not None:
                merged_payload['lines'] = merged_lines
        return merged_payload

    @staticmethod
    def _merge_clarification_task_entities_into_payload(
        *,
        tool_name: str,
        updated_payload: dict[str, object],
        task_entities: dict[str, object],
    ) -> dict[str, object]:
        merged_payload = dict(updated_payload)
        writable_fields = set(_WRITE_TOOL_ENTITY_FIELDS.get(tool_name, ()))
        for key, value in task_entities.items():
            if value is None:
                continue
            if key in writable_fields and _has_meaningful_value(merged_payload.get(key)):
                continue
            merged_payload[key] = value
        return merged_payload

    async def _run_phase(
        self,
        *,
        emit: EventSink,
        conversation_id: UUID,
        workflow_id: UUID,
        phase: str,
        route: str,
        intent: str,
        action,
        tool_name: str | None = None,
    ):
        emit(
            'phase.started',
            self._event_payload(
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                phase=phase,
                route=route,
                intent=intent,
                tool_name=tool_name,
            ),
        )
        started = perf_counter()
        result = await action()
        emit(
            'phase.completed',
            self._event_payload(
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                phase=phase,
                route=route,
                intent=intent,
                tool_name=tool_name,
                latency_ms=(perf_counter() - started) * 1000,
                status='completed',
            ),
        )
        return result

    async def _write_narrator_message(
        self,
        *,
        emit: EventSink,
        conversation_id: UUID,
        workflow_id: UUID,
        route: str,
        intent: str,
        user_message: str,
        directive: str,
        supporting_context: dict[str, object],
        fallback_message: str,
        trace_callback=None,
        tool_name: str | None = None,
    ) -> str:
        try:
            return await self._run_phase(
                emit=emit,
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                phase='render',
                route=route,
                intent=intent,
                tool_name=tool_name,
                action=lambda: self._narrator.write_message(
                    user_message=user_message,
                    directive=directive,
                    supporting_context=supporting_context,
                    fallback_message=fallback_message,
                    trace_callback=trace_callback,
                ),
            )
        except ProviderExhaustedError:
            logger.warning(
                'Narrator providers exhausted for conversation %s workflow %s; using fallback message.',
                conversation_id,
                workflow_id,
                exc_info=True,
            )
            return fallback_message

    async def _record_audit_event(
        self,
        *,
        auth: AuthContext,
        conversation_id: UUID,
        workflow_id: UUID,
        event_type: str,
        payload: dict[str, object],
        tool_name: str | None = None,
        approval_id: str | None = None,
    ) -> None:
        if self._audit_service is None:
            return
        try:
            await self._audit_service.record(
                tenant_id=auth.tenant_id,
                user_id=auth.id,
                actor_email=auth.email,
                event_type=event_type,
                conversation_id=str(conversation_id),
                workflow_id=str(workflow_id),
                approval_id=approval_id,
                tool_name=tool_name,
                payload=payload,
            )
        except Exception:
            logger.exception('Failed to persist runtime audit event %s', event_type)

    def _schema_catalog_for_state(
        self,
        catalog: SemanticToolCatalog,
        state_update: RuntimeStateUpdate,
    ) -> list[dict[str, object]]:
        schema_catalog = catalog.schema_catalog()
        if state_update.primary_route == ROUTE_NAVIGATION:
            return [entry for entry in schema_catalog if entry['name'] == 'navigation.find_screen']
        return [entry for entry in schema_catalog if entry['name'] != 'navigation.find_screen']

    @staticmethod
    def _sanitize_tool_arguments(
        *,
        tool_name: str,
        tool_arguments: dict[str, object],
        current_entities: dict[str, object],
    ) -> dict[str, object]:
        entity_fields = _WRITE_TOOL_ENTITY_FIELDS.get(tool_name)
        if entity_fields is None:
            return tool_arguments

        task_context = task_context_from_entities(current_entities)
        entities = task_context.get('entities')
        if not isinstance(entities, dict):
            return {}

        if tool_name == 'master.create_location':
            sanitized = {key: entities[key] for key in entity_fields if entities.get(key) is not None}
            raw_type = tool_arguments.get('type')
            if 'type' not in sanitized and isinstance(raw_type, str) and raw_type.strip():
                sanitized['type'] = raw_type.strip()
            return sanitized
        else:
            sanitized = dict(tool_arguments)
            for key in entity_fields:
                value = entities.get(key)
                if value is not None:
                    sanitized[key] = value

        required_fields = _WRITE_TOOL_REQUIRED_FIELDS.get(tool_name, ())
        for key in required_fields:
            value = sanitized.get(key)
            if value is None:
                return {}
            if isinstance(value, str) and not value.strip():
                return {}
            if isinstance(value, list) and not value:
                return {}
        return sanitized

    @staticmethod
    def _tool_arguments_need_clarification(*, tool_name: str, tool_arguments: dict[str, object]) -> bool:
        if tool_name == 'master.create_location':
            return not tool_arguments
        if tool_name == 'purchasing.receive_po':
            return not (
                isinstance(tool_arguments.get('poId'), str)
                and bool(str(tool_arguments.get('poId') or '').strip())
                and isinstance(tool_arguments.get('locationId'), str)
                and bool(str(tool_arguments.get('locationId') or '').strip())
            )
        required_fields = _WRITE_TOOL_REQUIRED_FIELDS.get(tool_name)
        if required_fields is None:
            return False
        for key in required_fields:
            value = tool_arguments.get(key)
            if value is None:
                return True
            if isinstance(value, str) and not value.strip():
                return True
            if isinstance(value, list) and not value:
                return True
        return False

    @staticmethod
    def _should_bypass_tool_planning_for_ambiguous_message(
        *,
        user_message: str,
        state_update: RuntimeStateUpdate,
    ) -> bool:
        if state_update.is_workflow_edit:
            return False
        if state_update.primary_route != 'read':
            return False
        if state_update.primary_intent != 'inventory.stock_on_hand':
            return False
        if state_update.confidence >= 0.5:
            return False

        task_entities = state_update.task_context.get('entities')
        if isinstance(task_entities, dict) and any(value is not None for value in task_entities.values()):
            return False

        normalized = ' '.join(user_message.strip().split())
        if not normalized:
            return True

        tokens = re.findall(r"[A-Za-z0-9']+", normalized)
        if len(tokens) > 4:
            return False
        if any(char.isdigit() for char in normalized):
            return False
        if any(sep in normalized for sep in ('/', '@', ':')):
            return False
        return True

    @staticmethod
    def _conversational_response_directive(user_message: str) -> str:
        normalized = ' '.join(user_message.strip().split())
        if not normalized:
            return 'Send a short, natural reply that invites the user to continue.'
        return (
            'Reply to the user in one short sentence that matches their tone, '
            'acknowledges their message, and invites them to continue.'
        )

    @classmethod
    def _start_compound_sequence(
        cls,
        *,
        user_message: str,
        extracted_entities: dict[str, object],
        workflow_status: WorkflowStatus | None,
    ) -> tuple[str, dict[str, object]]:
        if workflow_status in {
            WorkflowStatus.NEEDS_INPUT,
            WorkflowStatus.AWAITING_CONFIRMATION,
            WorkflowStatus.AWAITING_APPROVAL,
        }:
            return user_message, extracted_entities
        existing_queue = extracted_entities.get('compoundQueue')
        if isinstance(existing_queue, list) and existing_queue:
            return user_message, extracted_entities

        clauses = cls._split_compound_message(user_message)
        if len(clauses) < 2:
            return user_message, extracted_entities

        queued_entities = dict(extracted_entities)
        queued_entities['compoundQueue'] = clauses[1:]
        return clauses[0], queued_entities

    @classmethod
    def _split_compound_message(cls, user_message: str) -> list[str]:
        normalized = ' '.join(user_message.strip().split())
        if not normalized:
            return []

        clauses = [
            part.strip(' ,;')
            for part in _COMPOUND_SEQUENCE_SPLIT_PATTERN.split(normalized)
            if isinstance(part, str) and part.strip(' ,;')
        ]
        if len(clauses) < 2:
            return [normalized]
        if not all(_COMPOUND_SEQUENCE_ACTION_PATTERN.search(part) for part in clauses):
            return [normalized]
        return clauses

    @staticmethod
    def _tool_result_has_no_matches(tool_result: dict[str, object]) -> bool:
        rows = tool_result.get('rows')
        return isinstance(rows, list) and len(rows) == 0

    @staticmethod
    def _fallback_clarification_for_intent(primary_intent: str) -> tuple[str, list[str]]:
        # Products
        if primary_intent == 'products.create_product':
            return (
                'Reply with the product name, style code, base price, color, and size details.',
                ['style_code', 'name', 'base_price', 'color_name', 'size_labels'],
            )
        if primary_intent == 'products.update_product':
            return (
                'Which product should I update, and what should change (name, price, category, or variant details)?',
                ['product_id', 'changes'],
            )

        # Sales
        if primary_intent == 'sales.create_invoice':
            return (
                'Reply with the customer plus product, color, size, and quantity for each sales order line.',
                ['customer_id', 'lines'],
            )
        if primary_intent == 'sales.dispatch_invoice':
            return (
                'Which sales order should I dispatch, and from which location?',
                ['sales_order_id', 'location_id'],
            )
        if primary_intent == 'sales.cancel_invoice':
            return ('Which sales order should I cancel?', ['sales_order_id'])

        # Purchasing
        if primary_intent == 'purchasing.create_po':
            return (
                'Reply with the supplier plus the product, color, size, and quantity for each PO line. Unit cost is optional if you want to use the product default.',
                ['supplier_id', 'lines'],
            )
        if primary_intent == 'purchasing.receive_po':
            return (
                'Which purchase order should I receive, and which location should it go to?',
                ['po_id', 'location_id'],
            )
        if primary_intent == 'purchasing.close_po':
            return ('Which purchase order should I close?', ['po_id'])

        # Inventory movements
        if primary_intent == 'inventory.transfer_stock':
            return (
                'Reply with the SKU/size (e.g. `SKUCODE/XL`), quantity, source location, and destination location.',
                ['sku_and_size', 'quantity', 'from_location_id', 'to_location_id'],
            )
        if primary_intent in {'inventory.adjust_stock', 'inventory.receive_stock', 'inventory.write_off_stock'}:
            return (
                'Reply with the SKU/size (e.g. `SKUCODE/XL`), quantity, and location.',
                ['sku_and_size', 'quantity', 'location_id'],
            )
        if primary_intent == 'inventory.stock_on_hand':
            return (
                'Which product, SKU, or location would you like stock details for?',
                ['productName'],
            )
        if primary_intent == 'inventory.variant_availability':
            return (
                'Which product, size, color, or stock condition should I search for?',
                ['productName'],
            )
        if primary_intent == 'analytics.low_stock':
            return (
                'What stock quantity threshold should I use for low stock?',
                ['threshold'],
            )
        if primary_intent == 'analytics.out_of_stock':
            return (
                'I can check out-of-stock products across all products. If you want to narrow it, reply with an optional location, SKU, or product name.',
                [],
            )
        if primary_intent == 'analytics.top_selling':
            return (
                'I can show top-selling products across all products. If you want to narrow it, reply with an optional timeframe or location.',
                [],
            )
        if primary_intent == 'analytics.no_recent_sales':
            return (
                'I can check products with no recent sales across all locations. If you want a different timeframe, reply with the number of days.',
                [],
            )
        if primary_intent == 'analytics.reorder_needed':
            return (
                'I can check products that need reorder across all products. If you want to narrow it, reply with an optional location or threshold.',
                [],
            )

        # Suppliers
        if primary_intent == 'master.create_supplier':
            return (
                'Reply with the supplier name, and optionally email, phone, and address.',
                ['name'],
            )
        if primary_intent == 'master.update_supplier':
            return (
                'Which supplier should I update, and what should change (name, email, phone, or address)?',
                ['supplier_id', 'patch'],
            )
        if primary_intent == 'master.delete_supplier':
            return ('Which supplier should I delete?', ['supplier_id'])

        # Customers
        if primary_intent == 'master.create_customer':
            return (
                'Reply with the customer name, and optionally email, phone, and address.',
                ['name'],
            )
        if primary_intent == 'master.update_customer':
            return (
                'Which customer should I update, and what should change (name, email, phone, or address)?',
                ['customer_id', 'patch'],
            )
        if primary_intent == 'master.delete_customer':
            return ('Which customer should I delete?', ['customer_id'])

        # Locations
        if primary_intent == 'master.create_location':
            return (
                'Reply with the location name, code, and type (warehouse, store, or outlet). Address and status are optional.',
                ['name', 'code', 'type'],
            )
        if primary_intent == 'master.update_location':
            return (
                'Which location should I update, and what should change?',
                ['location_id', 'patch'],
            )
        if primary_intent == 'master.delete_location':
            return ('Which location should I delete?', ['location_id'])

        # Reporting
        if primary_intent == 'reporting.stock_summary':
            return (
                'Which report do you need: stock summary, movement, purchase orders, or receipts?',
                ['report_type'],
            )

        return ('Could you clarify what you\'d like me to do? Please include the key details for your request.', [])

    @classmethod
    def _clarification_directive(
        cls,
        *,
        primary_intent: str,
        suggested_prompt: object,
    ) -> str:
        prompt = str(suggested_prompt or '').strip()
        if prompt and not _is_generic_clarification_prompt(prompt):
            return prompt
        fallback_prompt, _missing = cls._fallback_clarification_for_intent(primary_intent)
        return fallback_prompt

    @classmethod
    def _clarification_prompt_and_required(
        cls,
        *,
        primary_intent: str,
        suggested_prompt: object,
        suggested_required: object,
    ) -> tuple[str, list[str]]:
        required = [str(item) for item in suggested_required or [] if str(item)]
        prompt = str(suggested_prompt or '').strip()
        if prompt and not _is_generic_clarification_prompt(prompt):
            return prompt, required
        fallback_prompt, fallback_required = cls._fallback_clarification_for_intent(primary_intent)
        return fallback_prompt, (required or fallback_required)

    @staticmethod
    def _derived_context_entities(
        *,
        tool_name: str,
        tool_arguments: dict[str, object],
        tool_result: dict[str, object] | None = None,
        resolved_entities: object = None,
    ) -> dict[str, object]:
        entities: dict[str, object] = {}
        result_payload = AgentRuntimeService._tool_result_payload(tool_result)

        if tool_name == 'inventory.stock_on_hand':
            if isinstance(tool_arguments.get('productName'), str) and tool_arguments.get('productName'):
                entities['productName'] = str(tool_arguments['productName'])
            rows = result_payload.get('rows')
            if isinstance(rows, list):
                product_names = sorted(
                    {
                        str(row.get('product_name')).strip()
                        for row in rows
                        if isinstance(row, dict) and row.get('product_name')
                    }
                )
                color_names = sorted(
                    {
                        str(row.get('color_name')).strip()
                        for row in rows
                        if isinstance(row, dict) and row.get('color_name')
                    }
                )
                size_labels = sorted(
                    {
                        str(row.get('size_label')).strip()
                        for row in rows
                        if isinstance(row, dict) and row.get('size_label')
                    }
                )
                if len(product_names) == 1:
                    entities['productName'] = product_names[0]
                if color_names:
                    entities['colorNames'] = color_names
                    entities['colorName'] = color_names[0]
                if size_labels:
                    entities['sizeLabels'] = size_labels
                    entities['sizeLabel'] = size_labels[0]

        if tool_name.startswith('analytics.'):
            for key in ('threshold', 'days', 'period', 'limit', 'sort', 'category', 'color', 'size'):
                value = tool_arguments.get(key)
                if value is not None:
                    entities[key] = value
            if isinstance(tool_arguments.get('locationId'), str) and tool_arguments.get('locationId'):
                entities['locationId'] = str(tool_arguments['locationId'])
        if tool_name == 'inventory.variant_availability':
            for key in (
                'productName',
                'sku',
                'color',
                'size',
                'sizes',
                'availability',
                'threshold',
                'groupBy',
                'matchAllSizes',
                'excludeSize',
                'minColorCount',
                'maxColorCount',
                'maxInStockSizeCount',
            ):
                value = tool_arguments.get(key)
                if value is not None:
                    entities[key] = value
            if isinstance(tool_arguments.get('locationId'), str) and tool_arguments.get('locationId'):
                entities['locationId'] = str(tool_arguments['locationId'])
            rows = result_payload.get('rows')
            if isinstance(rows, list):
                product_names = sorted(
                    {
                        str(row.get('product_name')).strip()
                        for row in rows
                        if isinstance(row, dict) and row.get('product_name')
                    }
                )
                color_names = sorted(
                    {
                        str(row.get('color_name') or row.get('colors') or '').strip()
                        for row in rows
                        if isinstance(row, dict) and (row.get('color_name') or row.get('colors'))
                    }
                )
                size_labels = sorted(
                    {
                        str(row.get('size_label') or row.get('sizes') or '').strip()
                        for row in rows
                        if isinstance(row, dict) and (row.get('size_label') or row.get('sizes'))
                    }
                )
                if len(product_names) == 1:
                    entities['productName'] = product_names[0]
                if color_names:
                    entities['colorNames'] = color_names
                if size_labels:
                    entities['sizeLabels'] = size_labels

        if tool_name == 'master.create_customer':
            customer_name = str(tool_arguments.get('name') or result_payload.get('name') or '').strip()
            customer_id = str(result_payload.get('id') or result_payload.get('customerId') or '').strip()
            if customer_name:
                entities['customerName'] = customer_name
            if customer_id:
                entities['customerId'] = customer_id

        if tool_name == 'master.create_supplier':
            supplier_name = str(tool_arguments.get('name') or result_payload.get('name') or '').strip()
            supplier_id = str(result_payload.get('id') or result_payload.get('supplierId') or '').strip()
            if supplier_name:
                entities['supplierName'] = supplier_name
            if supplier_id:
                entities['supplierId'] = supplier_id

        if tool_name == 'master.create_location':
            location_name = str(tool_arguments.get('name') or result_payload.get('name') or '').strip()
            location_id = str(result_payload.get('id') or result_payload.get('locationId') or '').strip()
            if location_name:
                entities['locationName'] = location_name
            if location_id:
                entities['locationId'] = location_id

        if tool_name == 'purchasing.create_po':
            supplier_id = str(tool_arguments.get('supplierId') or result_payload.get('supplierId') or '').strip()
            supplier_name = str(tool_arguments.get('supplierName') or result_payload.get('supplierName') or '').strip()
            if supplier_id:
                entities['supplierId'] = supplier_id
            if supplier_name:
                entities['supplierName'] = supplier_name
            raw_lines = tool_arguments.get('lines')
            if isinstance(raw_lines, list):
                entities['lastPoLines'] = [dict(line) for line in raw_lines if isinstance(line, dict)]
            po_id = str(result_payload.get('id') or result_payload.get('poId') or '').strip()
            po_number = str(result_payload.get('poNumber') or result_payload.get('number') or '').strip()
            if po_id:
                entities['poId'] = po_id
            if po_number:
                entities['poNumber'] = po_number

        if tool_name == 'sales.create_invoice':
            customer_id = str(tool_arguments.get('customerId') or result_payload.get('customerId') or '').strip()
            customer_name = str(tool_arguments.get('customerName') or result_payload.get('customerName') or '').strip()
            if customer_id:
                entities['customerId'] = customer_id
            if customer_name:
                entities['customerName'] = customer_name
            invoice_id = str(result_payload.get('id') or result_payload.get('invoiceId') or '').strip()
            invoice_number = str(
                result_payload.get('invoiceNumber') or result_payload.get('salesOrderNumber') or result_payload.get('number') or ''
            ).strip()
            if invoice_id:
                entities['invoiceId'] = invoice_id
            if invoice_number:
                entities['invoiceNumber'] = invoice_number

        if tool_name == 'purchasing.get_po':
            supplier_id = str(result_payload.get('supplierId') or '').strip()
            supplier_name = str(result_payload.get('supplierName') or '').strip()
            po_id = str(result_payload.get('id') or '').strip()
            po_number = str(result_payload.get('poNumber') or result_payload.get('number') or '').strip()
            if supplier_id:
                entities['supplierId'] = supplier_id
            if supplier_name:
                entities['supplierName'] = supplier_name
            if po_id:
                entities['poId'] = po_id
            if po_number:
                entities['poNumber'] = po_number

        if tool_name == 'sales.get_invoice':
            customer_id = str(result_payload.get('customerId') or '').strip()
            customer_name = str(result_payload.get('customerName') or '').strip()
            invoice_id = str(result_payload.get('id') or '').strip()
            invoice_number = str(
                result_payload.get('invoiceNumber') or result_payload.get('salesOrderNumber') or result_payload.get('number') or ''
            ).strip()
            if customer_id:
                entities['customerId'] = customer_id
            if customer_name:
                entities['customerName'] = customer_name
            if invoice_id:
                entities['invoiceId'] = invoice_id
            if invoice_number:
                entities['invoiceNumber'] = invoice_number

        if tool_name == 'purchasing.list_pos':
            rows = result_payload.get('items')
            if isinstance(rows, list) and len(rows) == 1 and isinstance(rows[0], dict):
                row = rows[0]
                supplier_id = str(row.get('supplierId') or '').strip()
                supplier_name = str(row.get('supplierName') or row.get('supplier_name') or '').strip()
                po_id = str(row.get('id') or '').strip()
                po_number = str(row.get('poNumber') or row.get('number') or '').strip()
                if supplier_id:
                    entities['supplierId'] = supplier_id
                if supplier_name:
                    entities['supplierName'] = supplier_name
                if po_id:
                    entities['poId'] = po_id
                if po_number:
                    entities['poNumber'] = po_number

        if tool_name == 'sales.list_invoices':
            rows = result_payload.get('items')
            if isinstance(rows, list) and len(rows) == 1 and isinstance(rows[0], dict):
                row = rows[0]
                customer_id = str(row.get('customerId') or '').strip()
                customer_name = str(row.get('customerName') or row.get('customer_name') or '').strip()
                invoice_id = str(row.get('id') or '').strip()
                invoice_number = str(
                    row.get('invoiceNumber') or row.get('salesOrderNumber') or row.get('number') or ''
                ).strip()
                if customer_id:
                    entities['customerId'] = customer_id
                if customer_name:
                    entities['customerName'] = customer_name
                if invoice_id:
                    entities['invoiceId'] = invoice_id
                if invoice_number:
                    entities['invoiceNumber'] = invoice_number

        if tool_name == 'products.create_product':
            product_payload = tool_arguments.get('product')
            product = product_payload if isinstance(product_payload, dict) else tool_arguments
            product_name = str(product.get('name') or '').strip()
            style_code = str(product.get('styleCode') or '').strip()
            base_price = product.get('basePrice')
            if product_name:
                entities['productName'] = product_name
            if style_code:
                entities['styleCode'] = style_code
            if isinstance(base_price, int):
                entities['basePrice'] = base_price

            color_names: list[str] = []
            size_labels: list[str] = []
            raw_variants = tool_arguments.get('variants')
            if isinstance(raw_variants, list):
                for variant in raw_variants:
                    if not isinstance(variant, dict):
                        continue
                    color_name = str(variant.get('colorName') or variant.get('color') or '').strip()
                    if color_name and color_name not in color_names:
                        color_names.append(color_name)
                    raw_sizes = variant.get('sizes')
                    if isinstance(raw_sizes, list):
                        for raw_size in raw_sizes:
                            if not isinstance(raw_size, dict):
                                continue
                            size_label = str(raw_size.get('sizeLabel') or raw_size.get('size') or '').strip()
                            if size_label and size_label not in size_labels:
                                size_labels.append(size_label)
                    else:
                        size_label = str(variant.get('sizeLabel') or variant.get('size') or '').strip()
                        if size_label and size_label not in size_labels:
                            size_labels.append(size_label)
            if color_names:
                entities['colorNames'] = color_names
                if len(color_names) == 1:
                    entities['colorName'] = color_names[0]
            if size_labels:
                entities['sizeLabels'] = size_labels
                if len(size_labels) == 1:
                    entities['sizeLabel'] = size_labels[0]

        if isinstance(resolved_entities, dict):
            for key, value in resolved_entities.items():
                if isinstance(key, str) and value is not None:
                    entities[key] = value

        return entities

    @staticmethod
    def _tool_result_payload(tool_result: dict[str, object] | None) -> dict[str, object]:
        if not isinstance(tool_result, dict):
            return {}
        nested_result = tool_result.get('result')
        if isinstance(nested_result, dict):
            return nested_result
        return tool_result

    @staticmethod
    def _merge_context_from_tool_interaction(
        *,
        current_entities: dict[str, object],
        tool_name: str,
        tool_arguments: dict[str, object],
        tool_result: dict[str, object],
        resolved_entities: object = None,
    ) -> dict[str, object]:
        merged = dict(current_entities)
        task_context = task_context_from_entities(merged)
        entities = dict(task_context.get('entities') or {})
        entities.update(
            AgentRuntimeService._derived_context_entities(
                tool_name=tool_name,
                tool_arguments=tool_arguments,
                tool_result=tool_result,
                resolved_entities=resolved_entities,
            )
        )
        task_context['entities'] = entities
        merged.update(entities)
        merged['taskContext'] = task_context
        return apply_task_context(merged, task_context)

    @staticmethod
    def _event_payload(
        *,
        conversation_id: UUID,
        workflow_id: UUID,
        phase: str | None = None,
        tool_name: str | None = None,
        latency_ms: float | None = None,
        status: str | None = None,
        route: str | None = None,
        intent: str | None = None,
        confidence: float | None = None,
        rationale: str | None = None,
        missing_fields: list[str] | None = None,
        approval_required: bool | None = None,
        extra: dict[str, object] | None = None,
    ) -> dict[str, object]:
        payload: dict[str, object] = {
            'conversationId': str(conversation_id),
            'workflowId': str(workflow_id),
        }
        if phase is not None:
            payload['phase'] = phase
        if tool_name is not None:
            payload['toolName'] = tool_name
        if latency_ms is not None:
            payload['latencyMs'] = round(latency_ms, 2)
        if status is not None:
            payload['status'] = status
        if route is not None:
            payload['route'] = route
        if intent is not None:
            payload['intent'] = intent
        if confidence is not None:
            payload['confidence'] = confidence
        if rationale is not None:
            payload['rationale'] = rationale
        if missing_fields:
            payload['missingFields'] = missing_fields
        if approval_required is not None:
            payload['approvalRequired'] = approval_required
        if extra:
            payload.update(extra)
        return payload
