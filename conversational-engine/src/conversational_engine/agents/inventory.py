from __future__ import annotations

import re

from conversational_engine.agents.base import Agent
from conversational_engine.agents.entity_resolver import EntityResolver
from conversational_engine.agents.parsing import normalize
from conversational_engine.agents.types import AgentTurnResult
from conversational_engine.clients.backend import BackendClient
from conversational_engine.config.model_routing import ModelRouting
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import (
    ClarificationBlock,
    ConversationDetail,
    ErrorBlock,
    TableColumn,
    TableResultBlock,
    TextBlock,
    WorkflowState,
)
from conversational_engine.providers.base import ChatProvider, ProviderMessage
from conversational_engine.providers.json_schema import (
    bool_schema,
    int_schema,
    nullable,
    strict_object_schema,
    string_schema,
)

INVENTORY_EXTRACTION_SCHEMA = strict_object_schema(
    properties={
        'sku_code': nullable(string_schema()),
        'size_label': nullable(string_schema()),
        'quantity': nullable(int_schema()),
        'reason': nullable(string_schema()),
        'from_location': nullable(string_schema()),
        'to_location': nullable(string_schema()),
        'location': nullable(string_schema()),
        'cycle_count': nullable(bool_schema()),
        'write_off': nullable(bool_schema()),
    }
)


