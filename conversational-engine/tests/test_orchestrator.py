from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from conversational_engine.agents.entity_resolver import EntityResolver
from conversational_engine.agents.help import HelpAgent
from conversational_engine.agents.inventory import InventoryAgent
from conversational_engine.agents.products import ProductsAgent
from conversational_engine.agents.purchasing import PurchasingAgent
from conversational_engine.agents.registry import AgentRegistry
from conversational_engine.agents.reporting import ReportingAgent
from conversational_engine.agents.sales import SalesAgent
from conversational_engine.config.model_routing import ModelRouting
from conversational_engine.contracts.api import ApprovalRequestStatus, GovernanceEvaluationResponse
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import BlockType, ConversationDetail, WorkflowState, WorkflowStatus
from conversational_engine.orchestrator.service import OrchestratorService
from conversational_engine.providers.base import ChatProvider, ProviderMessage

pytestmark = pytest.mark.anyio


class FakeChatProvider(ChatProvider):
    async def complete_text(self, *, model: str, messages: list[ProviderMessage]) -> str:
        del model, messages
        return ''

    async def complete_json(self, *, model: str, messages: list[ProviderMessage], json_schema, max_tokens: int = 400):
        del model, messages, json_schema, max_tokens
        return {}


class FakeBackendClient:
    async def record_audit_event(self, *args, **kwargs):
        return {'ok': True}

    async def list_locations(self, *args, **kwargs):
        return [
            {'id': 'loc-a', 'name': 'London Central Warehouse', 'code': 'WH-LON'},
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

    async def list_products(self, *args, **kwargs):
        return [{'id': 'prod-1', 'name': 'T-Shirt', 'style_code': 'TSHIRT'}]

    async def list_categories(self, *args, **kwargs):
        return [{'id': 'cat-1', 'name': 'Tops'}]

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

    async def list_customers(self, *args, **kwargs):
        return [{'id': 'cust-1', 'name': 'Northwind Stores'}]

    async def list_pos(self, *args, **kwargs):
        return {'items': []}

    async def get_po(self, *args, **kwargs):
        return {
            'lines': [
                {'sku': 'TSHIRT-BLACK-M', 'unitCost': 12},
            ]
        }

    async def list_invoices(self, *args, **kwargs):
        return {'items': []}

    async def get_invoice(self, *args, **kwargs):
        return {
            'lines': [
                {'sku': 'TSHIRT-BLACK-M', 'unitPrice': 18},
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


def make_service() -> OrchestratorService:
    backend = FakeBackendClient()
    retrieval = FakeRetrievalService()
    resolver = EntityResolver(backend)  # type: ignore[arg-type]
    routing = ModelRouting(model_best='best', model_ok='ok', agent_tiers={})
    chat = FakeChatProvider()
    registry = AgentRegistry(
        [
            InventoryAgent(backend=backend, resolver=resolver, chat_provider=chat, routing=routing),  # type: ignore[arg-type]
            ProductsAgent(backend=backend, resolver=resolver, chat_provider=chat, routing=routing),  # type: ignore[arg-type]
            PurchasingAgent(backend=backend, resolver=resolver, chat_provider=chat, routing=routing),  # type: ignore[arg-type]
            SalesAgent(backend=backend, resolver=resolver, chat_provider=chat, routing=routing),  # type: ignore[arg-type]
            ReportingAgent(backend=backend, resolver=resolver, chat_provider=chat, routing=routing),  # type: ignore[arg-type]
            HelpAgent(retrieval=retrieval, chat_provider=chat, routing=routing),
        ]
    )
    return OrchestratorService(
        backend_client=backend,  # type: ignore[arg-type]
        retrieval_service=retrieval,  # type: ignore[arg-type]
        agent_registry=registry,
        model_routing=routing,
        intent_classifier=None,
    )


async def test_transfer_message_requests_follow_up_when_fields_missing():
    service = make_service()

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
    service = make_service()
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
    service = make_service()

    outcome = await service.handle_message(
        make_auth(),
        make_conversation(),
        make_workflow(),
        'how do i open inventory',
    )

    block_types = [block.type for block in outcome.blocks]
    assert BlockType.TEXT in block_types
    assert BlockType.NAVIGATION in block_types


async def test_product_create_does_not_require_sku_code_when_other_fields_are_present():
    service = make_service()

    outcome = await service.handle_message(
        make_auth(),
        make_conversation(),
        make_workflow(),
        'create product style ST100 named "Core Tee" category Tops base price 25 color Black sizes M',
    )

    assert outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert 'sku_code' not in outcome.missing_fields
    assert any(block.type == BlockType.PREVIEW for block in outcome.blocks)


async def test_create_a_product_phrase_routes_to_product_workflow():
    service = make_service()

    outcome = await service.handle_message(
        make_auth(),
        make_conversation(),
        make_workflow(),
        'create a product',
    )

    assert outcome.status == WorkflowStatus.NEEDS_INPUT
    assert outcome.blocks[0].type == BlockType.CLARIFICATION
    assert 'style_code' in outcome.missing_fields


async def test_create_sales_order_requests_customer_and_lines_then_previews():
    service = make_service()
    auth = make_auth()
    conversation = make_conversation()
    workflow = make_workflow()

    missing_outcome = await service.handle_message(
        auth,
        conversation,
        workflow,
        'create sales order',
    )

    assert missing_outcome.status == WorkflowStatus.NEEDS_INPUT
    assert missing_outcome.blocks[0].type == BlockType.CLARIFICATION
    assert 'customer_id' in missing_outcome.missing_fields

    preview_outcome = await service.handle_message(
        auth,
        conversation,
        workflow,
        'create sales order for Northwind Stores with TSHIRT-BLACK/M x5 @18',
    )

    assert preview_outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert any(block.type == BlockType.PREVIEW for block in preview_outcome.blocks)


async def test_product_create_follow_up_merges_natural_fields_and_advances_to_preview():
    service = make_service()
    auth = make_auth()
    conversation = make_conversation()
    workflow = make_workflow()

    first_outcome = await service.handle_message(
        auth,
        conversation,
        workflow,
        (
            'create a new product with name sai tshirt with blue green and yellow colors '
            'with s, m and l size each has 100 stock in Warehouse A'
        ),
    )

    assert first_outcome.status == WorkflowStatus.NEEDS_INPUT
    assert 'style_code' in first_outcome.missing_fields
    assert 'base_price' in first_outcome.missing_fields

    next_workflow = WorkflowState(
        id=workflow.id,
        status=first_outcome.status,
        current_task=first_outcome.current_task,
        extracted_entities=first_outcome.extracted_entities,
        missing_fields=first_outcome.missing_fields,
        active_preview_id=first_outcome.active_preview_id,
    )

    follow_up_outcome = await service.handle_message(
        auth,
        conversation,
        next_workflow,
        'stye codeis sai_tshirts, base prce is 100 gbp, shirts category',
    )

    assert follow_up_outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert follow_up_outcome.missing_fields == []
    assert any(block.type == BlockType.PREVIEW for block in follow_up_outcome.blocks)


async def test_product_create_location_follow_up_accepts_partial_location_name():
    service = make_service()
    auth = make_auth()
    conversation = make_conversation()
    workflow = make_workflow()

    first_outcome = await service.handle_message(
        auth,
        conversation,
        workflow,
        'create product style ST100 named "Core Tee" category Tops base price 25 color Black sizes M stock 100',
    )

    assert first_outcome.status == WorkflowStatus.NEEDS_INPUT
    assert 'location_and_quantity' in first_outcome.missing_fields

    next_workflow = WorkflowState(
        id=workflow.id,
        status=first_outcome.status,
        current_task=first_outcome.current_task,
        extracted_entities=first_outcome.extracted_entities,
        missing_fields=first_outcome.missing_fields,
        active_preview_id=first_outcome.active_preview_id,
    )

    follow_up_outcome = await service.handle_message(
        auth,
        conversation,
        next_workflow,
        'london and 100',
    )

    assert follow_up_outcome.status == WorkflowStatus.AWAITING_CONFIRMATION
    assert follow_up_outcome.missing_fields == []
    assert any(block.type == BlockType.PREVIEW for block in follow_up_outcome.blocks)
