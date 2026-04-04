from __future__ import annotations

import re

from conversational_engine.agents.base_agent import Agent
from conversational_engine.agents.entity_resolver_agent import EntityResolver
from conversational_engine.agents.parsing_agent import normalize, parse_iso_date
from conversational_engine.agents.types_agent import AgentTurnResult
from conversational_engine.clients.backend_client import BackendClient
from conversational_engine.llm.routing_model import ModelRouting
from conversational_engine.schemas.auth_schemas import AuthContext
from conversational_engine.schemas.shared_schemas import ConversationDetail, ErrorBlock, WorkflowState
from conversational_engine.llm.provider_interfaces import ChatProvider, ProviderMessage
from conversational_engine.llm.json_schema_utils import nullable, strict_object_schema, string_schema

PURCHASING_EXTRACTION_SCHEMA = strict_object_schema(
    properties={
        'supplier': nullable(string_schema()),
        'po': nullable(string_schema()),
        'expected_date': nullable(string_schema()),
        'location': nullable(string_schema()),
        'lines': nullable(string_schema()),
    }
)


class PurchasingAgent(Agent):
    name = 'purchasing'

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
        return intent in {'po_create', 'po_update', 'po_receive', 'po_close'}

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
                                'Extract PO fields: supplier (name), po (number/id), expected_date (YYYY-MM-DD), '
                                'location (name/code), and lines as a raw string if present.'
                            ),
                        ),
                        ProviderMessage(role='user', content=message),
                    ],
                    json_schema=PURCHASING_EXTRACTION_SCHEMA,
                    max_tokens=240,
                )
            except Exception:
                extracted = {}

        memory_updates: dict[str, object] = {}
        normalized = normalize(message)

        if intent == 'po_create':
            memory_updates['actionType'] = 'create_po'
            memory_updates['toolName'] = 'purchasing.createPO'
        elif intent == 'po_receive':
            memory_updates['actionType'] = 'receive_po'
            memory_updates['toolName'] = 'purchasing.receivePO'
        elif intent == 'po_close' or 'close po' in normalized:
            memory_updates['actionType'] = 'close_po'
            memory_updates['toolName'] = 'purchasing.closePO'
        else:
            memory_updates['actionType'] = 'update_po'
            memory_updates['toolName'] = 'purchasing.updatePO'

        supplier_text = extracted.get('supplier')
        supplier = None
        if isinstance(supplier_text, str) and supplier_text.strip():
            supplier = await self._resolver.match_supplier(auth, supplier_text)
        supplier = supplier or await self._resolver.match_supplier(auth, message)
        if supplier:
            memory_updates['supplierId'] = supplier['id']
            memory_updates['supplierName'] = supplier['label']

        po_text = extracted.get('po')
        po_ref = None
        if isinstance(po_text, str) and po_text.strip():
            po_ref = await self._resolver.match_po(auth, po_text)
        po_ref = po_ref or await self._resolver.match_po(auth, message)
        if po_ref:
            memory_updates['poId'] = po_ref['id']
            memory_updates['poNumber'] = po_ref['number']

        location_text = extracted.get('location')
        location = None
        if isinstance(location_text, str) and location_text.strip():
            location = await self._resolver.match_location(auth, location_text)
        location = location or await self._resolver.match_location(auth, message)
        if location:
            memory_updates['locationId'] = location['id']
            memory_updates['locationLabel'] = location['label']

        expected_date_text = extracted.get('expected_date')
        if isinstance(expected_date_text, str) and expected_date_text.strip():
            parsed = parse_iso_date(expected_date_text) or parse_iso_date(message)
            if parsed:
                memory_updates['expectedDate'] = parsed
        elif parsed := parse_iso_date(message):
            memory_updates['expectedDate'] = parsed

        # Parse lines deterministically. Prefer explicit raw lines from LLM extraction if present.
        line_source = extracted.get('lines') if isinstance(extracted.get('lines'), str) else message
        allow_missing_cost = intent == 'po_receive'
        po_id_for_cost = str(memory_updates.get('poId') or memory.get('poId') or '')
        lines = await self._parse_po_lines(
            auth,
            line_source,
            po_id=po_id_for_cost,
            allow_missing_cost=allow_missing_cost,
        )
        if lines:
            memory_updates['lines'] = lines

        merged = {**memory, **memory_updates}
        missing_fields = self._missing_fields(intent, merged)
        if missing_fields:
            return AgentTurnResult(
                next_action='ask_follow_up',
                memory_updates=memory_updates,
                missing_fields=missing_fields,
                follow_up_prompt=self._prompt(intent, missing_fields),
            )

        action_type = str(merged.get('actionType') or '')
        tool_name = str(merged.get('toolName') or '')

        if action_type == 'create_po':
            execution_payload = {
                'supplierId': merged['supplierId'],
                'lines': merged['lines'],
            }
            if merged.get('expectedDate'):
                execution_payload['expectedDate'] = merged['expectedDate']
            entities = [
                {'label': 'Supplier', 'value': str(merged.get('supplierName', ''))},
                {'label': 'Line count', 'value': str(len(merged.get('lines', [])))},
            ]
        elif action_type == 'receive_po':
            execution_payload = {
                'poId': merged['poId'],
                'locationId': merged['locationId'],
                'lines': merged['lines'],
            }
            entities = [
                {'label': 'PO', 'value': str(merged.get('poNumber', merged.get('poId', '')))},
                {'label': 'Location', 'value': str(merged.get('locationLabel', ''))},
                {'label': 'Line count', 'value': str(len(merged.get('lines', [])))},
            ]
        elif action_type == 'close_po':
            execution_payload = {'poId': merged['poId']}
            entities = [{'label': 'PO', 'value': str(merged.get('poNumber', merged.get('poId', '')))}]
        elif action_type == 'update_po':
            patch: dict[str, object] = {}
            if merged.get('supplierId'):
                patch['supplierId'] = merged['supplierId']
            if merged.get('expectedDate'):
                patch['expectedDate'] = merged['expectedDate']
            if merged.get('lines'):
                patch['lines'] = merged['lines']
            execution_payload = {'poId': merged['poId'], 'patch': patch}
            entities = [
                {'label': 'PO', 'value': str(merged.get('poNumber', merged.get('poId', '')))},
                {'label': 'Changes', 'value': ', '.join(sorted(patch.keys())) or 'none'},
            ]
        else:
            return AgentTurnResult(
                next_action='return_read_result',
                memory_updates=memory_updates,
                blocks=[ErrorBlock(title='Unsupported PO action', message=f'Unknown action type: {action_type}')],
            )

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
                'summary': merged.get('summary') or action_type.replace('_', ' '),
            },
        )

    async def _parse_po_lines(
        self,
        auth: AuthContext,
        message: str,
        *,
        po_id: str,
        allow_missing_cost: bool,
    ) -> list[dict[str, object]]:
        segments = [segment.strip() for segment in re.split(r'[,\n;]+', message) if segment.strip()]
        if not segments:
            return []

        po_cost_map: dict[tuple[str, str], int] = {}
        if allow_missing_cost and po_id:
            po_detail = await self._backend.get_po(auth.access_token or '', auth.tenant_id, po_id)
            for line in po_detail.get('lines', []):
                if not isinstance(line, dict):
                    continue
                sku = str(line.get('sku') or '')
                if '-' not in sku:
                    continue
                sku_code, size_label = sku.rsplit('-', 1)
                po_cost_map[(sku_code.upper(), size_label.upper())] = int(line.get('unitCost') or 0)

        lines: list[dict[str, object]] = []
        pattern = re.compile(
            r'(?P<sku>[A-Za-z0-9-]+)\s*/\s*(?P<size>[A-Za-z0-9]+)\s*x(?P<qty>\d+)(?:\s*@(?P<cost>\d+))?',
            re.IGNORECASE,
        )
        for segment in segments:
            match = pattern.search(segment)
            if not match:
                continue
            size_ref = await self._resolver.resolve_size_reference(
                auth,
                sku_code=match.group('sku').upper(),
                size_label=match.group('size').upper(),
            )
            if not size_ref or not size_ref.get('sizeId'):
                continue
            cost = match.group('cost')
            if cost is None and allow_missing_cost:
                cost = str(po_cost_map.get((match.group('sku').upper(), match.group('size').upper()), 0))
            if cost is None:
                continue
            lines.append(
                {
                    'sizeId': size_ref['sizeId'],
                    'qty': int(match.group('qty')),
                    'unitCost': int(cost),
                }
            )
        return lines

    @staticmethod
    def _missing_fields(intent: str, memory: dict[str, object]) -> list[str]:
        required: list[str]
        if intent == 'po_create':
            required = ['supplier_id', 'lines']
        elif intent == 'po_receive':
            required = ['po_id', 'location_id', 'lines']
        elif intent == 'po_close':
            required = ['po_id']
        else:
            required = ['po_id', 'changes']

        missing: list[str] = []
        for field in required:
            if field == 'supplier_id' and not memory.get('supplierId'):
                missing.append(field)
            elif field == 'lines' and not memory.get('lines'):
                missing.append(field)
            elif field == 'po_id' and not memory.get('poId'):
                missing.append(field)
            elif field == 'location_id' and not memory.get('locationId'):
                missing.append(field)
            elif field == 'changes':
                if not any(memory.get(key) is not None for key in ('supplierId', 'expectedDate', 'lines')):
                    missing.append(field)
        return missing

    @staticmethod
    def _prompt(intent: str, missing_fields: list[str]) -> str:
        if intent == 'po_create':
            if 'supplier_id' in missing_fields:
                return 'Which supplier should this PO draft use?'
            return 'Reply with PO lines in the format `SKUCODE/SIZE xQTY @UNIT_COST`, separated by commas.'
        if intent == 'po_receive':
            if 'po_id' in missing_fields:
                return 'Which purchase order should I receive? Reply with the PO number, PO id, or supplier name.'
            if 'location_id' in missing_fields:
                return 'Which location should receive this PO?'
            return 'Reply with receipt lines in the format `SKUCODE/SIZE xQTY`, separated by commas.'
        if intent == 'po_update':
            if 'po_id' in missing_fields:
                return 'Which purchase order should I update? Reply with the PO number, PO id, or supplier name.'
            return 'What should change on the PO? You can update supplier, expected date, or lines.'
        return 'Which purchase order should I close?'
