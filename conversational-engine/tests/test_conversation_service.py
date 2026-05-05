from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from conversational_engine.ai.repository import ConversationFetchResult, MessagePage
from conversational_engine.config.settings import Settings
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import ConversationDetail, WorkflowState, WorkflowStatus
from conversational_engine.conversations.service import ConversationService

pytestmark = pytest.mark.anyio


class FakeRepository:
    def __init__(self, conversation: ConversationDetail) -> None:
        self._conversation = conversation

    async def get_conversation(self, *args, **kwargs):
        del args, kwargs
        return ConversationFetchResult(
            conversation=self._conversation,
            workflow=WorkflowState(id=uuid4(), status=WorkflowStatus.IDLE),
            page=MessagePage(messages=[]),
        )

    def build_pending_action(self, workflow):
        del workflow
        return None

    async def find_workflow_by_id(self, *args, **kwargs):
        del args, kwargs
        return None


class FakeBackendClient:
    def __init__(self, conversation_id, workflow_id) -> None:
        self._conversation_id = conversation_id
        self._workflow_id = workflow_id

    async def get_approval_request(self, *args, **kwargs):
        del args, kwargs
        return SimpleNamespace(
            id=uuid4(),
            conversation_id=self._conversation_id,
            workflow_id=self._workflow_id,
            status='rejected',
            action_type='products.create_product',
            tool_name='products.create_product',
            summary='Create product',
            execution_payload={'styleCode': 'TEE-1'},
        )

    async def decide_approval(self, *args, **kwargs):
        del args, kwargs
        return SimpleNamespace(status='rejected')


class FakeAuditService:
    def __init__(self) -> None:
        self.events: list[dict[str, object]] = []

    async def record(self, **kwargs):
        self.events.append(kwargs)
        return kwargs


def make_auth(*, user_id: str, permissions: list[str] | None = None) -> AuthContext:
    return AuthContext(
        id=user_id,
        tenant_id='tenant-1',
        role_id='role-1',
        email='ops@example.com',
        permissions=permissions or ['chat.use'],
        access_token='token',
    )


def make_service(conversation: ConversationDetail) -> ConversationService:
    repository = FakeRepository(conversation)
    return ConversationService(
        repository=repository,  # type: ignore[arg-type]
        backend_client=SimpleNamespace(),  # type: ignore[arg-type]
        runtime_service=SimpleNamespace(),  # type: ignore[arg-type]
        audit_service=None,
        attachment_service=SimpleNamespace(),  # type: ignore[arg-type]
        redis_cache=SimpleNamespace(),  # type: ignore[arg-type]
        settings=Settings(),
    )


async def test_conversation_service_rejects_non_owner_access():
    now = datetime.now(UTC)
    service = make_service(
        ConversationDetail(
            id=uuid4(),
            title='Restricted',
            created_by='owner-1',
            created_at=now,
            updated_at=now,
        )
    )

    with pytest.raises(HTTPException) as exc_info:
        await service.get_conversation(make_auth(user_id='user-2'), uuid4())

    assert exc_info.value.status_code == 403


async def test_conversation_service_allows_admin_access():
    now = datetime.now(UTC)
    service = make_service(
        ConversationDetail(
            id=uuid4(),
            title='Restricted',
            created_by='owner-1',
            created_at=now,
            updated_at=now,
        )
    )

    response = await service.get_conversation(
        make_auth(user_id='user-2', permissions=['tenant.admin']),
        uuid4(),
    )

    assert response is not None
    assert response.conversation.created_by == 'owner-1'


async def test_conversation_service_records_approval_rejections():
    now = datetime.now(UTC)
    conversation_id = uuid4()
    workflow_id = uuid4()
    audit = FakeAuditService()
    service = ConversationService(
        repository=FakeRepository(
            ConversationDetail(
                id=conversation_id,
                title='Restricted',
                created_by='owner-1',
                created_at=now,
                updated_at=now,
            )
        ),  # type: ignore[arg-type]
        backend_client=FakeBackendClient(conversation_id, workflow_id),  # type: ignore[arg-type]
        runtime_service=SimpleNamespace(),  # type: ignore[arg-type]
        audit_service=audit,  # type: ignore[arg-type]
        attachment_service=SimpleNamespace(),  # type: ignore[arg-type]
        redis_cache=SimpleNamespace(),  # type: ignore[arg-type]
        settings=Settings(),
    )

    response = await service.apply_approval_decision(make_auth(user_id='owner-1'), uuid4(), False)

    assert response.status == 'rejected'
    assert audit.events[0]['event_type'] == 'approval_rejected'
    assert audit.events[0]['workflow_id'] == str(workflow_id)
