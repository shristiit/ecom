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
    def __init__(self, action: str = 'complete', message: str = 'Here is the result.') -> None:
        self._action = action
        self._message = message

    async def review(self, **kwargs):
        del kwargs
        return {
            'action': self._action,
            'assistantMessage': self._message,
            'feedback': None,
            'requiredInputs': [],
        }


class FakeNarrator:
    async def write_message(self, **kwargs):
        return str(kwargs.get('directive') or 'Done.')


class FakeMemoryService:
    def build(self, **kwargs):
        del kwargs

        class Context:
            session_memory = {'tenantId': 'tenant-1'}
            workflow_memory = {'workflowId': 'workflow-1'}
            tenant_memory = []
            recent_messages = []

        return Context()


class FakeTrainingService:
    def record_trace(self, **kwargs):
        del kwargs


class FakeBackendClient:
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
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='show stock for black t-shirt',
        extracted_entities={},
        recent_messages=[],
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
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='move 10 units to showroom',
        extracted_entities={},
        recent_messages=[],
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
    )

    outcome = await service.execute(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=uuid4(),
        user_message='show stock for black t-shirt',
        extracted_entities={},
        recent_messages=[],
        emit=lambda *_args, **_kwargs: None,
        run_id=uuid4(),
    )

    assert outcome.status == WorkflowStatus.COMPLETED
