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
