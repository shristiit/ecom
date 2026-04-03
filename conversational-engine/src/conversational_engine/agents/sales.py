from __future__ import annotations

import re

from conversational_engine.agents.base import Agent
from conversational_engine.agents.entity_resolver import EntityResolver
from conversational_engine.agents.types import AgentTurnResult
from conversational_engine.clients.backend import BackendClient
from conversational_engine.config.model_routing import ModelRouting
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import ConversationDetail, ErrorBlock, WorkflowState
from conversational_engine.providers.base import ChatProvider, ProviderMessage
from conversational_engine.providers.json_schema import nullable, strict_object_schema, string_schema

SALES_EXTRACTION_SCHEMA = strict_object_schema(
    properties={
        'customer': nullable(string_schema()),
        'sales_order': nullable(string_schema()),
        'location': nullable(string_schema()),
        'lines': nullable(string_schema()),
    }
)


class SalesAgent(Agent):
    name = 'sales'

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
        return intent in {'so_create', 'so_update', 'so_dispatch', 'so_cancel'}

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
                                'Extract sales order fields: customer (name), sales_order (number/id), '
                                'location (name/code), and lines as a raw string if present.'
                            ),
                        ),
                        ProviderMessage(role='user', content=message),
                    ],
                    json_schema=SALES_EXTRACTION_SCHEMA,
                    max_tokens=240,
                )
            except Exception:
                extracted = {}

        memory_updates: dict[str, object] = {}

        if intent == 'so_create':
            memory_updates['actionType'] = 'create_sales_order'
            memory_updates['toolName'] = 'sales.createInvoice'
        elif intent == 'so_update':
            memory_updates['actionType'] = 'update_sales_order'
            memory_updates['toolName'] = 'sales.updateInvoice'
        elif intent == 'so_dispatch':
            memory_updates['actionType'] = 'dispatch_sales_order'
            memory_updates['toolName'] = 'sales.dispatchInvoice'
        else:
            memory_updates['actionType'] = 'cancel_sales_order'
            memory_updates['toolName'] = 'sales.cancelInvoice'

        customer_text = extracted.get('customer')
        customer = None
        if isinstance(customer_text, str) and customer_text.strip():
            customer = await self._resolver.match_customer(auth, customer_text)
        customer = customer or await self._resolver.match_customer(auth, message)
        if customer:
            memory_updates['customerId'] = customer['id']
            memory_updates['customerName'] = customer['label']

        invoice_text = extracted.get('sales_order')
        invoice_ref = None
        if isinstance(invoice_text, str) and invoice_text.strip():
            invoice_ref = await self._resolver.match_invoice(auth, invoice_text)
        invoice_ref = invoice_ref or await self._resolver.match_invoice(auth, message)
        if invoice_ref:
            memory_updates['invoiceId'] = invoice_ref['id']
            memory_updates['invoiceNumber'] = invoice_ref['number']

        location_text = extracted.get('location')
        location = None
        if isinstance(location_text, str) and location_text.strip():
            location = await self._resolver.match_location(auth, location_text)
        location = location or await self._resolver.match_location(auth, message)
        if location:
            memory_updates['locationId'] = location['id']
            memory_updates['locationLabel'] = location['label']

        line_source = extracted.get('lines') if isinstance(extracted.get('lines'), str) else message
        lines = await self._parse_sales_lines(auth, line_source)
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

        if action_type == 'create_sales_order':
            execution_payload = {
                'customerId': merged['customerId'],
                'lines': merged['lines'],
            }
            entities = [
                {'label': 'Customer', 'value': str(merged.get('customerName', ''))},
                {'label': 'Line count', 'value': str(len(merged.get('lines', [])))},
            ]
        elif action_type == 'update_sales_order':
            patch: dict[str, object] = {}
            if merged.get('customerId'):
                patch['customerId'] = merged['customerId']
            if merged.get('lines'):
                patch['lines'] = merged['lines']
            execution_payload = {'invoiceId': merged['invoiceId'], 'patch': patch}
            entities = [
                {'label': 'Sales order', 'value': str(merged.get('invoiceNumber', merged.get('invoiceId', '')))},
                {'label': 'Changes', 'value': ', '.join(sorted(patch.keys())) or 'none'},
            ]
        elif action_type == 'dispatch_sales_order':
            execution_payload = {'invoiceId': merged['invoiceId'], 'locationId': merged['locationId']}
            entities = [
                {'label': 'Sales order', 'value': str(merged.get('invoiceNumber', merged.get('invoiceId', '')))},
                {'label': 'Location', 'value': str(merged.get('locationLabel', ''))},
            ]
        elif action_type == 'cancel_sales_order':
            execution_payload = {'invoiceId': merged['invoiceId']}
            entities = [
                {
                    'label': 'Sales order',
                    'value': str(merged.get('invoiceNumber', merged.get('invoiceId', ''))),
                }
            ]
        else:
            return AgentTurnResult(
                next_action='return_read_result',
                memory_updates=memory_updates,
                blocks=[ErrorBlock(title='Unsupported sales action', message=f'Unknown action type: {action_type}')],
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
                'summary': action_type.replace('_', ' '),
            },
        )

    async def _parse_sales_lines(self, auth: AuthContext, message: str) -> list[dict[str, object]]:
        segments = [segment.strip() for segment in re.split(r'[,\n;]+', message) if segment.strip()]
        if not segments:
            return []

        lines: list[dict[str, object]] = []
        pattern = re.compile(
            r'(?P<sku>[A-Za-z0-9-]+)\s*/\s*(?P<size>[A-Za-z0-9]+)\s*x(?P<qty>\d+)(?:\s*@(?P<price>\d+))?',
            re.IGNORECASE,
        )
        for segment in segments:
            match = pattern.search(segment)
            if not match or match.group('price') is None:
                continue
            size_ref = await self._resolver.resolve_size_reference(
                auth,
                sku_code=match.group('sku').upper(),
                size_label=match.group('size').upper(),
            )
            if not size_ref or not size_ref.get('sizeId'):
                continue
            lines.append(
                {
                    'sizeId': size_ref['sizeId'],
                    'qty': int(match.group('qty')),
                    'unitPrice': int(match.group('price')),
                }
            )
        return lines

    @staticmethod
    def _missing_fields(intent: str, memory: dict[str, object]) -> list[str]:
        required: list[str]
        if intent == 'so_create':
            required = ['customer_id', 'lines']
        elif intent == 'so_dispatch':
            required = ['invoice_id', 'location_id']
        elif intent == 'so_cancel':
            required = ['invoice_id']
        else:
            required = ['invoice_id', 'changes']

        missing: list[str] = []
        for field in required:
            if field == 'customer_id' and not memory.get('customerId'):
                missing.append(field)
            elif field == 'lines' and not memory.get('lines'):
                missing.append(field)
            elif field == 'invoice_id' and not memory.get('invoiceId'):
                missing.append(field)
            elif field == 'location_id' and not memory.get('locationId'):
                missing.append(field)
            elif field == 'changes':
                if not any(memory.get(key) is not None for key in ('customerId', 'lines')):
                    missing.append(field)
        return missing

    @staticmethod
    def _prompt(intent: str, missing_fields: list[str]) -> str:
        if intent == 'so_create':
            if 'customer_id' in missing_fields:
                return 'Which customer should this sales order use?'
            return 'Reply with sales order lines in the format `SKUCODE/SIZE xQTY @UNIT_PRICE`, separated by commas.'
        if intent == 'so_update':
            if 'invoice_id' in missing_fields:
                return 'Which sales order should I update? Reply with the SO number, invoice id, or customer name.'
            return 'What should change on the sales order? You can update customer or lines.'
        if intent == 'so_dispatch':
            if 'invoice_id' in missing_fields:
                return 'Which sales order should I dispatch?'
            return 'Which location should dispatch this sales order?'
        return 'Which sales order should I cancel?'
