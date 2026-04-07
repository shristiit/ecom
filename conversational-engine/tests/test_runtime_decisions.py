from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import BlockType, WorkflowState, WorkflowStatus
from conversational_engine.conversations.runtime_decisions import RuntimeDecisionHandler

pytestmark = pytest.mark.anyio


class FakeBackendClient:
    def __init__(self) -> None:
        self.created_approval_ids: list[str] = []
        self.updated_approval_ids: list[str] = []

    async def create_approval_request(self, *args, **kwargs):
        del args, kwargs

        class Approval:
            id = uuid4()
            status = 'pending'

        self.created_approval_ids.append(str(Approval.id))
        return Approval()

    async def update_approval_request(self, *args, **kwargs):
        approval_id = str(kwargs.get('approval_id') or '')

        class Approval:
            id = UUID(approval_id) if approval_id else uuid4()
            status = 'pending'

        self.updated_approval_ids.append(str(Approval.id))
        return Approval()

    async def create_product(self, *args, **kwargs):
        del args, kwargs
        return {'ok': True}


def make_auth() -> AuthContext:
    return AuthContext(
        id='user-1',
        tenant_id='tenant-1',
        role_id='role-1',
        email='ops@example.com',
        permissions=['chat.use'],
        access_token='token',
    )


async def test_runtime_decision_confirm_routes_to_approval_when_required():
    handler = RuntimeDecisionHandler(FakeBackendClient())  # type: ignore[arg-type]
    workflow = WorkflowState(
        id=uuid4(),
        status=WorkflowStatus.AWAITING_CONFIRMATION,
        current_task='awaiting_confirmation',
        extracted_entities={
            '_workflowEngine': 'runtime',
            '_pendingActions': ['confirm', 'cancel', 'edit'],
            '_pendingPrompt': 'Review and confirm.',
            'toolName': 'products.create_product',
            'executionPayload': {'styleCode': 'TEE-1', 'name': 'Big Tees', 'basePrice': 100, 'variants': []},
            'preview': {'tool': 'products.create_product', 'arguments': {'styleCode': 'TEE-1'}},
            'approvalRequired': True,
            'approvalReason': 'Policy requires approval.',
            'summary': 'Create product TEE-1 / Big Tees',
        },
    )

    outcome = await handler.apply(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=workflow.id,
        workflow=workflow,
        decision='confirm',
    )

    assert outcome.status == WorkflowStatus.AWAITING_APPROVAL
    assert any(block.type == BlockType.APPROVAL_PENDING for block in outcome.blocks)


async def test_runtime_decision_edit_returns_to_needs_input():
    handler = RuntimeDecisionHandler(FakeBackendClient())  # type: ignore[arg-type]
    workflow = WorkflowState(
        id=uuid4(),
        status=WorkflowStatus.AWAITING_CONFIRMATION,
        current_task='awaiting_confirmation',
        extracted_entities={
            '_workflowEngine': 'runtime',
            '_pendingActions': ['confirm', 'cancel', 'edit'],
            '_pendingPrompt': 'Review and confirm.',
            'toolName': 'products.create_product',
            'executionPayload': {'styleCode': 'TEE-1', 'name': 'Big Tees', 'basePrice': 100, 'variants': []},
        },
    )

    outcome = await handler.apply(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=workflow.id,
        workflow=workflow,
        decision='edit',
    )

    assert outcome.status == WorkflowStatus.NEEDS_INPUT
    assert any(block.type == BlockType.CLARIFICATION for block in outcome.blocks)


async def test_runtime_decision_confirm_updates_existing_pending_approval():
    backend = FakeBackendClient()
    handler = RuntimeDecisionHandler(backend)  # type: ignore[arg-type]
    approval_id = uuid4()
    workflow = WorkflowState(
        id=uuid4(),
        status=WorkflowStatus.AWAITING_CONFIRMATION,
        current_task='awaiting_confirmation',
        extracted_entities={
            '_workflowEngine': 'runtime',
            '_pendingActions': ['confirm', 'cancel', 'edit'],
            '_pendingPrompt': 'Review and confirm.',
            '_approvalOperation': 'update_existing',
            'activeApprovalId': str(approval_id),
            'activeApprovalStatus': 'pending',
            'toolName': 'products.create_product',
            'executionPayload': {'styleCode': 'TEE-1', 'name': 'Big Tees', 'basePrice': 150, 'variants': []},
            'preview': {'tool': 'products.create_product', 'arguments': {'styleCode': 'TEE-1', 'basePrice': 150}},
            'approvalRequired': True,
            'approvalReason': 'Policy requires approval.',
            'summary': 'Create product TEE-1 / Big Tees',
            '_pendingApprovalUpdateOriginal': {
                'toolName': 'products.create_product',
                'executionPayload': {'styleCode': 'TEE-1', 'name': 'Big Tees', 'basePrice': 200, 'variants': []},
                'preview': {'tool': 'products.create_product', 'arguments': {'styleCode': 'TEE-1', 'basePrice': 200}},
                'summary': 'Create product TEE-1 / Big Tees',
            },
        },
    )

    outcome = await handler.apply(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=workflow.id,
        workflow=workflow,
        decision='confirm',
    )

    assert outcome.status == WorkflowStatus.AWAITING_APPROVAL
    assert backend.created_approval_ids == []
    assert backend.updated_approval_ids == [str(approval_id)]
    assert outcome.active_approval_id == approval_id


async def test_runtime_decision_cancel_keeps_original_pending_approval():
    backend = FakeBackendClient()
    handler = RuntimeDecisionHandler(backend)  # type: ignore[arg-type]
    approval_id = uuid4()
    workflow = WorkflowState(
        id=uuid4(),
        status=WorkflowStatus.AWAITING_CONFIRMATION,
        current_task='awaiting_confirmation',
        extracted_entities={
            '_workflowEngine': 'runtime',
            '_pendingActions': ['confirm', 'cancel', 'edit'],
            '_pendingPrompt': 'Review and confirm.',
            '_approvalOperation': 'update_existing',
            'activeApprovalId': str(approval_id),
            'activeApprovalStatus': 'pending',
            'toolName': 'products.create_product',
            'executionPayload': {'styleCode': 'TEE-1', 'name': 'Big Tees', 'basePrice': 150, 'variants': []},
            'preview': {'tool': 'products.create_product', 'arguments': {'styleCode': 'TEE-1', 'basePrice': 150}},
            'approvalRequired': True,
            'approvalReason': 'Policy requires approval.',
            'summary': 'Create product TEE-1 / Big Tees',
            '_pendingApprovalUpdateOriginal': {
                'toolName': 'products.create_product',
                'executionPayload': {'styleCode': 'TEE-1', 'name': 'Big Tees', 'basePrice': 200, 'variants': []},
                'preview': {'tool': 'products.create_product', 'arguments': {'styleCode': 'TEE-1', 'basePrice': 200}},
                'summary': 'Create product TEE-1 / Big Tees',
            },
        },
    )

    outcome = await handler.apply(
        auth=make_auth(),
        conversation_id=uuid4(),
        workflow_id=workflow.id,
        workflow=workflow,
        decision='cancel',
    )

    assert outcome.status == WorkflowStatus.AWAITING_APPROVAL
    assert outcome.active_approval_id == approval_id
    assert any(block.type == BlockType.APPROVAL_PENDING for block in outcome.blocks)
