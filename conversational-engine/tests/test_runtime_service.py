from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from conversational_engine.clients.backend import BackendValidationError
from conversational_engine.contracts.api import ApprovalRequestStatus, GovernanceEvaluationResponse
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import BlockType, WorkflowStatus
from conversational_engine.providers.router import ProviderAttempt, ProviderTrace
from conversational_engine.providers.runtime import ProviderResponse
from conversational_engine.runtime.service import AgentRuntimeService

pytestmark = pytest.mark.anyio

LOCATION_A = '11111111-1111-1111-1111-111111111111'
LOCATION_B = '22222222-2222-2222-2222-222222222222'
LOCATION_C = '33333333-3333-3333-3333-333333333333'
SIZE_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'


class FakePlanner:
    def __init__(self, action: str = 'tool') -> None:
        self._action = action

    async def plan(self, **kwargs):
        del kwargs
        return {
            'goal': 'Check stock in London',
            'action': self._action,
            'reasoning': 'Need stock rows.',
            'clarificationQuestion': None,
            'requiredInputs': [],
            'toolObjective': 'Read stock',
        }


class FakePlannerWithFallbackTrace(FakePlanner):
    async def plan(self, **kwargs):
        trace_callback = kwargs.get('trace_callback')
        if trace_callback:
            trace_callback(
                'planner',
                ProviderTrace(
                    response=ProviderResponse(
                        provider_name='openai',
                        model_name='gpt-4.1',
                        content='{}',
                        parsed={},
                        raw_payload={'ok': True},
                    ),
                    attempts=[
                        ProviderAttempt(
                            provider_name='gemini',
                            model_name='gemini-2.5-flash',
                            error='timeout',
                        )
                    ],
                ),
            )
        return await super().plan(**kwargs)


class FakeExecutor:
    def __init__(self, tool_name: str, tool_arguments: dict[str, object]) -> None:
        self._tool_name = tool_name
        self._tool_arguments = tool_arguments

    async def propose(self, **kwargs):
        del kwargs
        return {
            'action': 'tool',
            'assistantMessage': f'Running {self._tool_name}',
            'toolName': self._tool_name,
            'toolArguments': self._tool_arguments,
            'requiredInputs': [],
        }


class RoutedFakeExecutor:
    def __init__(self, proposals: dict[str, tuple[str, dict[str, object]]]) -> None:
        self._proposals = proposals

    async def propose(self, **kwargs):
        expected_tool_name = str(kwargs.get('expected_tool_name') or '')
        tool_name, tool_arguments = self._proposals[expected_tool_name]
        return {
            'action': 'tool',
            'assistantMessage': f'Running {tool_name}',
            'toolName': tool_name,
            'toolArguments': tool_arguments,
            'requiredInputs': [],
        }


class FakeInvalidExecutor:
    async def propose(self, **kwargs):
        del kwargs
        return {
            'action': 'tool',
            'assistantMessage': None,
            'toolName': None,
            'toolArguments': None,
            'requiredInputs': [],
        }


class FakeClarifyExecutor:
    def __init__(self, required_inputs: list[str] | None = None, assistant_message: str | None = None) -> None:
        self._required_inputs = required_inputs or []
        self._assistant_message = assistant_message

    async def propose(self, **kwargs):
        del kwargs
        return {
            'action': 'clarify',
            'assistantMessage': self._assistant_message,
            'toolName': None,
            'toolArguments': None,
            'requiredInputs': self._required_inputs,
        }


class FakeReviewer:
    def __init__(
        self,
        action: str = 'complete',
        message: str = 'Here is the result.',
        include_table: bool = False,
        resolved_entities: dict[str, object] | None = None,
    ) -> None:
        self._action = action
        self._message = message
        self._include_table = include_table
        self._resolved_entities = resolved_entities or {}

    async def review(self, **kwargs):
        del kwargs
        return {
            'action': self._action,
            'assistantMessage': self._message,
            'feedback': None,
            'requiredInputs': [],
            'includeTable': self._include_table,
            'resolvedEntities': self._resolved_entities,
        }


class FakeClarifyReviewer:
    def __init__(self, required_inputs: list[str] | None = None, assistant_message: str | None = None) -> None:
        self._required_inputs = required_inputs or []
        self._assistant_message = assistant_message

    async def review(self, **kwargs):
        del kwargs
        return {
            'action': 'clarify',
            'assistantMessage': self._assistant_message,
            'feedback': None,
            'requiredInputs': self._required_inputs,
            'includeTable': False,
            'resolvedEntities': {},
        }


class FakeNarrator:
    async def write_message(self, **kwargs):
        fallback_message = kwargs.get('fallback_message')
        if isinstance(fallback_message, str) and fallback_message:
            return fallback_message
        user_message = str(kwargs.get('user_message') or '').strip()
        if user_message:
            return f'Response to: {user_message}'
        return str(kwargs.get('directive') or 'Done.')


class FakeDirectiveNarrator:
    async def write_message(self, **kwargs):
        return str(kwargs.get('directive') or 'Done.')


class FakeMemoryService:
    async def build(self, **kwargs):
        del kwargs

        class Context:
            session_memory = {'tenantId': 'tenant-1'}
            workflow_memory = {'workflowId': 'workflow-1'}
            recent_messages = []
            latest_summary = None
            recent_entities = []
            business_memory = []
            user_memory = []
            semantic_memory = []

        return Context()


class FakeTrainingService:
    async def record_trace(self, **kwargs):
        del kwargs


class FakeRetrievalService:
    async def resolve_navigation(self, query: str):
        normalized = query.lower()
        if 'movement' in normalized:
            return [
                {
                    'label': 'Inventory Movements',
                    'href': '/inventory/movements',
                    'description': 'Inventory movement history page.',
                }
            ]
        if 'purchase' in normalized:
            return [
                {
                    'label': 'Purchase Orders',
                    'href': '/orders/purchase',
                    'description': 'Purchase order listing page.',
                }
            ]
        return []


class FakeStateUpdater:
    def __init__(self, decisions: dict[str, dict[str, object]] | None = None) -> None:
        self._decisions = decisions or {}

    async def decide(self, **kwargs):
        message = str(kwargs.get('user_message') or '')
        return self._decisions.get(
            message,
            {
                'useActiveWorkflow': False,
                'primaryRoute': 'read',
                'primaryIntent': 'inventory.stock_on_hand',
                'confidence': 0.8,
                'rationale': 'Default fake state update.',
                'entityPatches': {},
                'navigationQuery': None,
                'postActionQuery': None,
            },
        )


