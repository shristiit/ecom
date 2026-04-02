from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from conversational_engine.contracts.api import ApprovalRequestStatus, GovernanceEvaluationResponse
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import (
    BlockType,
    ConversationDetail,
    WorkflowState,
    WorkflowStatus,
)
from conversational_engine.orchestrator.service import OrchestratorService

pytestmark = pytest.mark.anyio


class FakeBackendClient:
    async def record_audit_event(self, *args, **kwargs):
        return {'ok': True}

    async def list_locations(self, *args, **kwargs):
        return [
            {'id': 'loc-a', 'name': 'Warehouse A', 'code': 'WHA'},
            {'id': 'loc-b', 'name': 'Warehouse B', 'code': 'WHB'},
        ]

    async def search_skus(self, *args, **kwargs):
        return [{'id': 'sku-1', 'sku_code': 'TSHIRT-BLACK', 'product_id': 'prod-1'}]

    async def get_product(self, *args, **kwargs):
        return {
            'product': {'id': 'prod-1', 'name': 'T-Shirt'},
            'skus': [{'id': 'sku-1', 'sku_code': 'TSHIRT-BLACK'}],
            'sizes': [{'id': 'size-1', 'sku_id': 'sku-1', 'size_label': 'M'}],
        }

    async def evaluate_approval(self, *args, **kwargs):
        return GovernanceEvaluationResponse(requires_approval=True, reason='All writes require approval.')

    async def create_approval_request(self, *args, **kwargs):
        return ApprovalRequestStatus(
            id=uuid4(),
            status='pending',
            conversation_id=kwargs['payload']['conversationId'],
            workflow_id=kwargs['payload']['workflowId'],
            action_type=kwargs['payload']['actionType'],
            tool_name=kwargs['payload']['toolName'],
            summary=kwargs['payload']['summary'],
            reason=kwargs['payload']['reason'],
            preview=kwargs['payload']['preview'],
            execution_payload=kwargs['payload']['executionPayload'],
            result={},
            requested_by='user-1',
            approved_by=None,
            created_at=datetime.now(UTC).isoformat(),
            updated_at=datetime.now(UTC).isoformat(),
        )

    async def stock_on_hand(self, *args, **kwargs):
        return [
            {
                'sku_code': 'TSHIRT-BLACK',
                'product_name': 'T-Shirt',
                'size_label': 'M',
                'location_code': 'WHA',
                'on_hand': 25,
                'reserved': 5,
                'available': 20,
            }
        ]

    async def list_suppliers(self, *args, **kwargs):
        return [{'id': 'sup-1', 'name': 'Acme Supply'}]

    async def list_pos(self, *args, **kwargs):
        return {'items': []}

    async def get_po(self, *args, **kwargs):
        return {
            'lines': [
                {'sku': 'TSHIRT-BLACK-M', 'unitCost': 12},
            ]
        }


class FakeRetrievalService:
    async def search_with_navigation(self, query: str):
        return {
            'docs': [{'content': f'Help for {query}'}],
            'routes': [{'label': 'Inventory', 'href': '/inventory', 'description': 'Inventory screen'}],
        }


def make_auth() -> AuthContext:
    return AuthContext(
        id='user-1',
        tenant_id='tenant-1',
        role_id='role-1',
        email='admin@demo.com',
        permissions=[],
        access_token='token',
    )


def make_conversation() -> ConversationDetail:
    now = datetime.now(UTC)
    return ConversationDetail(id=uuid4(), title='Test', created_at=now, updated_at=now)


def make_workflow() -> WorkflowState:
    return WorkflowState(id=uuid4(), status=WorkflowStatus.IDLE)


async def test_transfer_message_requests_follow_up_when_fields_missing():
    service = OrchestratorService(FakeBackendClient(), FakeRetrievalService())

    outcome = await service.handle_message(
        make_auth(),
        make_conversation(),
        make_workflow(),
        'transfer stock',
    )

    assert outcome.status == WorkflowStatus.NEEDS_INPUT
    assert outcome.blocks[0].type == BlockType.CLARIFICATION
    assert outcome.missing_fields


async def test_create_po_preview_and_approval_submission():
    service = OrchestratorService(FakeBackendClient(), FakeRetrievalService())
    auth = make_auth()
    conversation = make_conversation()
    workflow = make_workflow()

    outcome = await service.handle_message(
        auth,
        conversation,
        workflow,
        'create a PO draft for Acme Supply expected 2026-04-30 with TSHIRT-BLACK/M x10 @12',
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert any(block.type == BlockType.PREVIEW for block in outcome.blocks)

    next_workflow = WorkflowState(
        id=workflow.id,
        status=outcome.status,
        current_task=outcome.current_task,
        extracted_entities=outcome.extracted_entities,
        missing_fields=outcome.missing_fields,
        active_preview_id=outcome.active_preview_id,
    )
    decision_outcome = await service.handle_decision(auth, conversation, next_workflow, 'confirm')

    assert decision_outcome.status == WorkflowStatus.AWAITING_APPROVAL
    assert any(block.type == BlockType.APPROVAL_PENDING for block in decision_outcome.blocks)


async def test_navigation_help_returns_text_and_navigation():
    service = OrchestratorService(FakeBackendClient(), FakeRetrievalService())

    outcome = await service.handle_message(
        make_auth(),
        make_conversation(),
        make_workflow(),
        'how do i open inventory',
    )

    block_types = [block.type for block in outcome.blocks]
    assert BlockType.TEXT in block_types
    assert BlockType.NAVIGATION in block_types
