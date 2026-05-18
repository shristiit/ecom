from __future__ import annotations

from collections.abc import Callable
from typing import Any

from conversational_engine.providers.router import ProviderRouter, ProviderTrace
from conversational_engine.providers.runtime import ProviderMessage
from conversational_engine.utils.json_parsing import parse_json_object

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
                        'You are the state-update agent for an internal inventory management AI runtime. '
                        'Decide whether the latest user turn continues the active workflow or starts a new one. '
                        'Use the recent conversation and task context together.\n\n'
                        'DOMAIN: This system manages stock, products, purchase orders, sales orders, suppliers, '
                        'customers, locations, and warehouses. Almost ALL user messages are domain-relevant. '
                        'Only use primaryIntent="off_topic" for truly off-domain requests (weather, general chat, '
                        'cooking, etc.). Questions about sales, stock levels, movements, reports, or any inventory '
                        'concept are NEVER off_topic. A bare name, email address, or contact detail in reply to '
                        'a clarification question is domain-relevant workflow input, never off_topic.\n\n'
                        'VALID primaryIntent values:\n'
                        '  Read/analytics: inventory.stock_on_hand, inventory.variant_availability, '
                        'analytics.low_stock, analytics.out_of_stock, analytics.top_selling, analytics.slow_moving, '
                        'analytics.no_recent_sales, analytics.reorder_needed, analytics.stock_value, '
                        'analytics.high_demand_low_stock, analytics.recently_added, analytics.data_quality, '
                        'reporting.stock_summary, reporting.movement_summary, reporting.po_summary, '
                        'reporting.receipt_summary, purchasing.list_pos, purchasing.get_po, '
                        'sales.list_invoices, sales.get_invoice, master.search_suppliers, master.search_customers, '
                        'master.search_locations, products.search_products, products.find_product\n'
                        '  Mutations: purchasing.create_po, purchasing.receive_po, purchasing.close_po, '
                        'purchasing.cancel_po, purchasing.update_po, sales.create_invoice, sales.dispatch_invoice, '
                        'sales.cancel_invoice, sales.update_invoice, inventory.receive_stock, '
                        'inventory.transfer_stock, inventory.adjust_stock, inventory.write_off_stock, '
                        'master.create_supplier, master.update_supplier, master.delete_supplier, '
                        'master.create_customer, master.update_customer, master.delete_customer, '
                        'master.create_location, master.update_location, master.delete_location, '
                        'products.create_product\n'
                        '  Other: navigation.find_screen, off_topic\n\n'
                        'CREATE vs UPDATE: Use purchasing.create_po when the user says "create/make/raise/new '
                        'purchase order/PO" — no existing PO number is referenced. Use purchasing.update_po ONLY '
                        'when the user references an existing PO by number (e.g. "update PO-2534"). Same rule '
                        'applies to sales orders: sales.create_invoice for new orders, sales.update_invoice only '
                        'when referencing an existing order number.\n\n'
                        'ENTITY PATCHES: Extract concrete values the user provides in this turn. '
                        'Purchase order references like "PO-2534", "po 2534", or "po number 2534" should go into '
                        'entityPatchesJson as {"poId": "PO-2534"}. '
                        'SKU codes like "NAR243-RED-01" should go as {"skuCode": "NAR243-RED-01"}. '
                        'For supplier/customer creation workflows, a reply like "Acme Ltd / acme@example.com" '
                        'should go as {"name": "Acme Ltd", "email": "acme@example.com"}. A bare name like '
                        '"Acme Ltd" with no email should go as {"name": "Acme Ltd"}. '
                        'Do NOT invent names or IDs not mentioned by the user. '
                        'If the user refers to an entity indirectly ("this product", "same supplier"), '
                        'keep useActiveWorkflow true and leave entityPatchesJson empty.\n\n'
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
                elif block_type == 'preview':
                    action_type = str(block.get('actionType') or '').strip()
                    entities = block.get('entities')
                    entity_parts: list[str] = []
                    if isinstance(entities, list):
                        for entity in entities:
                            if not isinstance(entity, dict):
                                continue
                            label = str(entity.get('label') or '').strip()
                            value = str(entity.get('value') or '').strip()
                            if label and value:
                                entity_parts.append(f'{label}={value}')
                    summary = ', '.join(entity_parts)
                    if action_type and summary:
                        content_parts.append(f'preview: {action_type} ({summary})')
                    elif action_type:
                        content_parts.append(f'preview: {action_type}')
                    elif summary:
                        content_parts.append(f'preview: {summary}')
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
        normalized['entityPatches'] = parse_json_object(raw_patches, source='State updater')
    elif isinstance(raw_patches, dict):
        normalized['entityPatches'] = raw_patches
    else:
        normalized['entityPatches'] = {}

    normalized.pop('entityPatchesJson', None)
    return normalized