class FakeBackendClient:
    def __init__(self) -> None:
        self.customer_payloads: list[dict[str, object]] = []
        self.customer_updates: list[tuple[str, dict[str, object]]] = []
        self.receipt_payloads: list[dict[str, object]] = []
        self.products = [{'id': 'prod-1', 'name': 'Field Fresh Short', 'styleCode': 'FFS-001'}]
        self.product_detail = {
            'product': {'id': 'prod-1', 'base_price': 42},
            'skus': [{'id': 'sku-sand', 'color_name': 'Sand', 'price_override': None}],
            'sizes': [
                {'id': 'size-sand-l', 'sku_id': 'sku-sand', 'size_label': 'L', 'price_override': None},
                {'id': 'size-sand-m', 'sku_id': 'sku-sand', 'size_label': 'M', 'price_override': None},
            ],
        }

    async def check_ai_usage_quota(self, *args, **kwargs):
        del args, kwargs
        return {'allowed': True}

    async def record_ai_usage(self, *args, **kwargs):
        del args, kwargs
        return {'ok': True}

    async def record_audit_event(self, *args, **kwargs):
        del args, kwargs
        return {'ok': True}

    async def stock_on_hand(self, *args, **kwargs):
        del args, kwargs
        return [{'sku_code': 'TSHIRT-BLACK', 'location_code': 'WH-LON', 'available': 12}]

    async def transfer_stock(self, *args, **kwargs):
        del args, kwargs
        return {'ok': True}

    async def adjust_stock(self, *args, **kwargs):
        del args, kwargs
        return {'ok': True}

    async def receive_stock(self, *args, **kwargs):
        payload = kwargs.get('payload')
        if payload is None and len(args) >= 3:
            payload = args[2]
        if isinstance(payload, dict):
            self.receipt_payloads.append(payload)
        return {'ok': True}

    async def reporting_stock_summary(self, *args, **kwargs):
        del args, kwargs
        return [{'location_code': 'WH-LON', 'on_hand': 12}]

    async def create_po(self, *args, **kwargs):
        del args, kwargs
        return {'ok': True, 'id': 'po-1', 'poNumber': 'PO-001'}

    async def create_invoice(self, *args, **kwargs):
        del args, kwargs
        return {'ok': True, 'id': 'inv-1', 'invoiceNumber': 'SO-001'}

    async def create_product(self, *args, **kwargs):
        del args, kwargs
        return {'ok': True}

    async def create_location(self, *args, **kwargs):
        del args, kwargs
        return {'ok': True, 'id': 'loc-created', 'name': 'Warehouse North'}

    async def create_customer(self, access_token: str, tenant_id: str | None, payload: dict[str, object]):
        del access_token, tenant_id
        self.customer_payloads.append(payload)
        return {'ok': True, 'id': 'cust-created', 'payload': payload}

    async def update_customer(
        self, access_token: str, tenant_id: str | None, customer_id: str, payload: dict[str, object]
    ):
        del access_token, tenant_id
        self.customer_updates.append((customer_id, payload))
        return {'ok': True, 'customerId': customer_id, 'payload': payload}

    async def delete_customer(self, *args, **kwargs):
        del args, kwargs
        return {'ok': True}

    async def list_locations(self, *args, **kwargs):
        del args, kwargs
        return [
            {'id': LOCATION_A, 'name': 'Warehouse A', 'code': 'WH-01'},
            {'id': LOCATION_B, 'name': 'Soho Store', 'code': 'SOHO'},
            {'id': LOCATION_C, 'name': 'Camden Store', 'code': 'Camden'},
        ]

    async def list_suppliers(self, *args, **kwargs):
        del args, kwargs
        return [{'id': 'sup-1', 'name': 'Acme Supply', 'code': 'ACME'}]

    async def list_customers(self, *args, **kwargs):
        del args, kwargs
        return [
            {'id': 'cust-1', 'name': 'Helen Barrows', 'email': 'helen41@yahoo.com', 'code': 'HELEN'},
            {'id': 'cust-2', 'name': 'Bob Smith', 'email': 'bob@example.com', 'code': 'BOB'},
        ]

    async def list_categories(self, *args, **kwargs):
        del args, kwargs
        return []

    async def list_pos(self, *args, **kwargs):
        del args, kwargs
        return {'items': [{'id': 'po-1', 'number': 'PO-001', 'supplierId': 'sup-1', 'supplierName': 'Acme Supply'}]}

    async def list_invoices(self, *args, **kwargs):
        del args, kwargs
        return {'items': [{'id': 'inv-1', 'number': 'SO-001', 'customerId': 'cust-1', 'customerName': 'Helen Barrows'}]}

    async def search_skus(self, access_token: str, tenant_id: str | None, q: str | None = None):
        del access_token, tenant_id
        if q and q.upper() != 'FFS-001':
            return []
        return [{'id': 'sku-sand', 'product_id': 'prod-1', 'sku_code': 'FFS-001'}]

    async def search_products(self, access_token: str, tenant_id: str | None, q: str | None = None, **kwargs):
        del access_token, tenant_id, kwargs
        if not q:
            return self.products
        lowered = q.lower()
        return [
            product
            for product in self.products
            if lowered in str(product['name']).lower() or lowered in str(product.get('styleCode') or '').lower()
        ]

    async def get_product(self, access_token: str, tenant_id: str | None, product_id: str):
        del access_token, tenant_id
        assert product_id == 'prod-1'
        return self.product_detail

    async def get_po(self, access_token: str, tenant_id: str | None, po_id: str):
        del access_token, tenant_id
        assert po_id == 'po-1'
        return {
            'id': 'po-1',
            'lines': [
                {
                    'skuId': 'size-sand-m',
                    'sku': 'FFS-001-M',
                    'qtyOrdered': 20,
                    'qtyReceived': 0,
                    'unitCost': 42,
                },
                {
                    'skuId': 'size-sand-l',
                    'sku': 'FFS-001-L',
                    'qtyOrdered': 10,
                    'qtyReceived': 0,
                    'unitCost': 42,
                },
            ],
        }

    async def evaluate_approval(self, *args, **kwargs):
        del args, kwargs
        return GovernanceEvaluationResponse(requires_approval=False, reason=None)

    async def create_approval_request(self, *args, **kwargs):
        del args, kwargs
        return ApprovalRequestStatus(
            id=uuid4(),
            status='pending',
            conversation_id=uuid4(),
            workflow_id=uuid4(),
            action_type='inventory.transfer_stock',
            tool_name='inventory.transfer_stock',
            summary='Transfer stock',
            reason='Approval required',
            preview={},
            execution_payload={},
            result={},
            requested_by='user-1',
            approved_by=None,
            created_at=datetime.now(UTC).isoformat(),
            updated_at=datetime.now(UTC).isoformat(),
        )


class FakeApprovalBackendClient(FakeBackendClient):
    async def evaluate_approval(self, *args, **kwargs):
        del args, kwargs
        return GovernanceEvaluationResponse(requires_approval=True, reason='Threshold exceeded')


class FlakyReadBackendClient(FakeBackendClient):
    def __init__(self) -> None:
        super().__init__()
        self.stock_attempts = 0

    async def stock_on_hand(self, *args, **kwargs):
        del args, kwargs
        self.stock_attempts += 1
        if self.stock_attempts == 1:
            raise BackendValidationError(
                status_code=400,
                message='sizeId is required',
                details=['lines.0.sizeId: required'],
            )
        return [{'sku_code': 'TSHIRT-BLACK', 'location_code': 'WH-LON', 'available': 12}]


class EmptyResultsBackendClient(FakeBackendClient):
    async def stock_on_hand(self, *args, **kwargs):
        del args, kwargs
        return []


class FakeAuditService:
    def __init__(self) -> None:
        self.events: list[dict[str, object]] = []

    async def record(self, **kwargs):
        self.events.append(kwargs)
        return kwargs


def make_auth() -> AuthContext:
    return AuthContext(
        id='user-1',
        tenant_id='tenant-1',
        role_id='role-1',
        email='ops@example.com',
        permissions=['chat.use'],
        access_token='token',
    )


async def test_runtime_service_completes_read_flow():
    events: list[tuple[str, dict[str, object]]] = []
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {'sku': 'TSHIRT-BLACK'}),
        reviewer=FakeReviewer(message='Stock is available in London.'),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='show stock for black t-shirt',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda event_type, payload: events.append((event_type, payload)),
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.COMPLETED
    assert any(event_type == 'tool.called' for event_type, _payload in events)
    assert not any(block.type == BlockType.TABLE_RESULT for block in outcome.blocks)


