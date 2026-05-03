import pytest
from pydantic import ValidationError

from uuid import uuid4

from conversational_engine.contracts.api import ConversationResponse
from conversational_engine.contracts.common import (
    ChatMessage,
    ConfirmationRequiredBlock,
    ConversationDetail,
    MessageRole,
    PendingAction,
    PendingActionType,
    TextBlock,
    WorkflowState,
    WorkflowStatus,
)
from conversational_engine.contracts.runs import RunRequest
from conversational_engine.utils.casing import to_camel
from conversational_engine.utils.time import utc_now


def test_conversation_response_serializes_camel_case_aliases():
    response = ConversationResponse(
        conversation=ConversationDetail(
            id=uuid4(),
            title='Transfer request',
            created_at=utc_now(),
            updated_at=utc_now(),
        ),
        workflow=WorkflowState(
            id=uuid4(),
            status=WorkflowStatus.AWAITING_CONFIRMATION,
            current_task='stock_transfer',
            missing_fields=[],
        ),
        messages=[
            ChatMessage(
                id=uuid4(),
                role=MessageRole.ASSISTANT,
                blocks=[
                    TextBlock(content='Preview ready.'),
                    ConfirmationRequiredBlock(
                        prompt='Confirm this transfer?',
                        allowed_actions=[PendingActionType.CONFIRM, PendingActionType.CANCEL],
                    ),
                ],
                created_at=utc_now(),
            )
        ],
        pending_action=PendingAction(
            workflow_id=uuid4(),
            actions=[PendingActionType.CONFIRM, PendingActionType.CANCEL],
            prompt='Choose the next step.',
        ),
    )

    payload = response.model_dump(by_alias=True)

    assert 'pendingAction' in payload
    assert payload['workflow']['currentTask'] == 'stock_transfer'
    assert payload['messages'][0]['blocks'][1]['type'] == 'confirmation_required'
    assert payload['messages'][0]['blocks'][1]['allowedActions'] == ['confirm', 'cancel']


def test_run_request_enforces_content_length():
    with pytest.raises(ValidationError):
        RunRequest(content='x' * 4001)


def test_to_camel_skips_empty_underscore_parts():
    assert to_camel('__pending_action') == 'pendingAction'