class InventoryAgent(Agent):
    name = 'inventory'

    def __init__(
        self,
        *,
        backend: BackendClient,
        resolver: EntityResolver,
        chat_provider: ChatProvider | None,
        routing: ModelRouting,
    ) -> None:
        self._backend = backend
        self._resolver = resolver
        self._chat_provider = chat_provider
        self._routing = routing

    def can_handle(self, intent: str) -> bool:
        return intent in {
            'stock_query',
            'stock_transfer',
            'stock_adjustment',
            'stock_receipt',
        }

    async def handle_turn(
        self,
        *,
        auth: AuthContext,
        conversation: ConversationDetail,
        workflow: WorkflowState,
        intent: str,
        user_message: str,
        memory: dict[str, object],
    ) -> AgentTurnResult:
        del conversation, workflow
        message = user_message.strip()
        normalized = normalize(message)

        # If the user asks for location options while we need a location, show them.
        if 'location' in normalized and 'what' in normalized and 'have' in normalized:
            locations = await self._resolver.list_locations(auth)
            rows = [{'name': loc.get('name'), 'code': loc.get('code')} for loc in locations]
            return AgentTurnResult(
                next_action='return_read_result',
                blocks=[
                    TextBlock(content='Available locations:'),
                    TableResultBlock(
                        title='Locations',
                        columns=[TableColumn(key='name', label='Name'), TableColumn(key='code', label='Code')],
                        rows=rows,
                    ),
                    ClarificationBlock(
                        prompt='Reply with the location name or code you want to use.',
                        required_fields=[],
                    ),
                ],
            )

        extracted: dict[str, object] = {}
        if self._chat_provider:
            model = self._routing.model_for(agent_name=self.name, task='extract')
            try:
                extracted = await self._chat_provider.complete_json(
                    model=model,
                    messages=[
                        ProviderMessage(
                            role='system',
                            content=(
                                'Extract inventory fields. sku_code should exclude size. size_label is like S/M/L. '
                                'For transfers, include from_location and to_location.'
                            ),
                        ),
                        ProviderMessage(role='user', content=message),
                    ],
                    json_schema=INVENTORY_EXTRACTION_SCHEMA,
                    max_tokens=220,
                )
            except Exception:
                extracted = {}

        sku_code = (
            str(extracted.get('sku_code')).upper()
            if isinstance(extracted.get('sku_code'), str) and extracted.get('sku_code')
            else None
        )
        size_label = (
            str(extracted.get('size_label')).upper()
            if isinstance(extracted.get('size_label'), str) and extracted.get('size_label')
            else None
        )
        quantity = extracted.get('quantity') if isinstance(extracted.get('quantity'), int) else None
        reason = extracted.get('reason') if isinstance(extracted.get('reason'), str) else None

        # Fallback parse for "SKU/SIZE" and "x10" patterns.
        if not sku_code:
            pair = re.search(r'([A-Za-z0-9-]+)\s*/\s*([A-Za-z0-9]+)', message)
            if pair:
                sku_code = pair.group(1).strip().upper()
                size_label = size_label or pair.group(2).strip().upper()
        if quantity is None:
            qty_match = re.search(r'\bx\s*(\d+)\b|\bqty\s*(\d+)\b|\bquantity\s*(\d+)\b', message, re.IGNORECASE)
            if qty_match:
                quantity = int(next(group for group in qty_match.groups() if group is not None))

        memory_updates: dict[str, object] = {}

        if sku_code:
            memory_updates['skuCode'] = sku_code
        if size_label:
            memory_updates['sizeLabel'] = size_label
        if quantity is not None:
            memory_updates['quantity'] = quantity
        if reason:
            memory_updates['reason'] = reason.strip()

        if intent == 'stock_transfer':
            memory_updates['actionType'] = 'transfer_stock'
            memory_updates['toolName'] = 'inventory.transferStock'
            from_text = extracted.get('from_location')
            to_text = extracted.get('to_location')
            from_location = None
            to_location = None
            if isinstance(from_text, str) and from_text.strip():
                from_location = await self._resolver.match_location(auth, from_text.strip())
            if isinstance(to_text, str) and to_text.strip():
                to_location = await self._resolver.match_location(auth, to_text.strip())
            from_location = from_location or await self._resolver.match_location(auth, message, qualifier='from')
            to_location = to_location or await self._resolver.match_location(auth, message, qualifier='to')
            if from_location:
                memory_updates['fromLocationId'] = from_location['id']
                memory_updates['fromLocationLabel'] = from_location['label']
            if to_location:
                memory_updates['toLocationId'] = to_location['id']
                memory_updates['toLocationLabel'] = to_location['label']
        elif intent == 'stock_receipt' or 'receive' in normalized:
            memory_updates['actionType'] = 'receive_stock'
            memory_updates['toolName'] = 'inventory.receiveStock'
        elif 'cycle count' in normalized:
            memory_updates['actionType'] = 'cycle_count'
            memory_updates['toolName'] = 'inventory.cycleCount'
        elif 'write off' in normalized or 'damaged' in normalized:
            memory_updates['actionType'] = 'write_off_stock'
            memory_updates['toolName'] = 'inventory.writeOffStock'
            memory_updates.setdefault('reason', 'damaged stock')
        elif intent == 'stock_adjustment':
            memory_updates['actionType'] = 'adjust_stock'
            memory_updates['toolName'] = 'inventory.adjustStock'

        # Location for non-transfer mutations
        if intent in {'stock_adjustment', 'stock_receipt'}:
            loc_text = extracted.get('location')
            location = None
            if isinstance(loc_text, str) and loc_text.strip():
                location = await self._resolver.match_location(auth, loc_text.strip())
            location = location or await self._resolver.match_location(auth, message)
            if location:
                memory_updates['locationId'] = location['id']
                memory_updates['locationLabel'] = location['label']

        # Resolve sizeId if skuCode + sizeLabel exist
        sku_for_size = str(memory_updates.get('skuCode') or memory.get('skuCode') or '')
        size_for_size = str(memory_updates.get('sizeLabel') or memory.get('sizeLabel') or '')
        if sku_for_size and size_for_size:
            size_ref = await self._resolver.resolve_size_reference(
                auth,
                sku_code=sku_for_size,
                size_label=size_for_size,
            )
            if size_ref:
                memory_updates.update(size_ref)

        merged = {**memory, **memory_updates}

        if intent == 'stock_query':
            params: dict[str, object] = {}
            if merged.get('skuCode'):
                params['sku'] = merged['skuCode']
            if merged.get('locationId'):
                params['locationId'] = merged['locationId']
            payload = await self._backend.stock_on_hand(auth.access_token or '', auth.tenant_id, params)
            rows = payload if isinstance(payload, list) else [payload]
            rows = [row for row in rows if isinstance(row, dict)]
            blocks = [
                TextBlock(content=f'Found {len(rows)} stock row(s).'),
                TableResultBlock(
                    title='Stock on hand',
                    columns=[
                        TableColumn(key='sku_code', label='SKU'),
                        TableColumn(key='product_name', label='Product'),
                        TableColumn(key='size_label', label='Size'),
                        TableColumn(key='location_code', label='Location'),
                        TableColumn(key='on_hand', label='On hand'),
                        TableColumn(key='available', label='Available'),
                    ],
                    rows=rows[:25],
                ),
            ]
            return AgentTurnResult(next_action='return_read_result', memory_updates=memory_updates, blocks=blocks)

        missing_fields = self._missing_fields(intent, merged)
        if missing_fields:
            return AgentTurnResult(
                next_action='ask_follow_up',
                memory_updates=memory_updates,
                missing_fields=missing_fields,
                follow_up_prompt=self._prompt(intent, missing_fields),
            )

        # Build execution payload + preview for the orchestrator to wrap.
        action_type = str(merged.get('actionType') or '')
        tool_name = str(merged.get('toolName') or '')
        if not action_type or not tool_name:
            return AgentTurnResult(
                next_action='return_read_result',
                memory_updates=memory_updates,
                blocks=[ErrorBlock(title='Unsupported inventory action', message='No tool could be selected.')],
            )

        if action_type == 'transfer_stock':
            execution_payload = {
                'fromLocationId': merged['fromLocationId'],
                'toLocationId': merged['toLocationId'],
                'sizeId': merged['sizeId'],
                'quantity': merged['quantity'],
                'reason': merged.get('reason', ''),
            }
            entities = [
                {'label': 'From', 'value': str(merged.get('fromLocationLabel', ''))},
                {'label': 'To', 'value': str(merged.get('toLocationLabel', ''))},
                {'label': 'SKU/Size', 'value': f'{merged.get("skuCode")} / {merged.get("sizeLabel")}'},
                {'label': 'Quantity', 'value': str(merged.get('quantity', ''))},
            ]
        else:
            execution_payload = {
                'locationId': merged['locationId'],
                'sizeId': merged['sizeId'],
                'quantity': merged['quantity'],
                'reason': merged.get('reason', ''),
            }
            entities = [
                {'label': 'Location', 'value': str(merged.get('locationLabel', ''))},
                {'label': 'SKU/Size', 'value': f'{merged.get("skuCode")} / {merged.get("sizeLabel")}'},
                {'label': 'Quantity', 'value': str(merged.get('quantity', ''))},
            ]

        preview = {
            'actionType': action_type.replace('_', ' ').title(),
            'actor': auth.email,
            'entities': entities,
            'warnings': [],
            'nextStep': 'Confirm to submit this request for approval.',
        }

        return AgentTurnResult(
            next_action='prepare_preview',
            memory_updates={
                **memory_updates,
                'actionType': action_type,
                'toolName': tool_name,
                'executionPayload': execution_payload,
                'preview': preview,
                'summary': action_type.replace('_', ' '),
            },
        )

    @staticmethod
    def _missing_fields(intent: str, memory: dict[str, object]) -> list[str]:
        required = []
        if intent == 'stock_transfer':
            required = ['from_location_id', 'to_location_id', 'sku_and_size', 'quantity', 'reason']
        elif intent in {'stock_adjustment', 'stock_receipt'}:
            required = ['location_id', 'sku_and_size', 'quantity', 'reason']

        missing: list[str] = []
        for field in required:
            if field == 'from_location_id' and not memory.get('fromLocationId'):
                missing.append(field)
            elif field == 'to_location_id' and not memory.get('toLocationId'):
                missing.append(field)
            elif field == 'location_id' and not memory.get('locationId'):
                missing.append(field)
            elif field == 'sku_and_size' and not memory.get('sizeId'):
                missing.append(field)
            elif field == 'quantity' and memory.get('quantity') is None:
                missing.append(field)
            elif field == 'reason' and not memory.get('reason'):
                missing.append(field)
        return missing

    @staticmethod
    def _prompt(intent: str, missing_fields: list[str]) -> str:
        if intent == 'stock_transfer':
            prompts = {
                'from_location_id': 'Which source location should stock move from?',
                'to_location_id': 'Which destination location should stock move to?',
                'sku_and_size': 'Which SKU and size should move? Reply like `SKUCODE/SIZE`.',
                'quantity': 'How many units should move?',
                'reason': 'What reason should be recorded for this transfer?',
            }
            return prompts[missing_fields[0]]
        prompts = {
            'location_id': 'Which location is affected?',
            'sku_and_size': 'Which SKU and size is affected? Reply like `SKUCODE/SIZE`.',
            'quantity': 'How many units should be changed?',
            'reason': 'What reason should be recorded?',
        }
        return prompts[missing_fields[0]]
