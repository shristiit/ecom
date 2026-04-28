from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from conversational_engine.contracts.api import ApprovalRequestStatus, GovernanceEvaluationResponse
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import BlockType, WorkflowStatus
from conversational_engine.providers.router import ProviderAttempt, ProviderTrace
from conversational_engine.providers.runtime import ProviderResponse
from conversational_engine.runtime.service import AgentRuntimeService

pytestmark = pytest.mark.anyio


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


class FakeNarrator:
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
        del args, kwargs
        return {'ok': True}

    async def reporting_stock_summary(self, *args, **kwargs):
        del args, kwargs
        return [{'location_code': 'WH-LON', 'on_hand': 12}]

    async def create_po(self, *args, **kwargs):
        del args, kwargs
        return {'ok': True}

    async def create_invoice(self, *args, **kwargs):
        del args, kwargs
        return {'ok': True}

    async def create_product(self, *args, **kwargs):
        del args, kwargs
        return {'ok': True}

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


async def test_runtime_service_requests_approval_for_high_risk_writes():
    events: list[tuple[str, dict[str, object]]] = []
    service = AgentRuntimeService(
        backend_client=FakeApprovalBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor(
            'inventory.transfer_stock',
            {
                'fromLocationId': 'loc-a',
                'toLocationId': 'loc-b',
                'sizeId': 'size-1',
                'quantity': 10,
                'reason': 'rebalance',
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
            'quantity': 5,
            'reason': 'rebalance',
        },
        'taskContext': {
            'primaryRoute': 'mutation',
            'primaryIntent': 'inventory.transfer_stock',
            'entities': {
                'fromLocationId': 'WH-01',
                'toLocationId': 'SOHO',
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
    assert outcome.extracted_entities['executionPayload']['fromLocationId'] == 'Camden'


async def test_runtime_service_executes_post_navigation_after_success():
    service = AgentRuntimeService(
        backend_client=FakeBackendClient(),  # type: ignore[arg-type]
        planner=FakePlanner(),
        executor=FakeExecutor(
            'inventory.transfer_stock',
            {
                'fromLocationId': 'WH-01',
                'toLocationId': 'SOHO',
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
