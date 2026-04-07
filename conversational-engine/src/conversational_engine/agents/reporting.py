from __future__ import annotations

from conversational_engine.agents.base import Agent
from conversational_engine.agents.entity_resolver import EntityResolver
from conversational_engine.agents.parsing import normalize, parse_iso_date
from conversational_engine.agents.types import AgentTurnResult
from conversational_engine.clients.backend import BackendClient
from conversational_engine.config.model_routing import ModelRouting
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import (
    ConversationDetail,
    TableColumn,
    TableResultBlock,
    TextBlock,
    WorkflowState,
)
from conversational_engine.providers.base import ChatProvider, ProviderMessage
from conversational_engine.providers.json_schema import (
    nullable,
    strict_object_schema,
    string_schema,
)

REPORTING_EXTRACTION_SCHEMA = strict_object_schema(
    properties={
        'report_type': nullable(string_schema()),
        'location': nullable(string_schema()),
        'status': nullable(string_schema()),
        'from_date': nullable(string_schema()),
    }
)


class ReportingAgent(Agent):
    name = 'reporting'

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
        return intent == 'reporting_query'

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
        del conversation, workflow, intent
        extracted: dict[str, object] = {}
        message = user_message.strip()

        if self._chat_provider:
            model = self._routing.model_for(agent_name=self.name, task='extract')
            try:
                result = await self._chat_provider.complete_json(
                    model=model,
                    messages=[
                        ProviderMessage(
                            role='system',
                            content=(
                                'Extract a reporting query. report_type must be one of: stock, movement, receipt, po. '
                                'from_date should be YYYY-MM-DD if present.'
                            ),
                        ),
                        ProviderMessage(role='user', content=message),
                    ],
                    json_schema=REPORTING_EXTRACTION_SCHEMA,
                    max_tokens=180,
                )
                extracted.update(result)
            except Exception:
                pass

        normalized = normalize(message)
        report_type = str(extracted.get('report_type') or memory.get('reportType') or 'stock').lower()
        if 'movement' in normalized:
            report_type = 'movement'
        elif 'receipt' in normalized:
            report_type = 'receipt'
        elif 'po' in normalized or 'purchase order' in normalized:
            report_type = 'po'

        location_text = extracted.get('location')
        location = None
        if isinstance(location_text, str) and location_text.strip():
            location = await self._resolver.match_location(auth, location_text.strip())
        if not location:
            location = await self._resolver.match_location(auth, message)

        params: dict[str, object] = {}
        if location:
            params['locationId'] = location['id']
        status = extracted.get('status')
        if isinstance(status, str) and status:
            params['status'] = status
        from_date = extracted.get('from_date')
        if isinstance(from_date, str) and from_date:
            params['from'] = parse_iso_date(from_date) or from_date
        elif parsed := parse_iso_date(message):
            params['from'] = parsed

        rows: list[dict[str, object]]
        if report_type == 'movement':
            rows = await self._backend.reporting_movement_summary(auth.access_token or '', auth.tenant_id, params)
            title = 'Movement summary'
        elif report_type == 'receipt':
            rows = await self._backend.reporting_receipt_summary(auth.access_token or '', auth.tenant_id, params)
            title = 'Receipt summary'
        elif report_type == 'po':
            rows = await self._backend.reporting_po_summary(auth.access_token or '', auth.tenant_id, params)
            title = 'Purchase order summary'
        else:
            rows = await self._backend.reporting_stock_summary(auth.access_token or '', auth.tenant_id, params)
            title = 'Stock summary'

        keys = list(rows[0].keys()) if rows else []
        columns = [TableColumn(key=key, label=key.replace('_', ' ').title()) for key in keys]
        blocks = [
            TextBlock(content=f'Found {len(rows)} row(s).'),
            TableResultBlock(title=title, columns=columns[:12], rows=rows[:25]),
        ]
        return AgentTurnResult(next_action='return_read_result', blocks=blocks)