async def test_runtime_service_clarifies_invalid_read_tool_payload_before_backend_call():
    backend = FakeBackendClient()
    service = AgentRuntimeService(
        backend_client=backend,  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('master.search_locations', {}),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='show me warehouse locations',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.NEEDS_INPUT
    assert any(block.type == BlockType.CLARIFICATION for block in outcome.blocks)
    assert 'query' in outcome.missing_fields


async def test_runtime_service_retries_after_backend_validation_error():
    backend = FlakyReadBackendClient()
    service = AgentRuntimeService(
        backend_client=backend,  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {'sku': 'TSHIRT-BLACK'}),
        reviewer=FakeReviewer(message='Stock is available in London.'),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='show stock for black t-shirt',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.COMPLETED
    assert backend.stock_attempts == 2


async def test_runtime_service_redirects_off_topic_requests():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {'sku': 'TSHIRT-BLACK'}),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'what is the size of the earth': {
                    'useActiveWorkflow': False,
                    'primaryRoute': 'read',
                    'primaryIntent': 'off_topic',
                    'confidence': 0.99,
                    'rationale': 'Outside the supported inventory domain.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='what is the size of the earth',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.COMPLETED
    assert 'inventory' in outcome.blocks[0].content.lower()


async def test_runtime_service_returns_no_matches_without_narrator_hallucination():
    service = AgentRuntimeService(
        backend_client=EmptyResultsBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {'sku': 'TSHIRT-BLACK'}),
        reviewer=FakeReviewer(message='This should be ignored.'),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='show stock for black t-shirt',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.COMPLETED
    assert outcome.blocks[0].content == "I couldn't find any matches."


async def test_runtime_service_includes_table_when_user_requests_full_details():
    events: list[tuple[str, dict[str, object]]] = []
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {'sku': 'TSHIRT-BLACK'}),
        reviewer=FakeReviewer(message='Stock is available in London.', include_table=True),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='show stock for black t-shirt',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda event_type, payload: events.append((event_type, payload)),
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.COMPLETED
    assert any(event_type == 'tool.called' for event_type, _payload in events)
    assert any(block.type == BlockType.TABLE_RESULT for block in outcome.blocks)


async def test_runtime_service_records_tool_execution_audit_event():
    audit = FakeAuditService()
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {'sku': 'TSHIRT-BLACK'}),
        reviewer=FakeReviewer(message='Stock is available in London.'),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        audit_service=audit,  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    conversation_id = uuid4()
    workflow_id = uuid4()
    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=conversation_id,
        workflow_id=workflow_id,
        user_message='show stock for black t-shirt',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.COMPLETED
    assert audit.events[0]['event_type'] == 'tool_executed'
    assert audit.events[0]['conversation_id'] == str(conversation_id)
    assert audit.events[0]['workflow_id'] == str(workflow_id)
    assert audit.events[0]['tool_name'] == 'inventory.stock_on_hand'


