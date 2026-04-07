from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import uuid4

from fastapi.testclient import TestClient

from conversational_engine.app.auth import require_auth_context
from conversational_engine.app.dependencies import get_conversation_service
from conversational_engine.app.main import app
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.runs import RunEvent


class FakeConversationService:
    async def stream_run(self, auth: AuthContext, request) -> AsyncIterator[RunEvent]:
        del auth, request
        conversation_id = uuid4()
        run_id = uuid4()
        workflow_id = uuid4()
        yield RunEvent(
            type='run.started',
            run_id=run_id,
            conversation_id=conversation_id,
            workflow_id=workflow_id,
            sequence=1,
            payload={'message': 'start'},
        )
        yield RunEvent(
            type='run.completed',
            run_id=run_id,
            conversation_id=conversation_id,
            workflow_id=workflow_id,
            sequence=2,
            payload={'status': 'completed'},
        )


async def fake_auth() -> AuthContext:
    return AuthContext(
        id='user-1',
        tenant_id='tenant-1',
        role_id='role-1',
        email='ops@example.com',
        permissions=['chat.use'],
        access_token='token',
    )


def test_run_stream_route_returns_ndjson_events():
    app.dependency_overrides[get_conversation_service] = lambda: FakeConversationService()
    app.dependency_overrides[require_auth_context] = fake_auth
    client = TestClient(app)

    response = client.post('/api/chat/runs/stream', json={'content': 'show stock'})

    app.dependency_overrides.clear()

    assert response.status_code == 200
    lines = [line for line in response.text.splitlines() if line.strip()]
    assert len(lines) == 2
    assert '"type": "run.started"' in lines[0]
    assert '"type": "run.completed"' in lines[1]