async def test_runtime_service_requests_approval_for_high_risk_writes():
    events: list[tuple[str, dict[str, object]]] = []
    service = AgentRuntimeService(
        backend_client=FakeApprovalBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor(
            'inventory.transfer_stock',
            {
                'fromLocationId': 'WH-01',
                'toLocationId': 'SOHO',
                'sizeId': SIZE_1,
                'quantity': 10,
            },
        ),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='move 10 units to showroom',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda event_type, payload: events.append((event_type, payload)),
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert not any(event_type == 'approval.requested' for event_type, _payload in events)
    assert any(block.type == BlockType.CONFIRMATION_REQUIRED for block in outcome.blocks)
    assert outcome.extracted_entities['executionPayload']['fromLocationId'] == LOCATION_A
    assert outcome.extracted_entities['executionPayload']['toLocationId'] == LOCATION_B


async def test_runtime_service_requests_approval_for_customer_create():
    events: list[tuple[str, dict[str, object]]] = []
    service = AgentRuntimeService(
        backend_client=FakeApprovalBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor(
            'master.create_customer',
            {'name': 'Helen Barrows', 'email': 'helen41@yahoo.com'},
        ),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='create a customer named Helen Barrows with email helen41@yahoo.com',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda event_type, payload: events.append((event_type, payload)),
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert any(block.type == BlockType.CONFIRMATION_REQUIRED for block in outcome.blocks)
    assert outcome.extracted_entities['executionPayload'] == {
        'name': 'Helen Barrows',
        'email': 'helen41@yahoo.com',
    }
    assert not any(event_type == 'approval.requested' for event_type, _payload in events)


async def test_runtime_service_starts_fresh_contact_workflow_when_intent_changes():
    service = AgentRuntimeService(
        backend_client=FakeApprovalBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor(
            'master.create_customer',
            {
                'name': 'Aibuyer',
                'email': 'aibuyer@gmail.com',
            },
        ),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'create a customer named Aibuyer with email aibuyer@gmail.com': {
                    'useActiveWorkflow': False,
                    'primaryRoute': 'mutation',
                    'primaryIntent': 'master.create_customer',
                    'confidence': 0.97,
                    'rationale': 'The user started a new customer creation request.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='create a customer named Aibuyer with email aibuyer@gmail.com',
        extracted_entities={
            '_workflowEngine': 'runtime',
            'toolName': 'master.create_supplier',
            'executionPayload': {
                'name': 'aiseller',
                'email': 'aisell@sell.com',
                'address': 'london',
            },
            'activeApprovalId': str(uuid4()),
            'activeApprovalStatus': 'pending',
            'basePrice': 25,
            'styleCode': 'ai-0033',
            'taskContext': {
                'primaryRoute': 'mutation',
                'primaryIntent': 'master.create_supplier',
                'entities': {
                    'name': 'aiseller',
                    'email': 'aisell@sell.com',
                    'address': 'london',
                    'basePrice': 25,
                    'styleCode': 'ai-0033',
                },
                'missingFields': [],
                'postActions': [],
                'clarificationCount': 0,
                'status': 'awaiting_approval',
            },
        },
        recent_messages=[],
        workflow_status=WorkflowStatus.AWAITING_APPROVAL,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert outcome.extracted_entities['executionPayload'] == {
        'name': 'Aibuyer',
        'email': 'aibuyer@gmail.com',
    }
    assert outcome.extracted_entities['preview']['preparedArguments'] == {
        'name': 'Aibuyer',
        'email': 'aibuyer@gmail.com',
    }
    assert outcome.extracted_entities['activeApprovalId'] is None
    assert outcome.extracted_entities['_approvalOperation'] == 'create_new'
    assert 'basePrice' not in outcome.extracted_entities['taskContext']['entities']
    assert 'styleCode' not in outcome.extracted_entities['taskContext']['entities']


async def test_runtime_service_keeps_existing_contact_name_when_user_confirms_reuse_with_yes():
    service = AgentRuntimeService(
        backend_client=FakeApprovalBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor(
            'master.create_supplier',
            {
                'name': 'aiseller',
                'email': 'aisell@sell.com',
                'address': 'london',
            },
        ),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'yes': {
                    'useActiveWorkflow': True,
                    'primaryRoute': 'mutation',
                    'primaryIntent': 'master.create_supplier',
                    'confidence': 0.96,
                    'rationale': 'The user confirmed that the existing supplier details should be reused.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='yes',
        extracted_entities={
            '_workflowEngine': 'runtime',
            'toolName': 'master.create_supplier',
            'executionPayload': {
                'name': 'aiseller',
                'email': 'aisell@sell.com',
                'address': 'london',
            },
            'taskContext': {
                'primaryRoute': 'mutation',
                'primaryIntent': 'master.create_supplier',
                'entities': {
                    'name': 'aiseller',
                    'email': 'aisell@sell.com',
                    'address': 'london',
                },
                'missingFields': ['name'],
                'postActions': [],
                'clarificationCount': 1,
                'status': 'drafting',
            },
        },
        recent_messages=[],
        workflow_status=WorkflowStatus.NEEDS_INPUT,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert outcome.extracted_entities['executionPayload']['name'] == 'aiseller'
    assert outcome.extracted_entities['preview']['preparedArguments']['name'] == 'aiseller'


async def test_runtime_service_handles_trace_attempts_without_crashing():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlannerWithFallbackTrace(),
        executor=FakeExecutor('inventory.stock_on_hand', {'sku': 'TSHIRT-BLACK'}),
        reviewer=FakeReviewer(message='Stock is available in London.'),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='show stock for black t-shirt',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.COMPLETED


async def test_runtime_service_returns_navigation_blocks_without_tool_execution():
    events: list[tuple[str, dict[str, object]]] = []
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {'sku': 'TSHIRT-BLACK'}),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='take me to purchase orders',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda event_type, payload: events.append((event_type, payload)),
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.COMPLETED
    assert any(block.type == BlockType.NAVIGATION for block in outcome.blocks)
    assert not any(event_type == 'tool.called' for event_type, _payload in events)
    assert any(event_type == 'route.resolved' for event_type, _payload in events)


async def test_runtime_service_updates_pending_confirmation_in_place():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.transfer_stock', {'quantity': 5}),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'actually make it 10 and use Camden as the source': {
                    'useActiveWorkflow': True,
                    'primaryRoute': 'mutation',
                    'primaryIntent': 'inventory.transfer_stock',
                    'confidence': 0.96,
                    'rationale': 'This is an edit to the pending transfer.',
                    'entityPatches': {
                        'quantity': 10,
                        'fromLocationId': 'Camden',
                    },
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    extracted_entities = {
        '_workflowEngine': 'runtime',
        'toolName': 'inventory.transfer_stock',
        'executionPayload': {
            'fromLocationId': 'WH-01',
            'toLocationId': 'SOHO',
            'sizeId': SIZE_1,
            'quantity': 5,
            'reason': 'rebalance',
        },
        'taskContext': {
            'primaryRoute': 'mutation',
            'primaryIntent': 'inventory.transfer_stock',
            'entities': {
                'fromLocationId': 'WH-01',
                'toLocationId': 'SOHO',
                'sizeId': SIZE_1,
                'quantity': 5,
            },
            'missingFields': [],
            'postActions': [],
            'clarificationCount': 0,
            'status': 'awaiting_confirmation',
        },
    }

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='actually make it 10 and use Camden as the source',
        extracted_entities=extracted_entities,
        recent_messages=[],
        workflow_status=WorkflowStatus.AWAITING_CONFIRMATION,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert any(block.type == BlockType.CONFIRMATION_REQUIRED for block in outcome.blocks)
    assert outcome.extracted_entities['executionPayload']['quantity'] == 10
    assert outcome.extracted_entities['executionPayload']['fromLocationId'] == LOCATION_C


async def test_runtime_service_executes_post_navigation_after_success():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor(
            'inventory.transfer_stock',
            {
                'fromLocationId': 'WH-01',
                'toLocationId': 'SOHO',
                'sizeId': SIZE_1,
                'quantity': 5,
                'reason': 'rebalance',
            },
        ),
        reviewer=FakeReviewer(message='Transfer prepared successfully.'),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='transfer 5 units to Soho and then show movements',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    task_context = outcome.extracted_entities['taskContext']
    assert task_context['primaryRoute'] == 'mixed'
    assert task_context['postActions']


async def test_runtime_service_clarifies_missing_required_fields_before_confirmation():
    service = AgentRuntimeService(
        backend_client=FakeApprovalBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor(
            'products.create_product',
            {
                'styleCode': 'TEE-100',
                'name': 'Sample Tee',
                'basePrice': 100,
            },
        ),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='create a product called Sample Tee',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.NEEDS_INPUT
    assert any(block.type == BlockType.CLARIFICATION for block in outcome.blocks)
    assert 'color_name' in outcome.missing_fields


async def test_runtime_service_confirmation_preview_uses_authenticated_actor():
    service = AgentRuntimeService(
        backend_client=FakeApprovalBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor(
            'master.create_customer',
            {'name': 'Helen Fields', 'email': 'helen@example.com'},
        ),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='create customer Helen Fields',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    preview_blocks = [block for block in outcome.blocks if block.type == BlockType.PREVIEW]
    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert preview_blocks[0].actor == 'ops@example.com'


async def test_runtime_service_clarifies_missing_customer_name_before_confirmation():
    service = AgentRuntimeService(
        backend_client=FakeApprovalBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor(
            'master.create_customer',
            {'email': 'helen41@yahoo.com'},
        ),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='create a customer with email helen41@yahoo.com',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.NEEDS_INPUT
    assert any(block.type == BlockType.CLARIFICATION for block in outcome.blocks)
    assert 'name' in outcome.missing_fields


async def test_runtime_service_confirmation_edit_can_expand_inventory_receipt_to_all_sizes():
    service = AgentRuntimeService(
        backend_client=FakeApprovalBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor(
            'inventory.receive_stock',
            {
                'locationId': 'Warehouse A',
                'productName': 'Field Fresh Short',
                'colorName': 'Sand',
                'sizeLabel': 'L',
                'quantity': 100,
            },
        ),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'all sizes not only l': {
                    'useActiveWorkflow': True,
                    'primaryRoute': 'mutation',
                    'primaryIntent': 'inventory.receive_stock',
                    'confidence': 0.95,
                    'rationale': 'The user is editing the pending receipt.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    first_outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='receive 100 units of Field Fresh Short Sand L in Warehouse A',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert first_outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert first_outcome.extracted_entities['executionPayload']['sizeId'] == 'size-sand-l'

    edited_outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='all sizes not only l',
        extracted_entities=first_outcome.extracted_entities,
        recent_messages=[],
        workflow_status=WorkflowStatus.AWAITING_CONFIRMATION,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert edited_outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert edited_outcome.extracted_entities['executionPayload']['quantity'] == 200
    assert edited_outcome.extracted_entities['executionPayload']['lines'] == [
        {'sizeId': 'size-sand-l', 'quantity': 100, 'reason': ''},
        {'sizeId': 'size-sand-m', 'quantity': 100, 'reason': ''},
    ]


async def test_runtime_service_clarifies_empty_customer_update_patch_before_confirmation():
    service = AgentRuntimeService(
        backend_client=FakeApprovalBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor(
            'master.update_customer',
            {'customerId': 'bob@example.com'},
        ),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='update customer bob@example.com',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.NEEDS_INPUT
    assert any(block.type == BlockType.CLARIFICATION for block in outcome.blocks)


async def test_runtime_service_ignores_invented_create_location_fields_and_clarifies():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor(
            'master.create_location',
            {'name': 'Main Warehouse', 'code': 'WH-001', 'type': 'warehouse'},
        ),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'create a ware house locations': {
                    'useActiveWorkflow': False,
                    'primaryRoute': 'mutation',
                    'primaryIntent': 'master.create_location',
                    'confidence': 0.95,
                    'rationale': 'Creating a new warehouse location.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='create a ware house locations',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.NEEDS_INPUT
    assert outcome.missing_fields == ['name', 'code']
    assert any(block.type == BlockType.CLARIFICATION for block in outcome.blocks)


async def test_runtime_service_applies_location_clarification_reply_without_replanning():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {'sku': 'TSHIRT-BLACK'}),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='name : leicester\nlec-01\nwarehosue',
        extracted_entities={
            '_workflowEngine': 'runtime',
            'toolName': 'master.create_location',
            'executionPayload': {'type': 'warehouse'},
            'taskContext': {
                'primaryRoute': 'mutation',
                'primaryIntent': 'master.create_location',
                'entities': {'type': 'warehouse'},
                'missingFields': ['name', 'code'],
                'postActions': [],
                'clarificationCount': 1,
                'status': 'drafting',
            },
        },
        recent_messages=[],
        workflow_status=WorkflowStatus.NEEDS_INPUT,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert outcome.extracted_entities['executionPayload']['name'] == 'leicester'
    assert outcome.extracted_entities['executionPayload']['code'] == 'lec-01'
    assert outcome.extracted_entities['executionPayload']['type'] == 'warehouse'
    assert any(block.type == BlockType.CONFIRMATION_REQUIRED for block in outcome.blocks)


async def test_runtime_service_applies_po_clarification_reply_with_product_price_lookup():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {'sku': 'TSHIRT-BLACK'}),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='get it from the products',
        extracted_entities={
            '_workflowEngine': 'runtime',
            'toolName': 'purchasing.create_po',
            'executionPayload': {
                'supplierId': 'Acme Supply',
                'lines': [
                    {
                        'productName': 'Field Fresh Short',
                        'colorName': 'Sand',
                        'sizeLabel': 'L',
                        'quantity': 5,
                    }
                ],
            },
            'taskContext': {
                'primaryRoute': 'mutation',
                'primaryIntent': 'purchasing.create_po',
                'entities': {
                    'supplierId': 'Acme Supply',
                    'lines': [
                        {
                            'productName': 'Field Fresh Short',
                            'colorName': 'Sand',
                            'sizeLabel': 'L',
                            'quantity': 5,
                        }
                    ],
                },
                'missingFields': [],
                'postActions': [],
                'clarificationCount': 1,
                'status': 'drafting',
            },
        },
        recent_messages=[],
        workflow_status=WorkflowStatus.NEEDS_INPUT,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert outcome.extracted_entities['executionPayload']['supplierId'] == 'sup-1'
    assert outcome.extracted_entities['executionPayload']['lines'] == [
        {'sizeId': 'size-sand-l', 'qty': 5, 'unitCost': 42}
    ]
    assert any(block.type == BlockType.CONFIRMATION_REQUIRED for block in outcome.blocks)


async def test_runtime_service_edits_pending_po_in_awaiting_approval_and_requests_variant_selection():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {'sku': 'TSHIRT-BLACK'}),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='FFS-001\n20 items',
        extracted_entities={
            '_workflowEngine': 'runtime',
            'toolName': 'purchasing.create_po',
            'executionPayload': {
                'supplierId': 'Acme Supply',
                'lines': [
                    {
                        'productName': 'Field Fresh Short',
                        'colorName': 'Sand',
                        'sizeLabel': 'L',
                        'quantity': 10,
                    }
                ],
            },
            'activeApprovalId': str(uuid4()),
            'activeApprovalStatus': 'pending',
            'taskContext': {
                'primaryRoute': 'mutation',
                'primaryIntent': 'purchasing.create_po',
                'entities': {
                    'supplierId': 'Acme Supply',
                    'lines': [
                        {
                            'productName': 'Field Fresh Short',
                            'colorName': 'Sand',
                            'sizeLabel': 'L',
                            'quantity': 10,
                        }
                    ],
                },
                'missingFields': [],
                'postActions': [],
                'clarificationCount': 0,
                'status': 'awaiting_approval',
            },
        },
        recent_messages=[],
        workflow_status=WorkflowStatus.AWAITING_APPROVAL,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.NEEDS_INPUT
    assert any(block.type == BlockType.CLARIFICATION for block in outcome.blocks)
    assert 'Which variant should I use?' in outcome.blocks[0].prompt
    assert 'Sand / L' in outcome.blocks[0].prompt
    assert outcome.extracted_entities['toolName'] == 'purchasing.create_po'


async def test_runtime_service_clarification_reply_preserves_latest_po_lines_over_stale_task_context():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {'sku': 'TSHIRT-BLACK'}),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='use the same supplier',
        extracted_entities={
            '_workflowEngine': 'runtime',
            'toolName': 'purchasing.create_po',
            'executionPayload': {
                'lines': [
                    {
                        'productName': 'Field Fresh Short',
                        'colorName': 'Sand',
                        'sizeLabel': 'M',
                        'quantity': 20,
                    }
                ],
            },
                'taskContext': {
                    'primaryRoute': 'mutation',
                    'primaryIntent': 'purchasing.create_po',
                    'entities': {
                        'supplierId': 'Acme Supply',
                    'lines': [
                        {
                            'productName': 'Field Fresh Short',
                            'colorName': 'Sand',
                            'sizeLabel': 'L',
                            'quantity': 10,
                        }
                    ],
                },
                'missingFields': ['supplier_id'],
                'postActions': [],
                'clarificationCount': 1,
                'status': 'drafting',
            },
            'missingFields': ['supplier_id'],
        },
        recent_messages=[],
        workflow_status=WorkflowStatus.NEEDS_INPUT,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert outcome.extracted_entities['executionPayload']['supplierId'] == 'sup-1'
    assert outcome.extracted_entities['executionPayload']['lines'] == [
        {'sizeId': 'size-sand-m', 'qty': 20, 'unitCost': 42}
    ]
    assert any(block.type == BlockType.CONFIRMATION_REQUIRED for block in outcome.blocks)


async def test_runtime_service_reuses_completed_read_context_for_this_follow_up():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {'productName': 'Monarch Soft Overshirt'}),
        reviewer=FakeReviewer(message='Here are the variants.'),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'what sizes we have in this': {
                    'useActiveWorkflow': True,
                    'primaryRoute': 'read',
                    'primaryIntent': 'inventory.stock_on_hand',
                    'confidence': 0.94,
                    'rationale': 'Follow-up question refers to the active product context.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    first_outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='get me all the variants in this Monarch Soft Overshirt',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    task_context = first_outcome.extracted_entities['taskContext']
    assert task_context['entities']['productName'] == 'Monarch Soft Overshirt'

    follow_up = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='what sizes we have in this',
        extracted_entities=first_outcome.extracted_entities,
        recent_messages=[],
        workflow_status=WorkflowStatus.COMPLETED,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    follow_task_context = follow_up.extracted_entities['taskContext']
    assert follow_task_context['primaryIntent'] == 'inventory.stock_on_hand'
    assert follow_task_context['entities']['productName'] == 'Monarch Soft Overshirt'


async def test_runtime_service_enriches_product_create_confirmation_context():
    service = AgentRuntimeService(
        backend_client=FakeApprovalBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor(
            'products.create_product',
            {
                'styleCode': 'FFS-001',
                'name': 'Field Fresh Short',
                'basePrice': 100,
                'variants': [{'color': 'sand', 'size': 'xl'}],
            },
        ),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='create a product named Field Fresh Short with style code FFS-001 price 100 in sand xl',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    task_entities = outcome.extracted_entities['taskContext']['entities']
    assert task_entities['productName'] == 'Field Fresh Short'
    assert task_entities['styleCode'] == 'FFS-001'
    assert task_entities['colorName'] == 'Sand'
    assert task_entities['sizeLabel'] == 'XL'


async def test_runtime_service_invalid_executor_proposal_requests_clarification():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeInvalidExecutor(),  # type: ignore[arg-type]
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'create a sales order for this product': {
                    'useActiveWorkflow': False,
                    'primaryRoute': 'mutation',
                    'primaryIntent': 'sales.create_invoice',
                    'confidence': 0.95,
                    'rationale': 'Detected a sales order request.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='create a sales order for this product',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.NEEDS_INPUT
    assert outcome.missing_fields == ['customer_id', 'lines']
    assert any(block.type == BlockType.CLARIFICATION for block in outcome.blocks)
    assert outcome.extracted_entities['pendingTask']['intent'] == 'sales.create_invoice'
    assert outcome.extracted_entities['pendingTask']['missingFields'] == ['customer_id', 'lines']


async def test_runtime_service_planner_clarification_uses_intent_specific_prompt():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(action='clarify'),
        executor=FakeExecutor('inventory.stock_on_hand', {'sku': 'TSHIRT-BLACK'}),
        reviewer=FakeReviewer(),
        narrator=FakeDirectiveNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'dispatch sales order': {
                    'useActiveWorkflow': False,
                    'primaryRoute': 'mutation',
                    'primaryIntent': 'sales.dispatch_invoice',
                    'confidence': 0.95,
                    'rationale': 'Dispatch request detected.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='dispatch sales order',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.NEEDS_INPUT
    assert outcome.blocks[0].prompt == 'Which sales order should I dispatch, and from which location?'
    assert outcome.missing_fields == ['sales_order_id', 'location_id']


async def test_runtime_service_executor_clarification_uses_intent_specific_prompt():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeClarifyExecutor(),  # type: ignore[arg-type]
        reviewer=FakeReviewer(),
        narrator=FakeDirectiveNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'receive purchase order': {
                    'useActiveWorkflow': False,
                    'primaryRoute': 'mutation',
                    'primaryIntent': 'purchasing.receive_po',
                    'confidence': 0.95,
                    'rationale': 'Receipt request detected.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='receive purchase order',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.NEEDS_INPUT
    assert outcome.blocks[0].prompt == 'Which purchase order should I receive, and which location should it go to?'
    assert outcome.missing_fields == ['po_id', 'location_id']


async def test_runtime_service_reviewer_clarification_uses_intent_specific_prompt():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {'sku': 'TSHIRT-BLACK'}),
        reviewer=FakeClarifyReviewer(assistant_message='Please clarify your request.'),  # type: ignore[arg-type]
        narrator=FakeDirectiveNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'create purchase order': {
                    'useActiveWorkflow': False,
                    'primaryRoute': 'mutation',
                    'primaryIntent': 'purchasing.create_po',
                    'confidence': 0.95,
                    'rationale': 'PO creation request detected.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='create purchase order',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.NEEDS_INPUT
    assert (
        outcome.blocks[0].prompt
        == 'Reply with the supplier name and PO lines in the format `SKUCODE/SIZE xQTY @UNIT_COST`, separated by commas.'
    )
    assert outcome.missing_fields == ['supplier_id', 'lines']


async def test_runtime_service_missing_resolved_write_reference_requests_clarification():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('sales.cancel_invoice', {}),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'cancel it': {
                    'useActiveWorkflow': False,
                    'primaryRoute': 'mutation',
                    'primaryIntent': 'sales.cancel_invoice',
                    'confidence': 0.95,
                    'rationale': 'Detected a sales order cancellation request.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='cancel it',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.NEEDS_INPUT
    assert outcome.missing_fields == ['sales_order_id']
    assert any(block.type == BlockType.CLARIFICATION for block in outcome.blocks)
    assert outcome.extracted_entities['pendingTask']['intent'] == 'sales.cancel_invoice'


def test_runtime_service_sanitizes_write_arguments_from_task_context_entities():
    tool_arguments = AgentRuntimeService._sanitize_tool_arguments(
        tool_name='sales.dispatch_invoice',
        tool_arguments={'invoiceId': 'it', 'locationId': 'there'},
        current_entities={
            'taskContext': {
                'entities': {
                    'invoiceId': 'inv-1',
                    'locationId': LOCATION_A,
                }
            }
        },
    )

    assert tool_arguments == {
        'invoiceId': 'inv-1',
        'locationId': LOCATION_A,
    }


def test_runtime_service_merges_created_invoice_identity_into_context():
    merged = AgentRuntimeService._merge_context_from_tool_interaction(
        current_entities={
            'taskContext': {
                'primaryRoute': 'mutation',
                'primaryIntent': 'sales.create_invoice',
                'entities': {
                    'customerId': 'cust-1',
                    'customerName': 'Northwind Stores',
                },
            }
        },
        tool_name='sales.create_invoice',
        tool_arguments={'customerId': 'cust-1', 'lines': [{'sizeId': SIZE_1, 'qty': 2, 'unitPrice': 18}]},
        tool_result={'result': {'id': 'inv-1', 'invoiceNumber': 'SO-001'}},
    )

    task_entities = merged['taskContext']['entities']
    assert task_entities['invoiceId'] == 'inv-1'
    assert task_entities['invoiceNumber'] == 'SO-001'
    assert merged['invoiceId'] == 'inv-1'
    assert merged['invoiceNumber'] == 'SO-001'


def test_runtime_service_merges_created_po_supplier_identity_into_context():
    merged = AgentRuntimeService._merge_context_from_tool_interaction(
        current_entities={
            'taskContext': {
                'primaryRoute': 'mutation',
                'primaryIntent': 'purchasing.create_po',
                'entities': {},
            }
        },
        tool_name='purchasing.create_po',
        tool_arguments={'supplierId': 'sup-1', 'lines': [{'sizeId': SIZE_1, 'qty': 2, 'unitCost': 18}]},
        tool_result={'result': {'id': 'po-1', 'poNumber': 'PO-001'}},
    )

    task_entities = merged['taskContext']['entities']
    assert task_entities['supplierId'] == 'sup-1'
    assert task_entities['poId'] == 'po-1'
    assert task_entities['poNumber'] == 'PO-001'
    assert merged['supplierId'] == 'sup-1'
    assert merged['poId'] == 'po-1'
    assert merged['poNumber'] == 'PO-001'


async def test_runtime_service_reuses_completed_po_supplier_for_new_po_follow_up():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor(
            'purchasing.create_po',
            {
                'lines': [
                    {
                        'productName': 'Field Fresh Short',
                        'colorName': 'Sand',
                        'sizeLabel': 'M',
                        'quantity': 7,
                        'unitCost': 18,
                    }
                ]
            },
        ),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'create another purchase order with Sand M x7 @18': {
                    'useActiveWorkflow': True,
                    'primaryRoute': 'mutation',
                    'primaryIntent': 'purchasing.create_po',
                    'confidence': 0.95,
                    'rationale': 'Reuse the active supplier for a new purchase order.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='create another purchase order with Sand M x7 @18',
        extracted_entities={
            'taskContext': {
                'primaryRoute': 'mutation',
                'primaryIntent': 'purchasing.create_po',
                'entities': {
                    'supplierId': 'sup-1',
                    'poId': 'po-1',
                    'poNumber': 'PO-001',
                },
                'missingFields': [],
                'postActions': [],
                'clarificationCount': 0,
                'status': 'completed',
            }
        },
        recent_messages=[],
        workflow_status=WorkflowStatus.COMPLETED,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert outcome.extracted_entities['executionPayload']['supplierId'] == 'sup-1'
    assert outcome.extracted_entities['executionPayload']['lines'] == [
        {'sizeId': 'size-sand-m', 'qty': 7, 'unitCost': 18}
    ]


async def test_runtime_service_splits_compound_commerce_message_into_confirmation_queue():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=RoutedFakeExecutor(
            {
                'master.create_supplier': (
                    'master.create_supplier',
                    {
                        'name': 'Fashion Hub',
                        'phone': '020-123-4567',
                        'address': '10 Avenue',
                    },
                ),
            }
        ),  # type: ignore[arg-type]
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'create supplier Fashion Hub phone 020-123-4567 address 10 Avenue': {
                    'useActiveWorkflow': False,
                    'primaryRoute': 'mutation',
                    'primaryIntent': 'master.create_supplier',
                    'confidence': 0.98,
                    'rationale': 'The first clause creates a supplier.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message=(
            'create supplier Fashion Hub phone 020-123-4567 address 10 Avenue, '
            'then create PO for Classic Shirt Red S x20 @18, and update my last PO expected date to 2026-05-30'
        ),
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert outcome.extracted_entities['toolName'] == 'master.create_supplier'
    assert outcome.extracted_entities['compoundQueue'] == [
        'create PO for Classic Shirt Red S x20 @18',
        'update my last PO expected date to 2026-05-30',
    ]


async def test_runtime_service_reuses_completed_sales_order_for_dispatch_follow_up():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor(
            'sales.dispatch_invoice',
            {
                'locationId': 'Warehouse A',
            },
        ),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'dispatch that sales order from Warehouse A': {
                    'useActiveWorkflow': True,
                    'primaryRoute': 'mutation',
                    'primaryIntent': 'sales.dispatch_invoice',
                    'confidence': 0.95,
                    'rationale': 'Dispatch the active sales order from the requested location.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='dispatch that sales order from Warehouse A',
        extracted_entities={
            'taskContext': {
                'primaryRoute': 'mutation',
                'primaryIntent': 'sales.create_invoice',
                'entities': {
                    'invoiceId': 'inv-1',
                    'invoiceNumber': 'SO-001',
                    'customerId': 'cust-1',
                },
                'missingFields': [],
                'postActions': [],
                'clarificationCount': 0,
                'status': 'completed',
            }
        },
        recent_messages=[],
        workflow_status=WorkflowStatus.COMPLETED,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert outcome.extracted_entities['executionPayload']['invoiceId'] == 'inv-1'
    assert outcome.extracted_entities['executionPayload']['locationId'] == LOCATION_A


async def test_runtime_service_applies_po_update_clarification_reply_without_replanning():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {'sku': 'unused'}),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'change expected date to 2026-06-10 and quantity of MT-BLK/SM to 120': {
                    'useActiveWorkflow': True,
                    'primaryRoute': 'mutation',
                    'primaryIntent': 'purchasing.update_po',
                    'confidence': 0.96,
                    'rationale': 'The user is clarifying the active PO update draft.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='change expected date to 2026-06-10 and quantity of MT-BLK/SM to 120',
        extracted_entities={
            '_workflowEngine': 'runtime',
            'toolName': 'purchasing.update_po',
            'executionPayload': {'poId': 'po-1'},
            'taskContext': {
                'primaryRoute': 'mutation',
                'primaryIntent': 'purchasing.update_po',
                'entities': {'poId': 'po-1', 'poNumber': 'PO-001'},
                'missingFields': ['patch'],
                'postActions': [],
                'clarificationCount': 1,
                'status': 'drafting',
            },
        },
        recent_messages=[],
        workflow_status=WorkflowStatus.NEEDS_INPUT,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert outcome.extracted_entities['executionPayload'] == {
        'poId': 'po-1',
        'headerPatch': {'expectedDate': '2026-06-10'},
        'lineOps': [
            {
                'op': 'change_qty',
                'lineRef': {'skuCode': 'MT-BLK', 'sizeLabel': 'SM'},
                'qty': 120,
            }
        ],
    }


async def test_runtime_service_applies_sales_update_clarification_reply_without_replanning():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {'sku': 'unused'}),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'change quantity of HOOD-ECO/MD to 15': {
                    'useActiveWorkflow': True,
                    'primaryRoute': 'mutation',
                    'primaryIntent': 'sales.update_invoice',
                    'confidence': 0.96,
                    'rationale': 'The user is clarifying the active sales-order update draft.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='change quantity of HOOD-ECO/MD to 15',
        extracted_entities={
            '_workflowEngine': 'runtime',
            'toolName': 'sales.update_invoice',
            'executionPayload': {'invoiceId': 'inv-1'},
            'taskContext': {
                'primaryRoute': 'mutation',
                'primaryIntent': 'sales.update_invoice',
                'entities': {'invoiceId': 'inv-1', 'invoiceNumber': 'SO-001'},
                'missingFields': ['patch'],
                'postActions': [],
                'clarificationCount': 1,
                'status': 'drafting',
            },
        },
        recent_messages=[],
        workflow_status=WorkflowStatus.NEEDS_INPUT,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert outcome.extracted_entities['executionPayload'] == {
        'invoiceId': 'inv-1',
        'lineOps': [
            {
                'op': 'change_qty',
                'lineRef': {'skuCode': 'HOOD-ECO', 'sizeLabel': 'MD'},
                'qty': 15,
            }
        ],
    }


async def test_runtime_service_applies_po_update_add_line_clarification_reply_without_replanning():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {'sku': 'unused'}),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'add another line FFS-001/M x4 @20': {
                    'useActiveWorkflow': True,
                    'primaryRoute': 'mutation',
                    'primaryIntent': 'purchasing.update_po',
                    'confidence': 0.96,
                    'rationale': 'The user is adding a new line to the active PO update draft.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='add another line FFS-001/M x4 @20',
        extracted_entities={
            '_workflowEngine': 'runtime',
            'toolName': 'purchasing.update_po',
            'executionPayload': {'poId': 'po-1'},
            'taskContext': {
                'primaryRoute': 'mutation',
                'primaryIntent': 'purchasing.update_po',
                'entities': {'poId': 'po-1', 'poNumber': 'PO-001'},
                'missingFields': ['patch'],
                'postActions': [],
                'clarificationCount': 1,
                'status': 'drafting',
            },
        },
        recent_messages=[],
        workflow_status=WorkflowStatus.NEEDS_INPUT,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert outcome.extracted_entities['executionPayload'] == {
        'poId': 'po-1',
        'lineOps': [
            {
                'op': 'add',
                'values': {'sizeId': 'size-sand-m', 'qty': 4, 'unitCost': 20},
            }
        ],
    }


async def test_runtime_service_applies_receive_po_clarification_reply_without_replanning():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {'sku': 'unused'}),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'receive at Warehouse A FFS-001/M x5': {
                    'useActiveWorkflow': True,
                    'primaryRoute': 'mutation',
                    'primaryIntent': 'purchasing.receive_po',
                    'confidence': 0.96,
                    'rationale': 'The user supplied the missing receipt location and lines.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='receive at Warehouse A FFS-001/M x5',
        extracted_entities={
            '_workflowEngine': 'runtime',
            'toolName': 'purchasing.receive_po',
            'executionPayload': {'poId': 'po-1'},
            'taskContext': {
                'primaryRoute': 'mutation',
                'primaryIntent': 'purchasing.receive_po',
                'entities': {'poId': 'po-1', 'poNumber': 'PO-001'},
                'missingFields': ['location_id', 'lines'],
                'postActions': [],
                'clarificationCount': 1,
                'status': 'drafting',
            },
        },
        recent_messages=[],
        workflow_status=WorkflowStatus.NEEDS_INPUT,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert outcome.extracted_entities['executionPayload']['poId'] == 'po-1'
    assert outcome.extracted_entities['executionPayload']['poNumber'] == 'PO-001'
    assert outcome.extracted_entities['executionPayload']['locationId'] == LOCATION_A
    assert outcome.extracted_entities['executionPayload']['lines'] == [
        {'sizeId': 'size-sand-m', 'qty': 5, 'unitCost': 42}
    ]
    assert outcome.extracted_entities['executionPayload']['confirm'] is True


async def test_runtime_service_applies_dispatch_clarification_reply_without_replanning():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {'sku': 'unused'}),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'from Warehouse A': {
                    'useActiveWorkflow': True,
                    'primaryRoute': 'mutation',
                    'primaryIntent': 'sales.dispatch_invoice',
                    'confidence': 0.96,
                    'rationale': 'The user supplied the missing dispatch location.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='from Warehouse A',
        extracted_entities={
            '_workflowEngine': 'runtime',
            'toolName': 'sales.dispatch_invoice',
            'executionPayload': {'invoiceId': 'inv-1'},
            'taskContext': {
                'primaryRoute': 'mutation',
                'primaryIntent': 'sales.dispatch_invoice',
                'entities': {'invoiceId': 'inv-1', 'invoiceNumber': 'SO-001'},
                'missingFields': ['location_id'],
                'postActions': [],
                'clarificationCount': 1,
                'status': 'drafting',
            },
        },
        recent_messages=[],
        workflow_status=WorkflowStatus.NEEDS_INPUT,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert outcome.extracted_entities['executionPayload'] == {
        'invoiceId': 'inv-1',
        'locationId': LOCATION_A,
        'confirm': True,
    }


async def test_runtime_service_uses_pending_task_for_short_alias_follow_up():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('products.create_product', {}),
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'FFS-001': {
                    'useActiveWorkflow': False,
                    'primaryRoute': 'read',
                    'primaryIntent': 'inventory.stock_on_hand',
                    'confidence': 0.35,
                    'rationale': 'Recovered a style code value.',
                    'entityPatches': {'styleCode': 'FFS-001'},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    extracted_entities = {
        '_workflowEngine': 'runtime',
        'toolName': 'products.create_product',
        'executionPayload': {
            'product': {
                'name': 'Field Fresh Short',
                'basePrice': 100,
            },
            'variants': [
                {
                    'colorName': 'Sand',
                    'sizes': [{'sizeLabel': 'M'}],
                }
            ],
        },
        'taskContext': {
            'primaryRoute': 'mutation',
            'primaryIntent': 'products.create_product',
            'entities': {
                'name': 'Field Fresh Short',
                'basePrice': 100,
                'colorName': 'Sand',
                'sizeLabels': ['M'],
            },
            'missingFields': ['style_code'],
            'postActions': [],
            'clarificationCount': 0,
            'status': 'drafting',
        },
    }

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='FFS-001',
        extracted_entities=extracted_entities,
        recent_messages=[],
        workflow_status=WorkflowStatus.NEEDS_INPUT,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert outcome.extracted_entities['executionPayload']['product']['styleCode'] == 'FFS-001'


async def test_runtime_service_handles_small_talk_without_tool_planning():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeInvalidExecutor(),  # type: ignore[arg-type]
        reviewer=FakeReviewer(),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'hello': {
                    'useActiveWorkflow': False,
                    'primaryRoute': 'read',
                    'primaryIntent': 'inventory.stock_on_hand',
                    'confidence': 0.42,
                    'rationale': 'Defaulted to a read workflow.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='hello',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.COMPLETED
    assert any(block.type == BlockType.TEXT for block in outcome.blocks)
    assert not any(
        block.type == BlockType.TEXT and 'invite them to continue' in block.content.lower()
        for block in outcome.blocks
    )


async def test_runtime_service_uses_state_updater_for_completed_read_totals():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {'productName': 'Monarch Tasty Parka'}),
        reviewer=FakeReviewer(message='Here is the total stock.'),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'in total how much ?': {
                    'useActiveWorkflow': True,
                    'primaryRoute': 'read',
                    'primaryIntent': 'inventory.stock_on_hand',
                    'confidence': 0.92,
                    'rationale': 'This asks for the total of the active product discussion.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                },
                'stock of this product': {
                    'useActiveWorkflow': True,
                    'primaryRoute': 'read',
                    'primaryIntent': 'inventory.stock_on_hand',
                    'confidence': 0.93,
                    'rationale': 'This refers to the active product without renaming it.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                },
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    extracted_entities = {
        'taskContext': {
            'primaryRoute': 'read',
            'primaryIntent': 'inventory.stock_on_hand',
            'entities': {
                'productName': 'Monarch Tasty Parka',
                'sizeLabels': ['XS', 'S', 'M', 'L', 'XL'],
            },
            'missingFields': [],
            'postActions': [],
            'clarificationCount': 0,
            'status': 'completed',
        }
    }

    follow_up = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='stock of this product',
        extracted_entities=extracted_entities,
        recent_messages=[],
        workflow_status=WorkflowStatus.COMPLETED,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert follow_up.extracted_entities['taskContext']['entities']['productName'] == 'Monarch Tasty Parka'


async def test_runtime_service_persists_focal_product_from_multi_product_summary():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor('inventory.stock_on_hand', {}),
        reviewer=FakeReviewer(
            message='The product with the lowest stock is Monarch Fresh Short.',
            resolved_entities={'productName': 'Monarch Fresh Short'},
        ),
        narrator=FakeNarrator(),  # type: ignore[arg-type]
        state_updater=FakeStateUpdater(
            {
                'okay what other sizes we have in this product': {
                    'useActiveWorkflow': True,
                    'primaryRoute': 'read',
                    'primaryIntent': 'inventory.stock_on_hand',
                    'confidence': 0.95,
                    'rationale': 'The user is referring to the focal product from the prior answer.',
                    'entityPatches': {},
                    'navigationQuery': None,
                    'postActionQuery': None,
                }
            }
        ),  # type: ignore[arg-type]
        memory_service=FakeMemoryService(),  # type: ignore[arg-type]
        training_data_service=FakeTrainingService(),  # type: ignore[arg-type]
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
    )

    first_outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='get me the product with lowest stock',
        extracted_entities={},
        recent_messages=[],
        workflow_status=WorkflowStatus.IDLE,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert first_outcome.extracted_entities['taskContext']['entities']['productName'] == 'Monarch Fresh Short'

    follow_up = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='okay what other sizes we have in this product',
        extracted_entities=first_outcome.extracted_entities,
        recent_messages=[],
        workflow_status=WorkflowStatus.COMPLETED,
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert follow_up.extracted_entities['taskContext']['entities']['productName'] == 'Monarch Fresh Short'
    assert follow_up.status == WorkflowStatus.COMPLETED
