from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from conversational_engine.app.auth_dependencies import require_auth_context
from conversational_engine.app.dependency_providers import get_app_settings, get_backend_client, get_conversation_service
from conversational_engine.clients.backend_client import BackendClient
from conversational_engine.config.settings import Settings
from conversational_engine.schemas.api_schemas import (
    ApprovalDecisionRequest,
    ApprovalDecisionResponse,
    ApprovalItem,
    ConversationListResponse,
    ConversationResponse,
    CreateConversationRequest,
    HealthResponse,
    HistoryItem,
    SendMessageRequest,
    WorkflowDecisionRequest,
    WorkflowDecisionResponse,
)
from conversational_engine.schemas.auth_schemas import AuthContext
from conversational_engine.conversations.conversation_service import ConversationService

router = APIRouter()
chat_router = APIRouter(prefix='/api/chat', tags=['chat'])


@router.get('/health', response_model=HealthResponse)
async def health(settings: Settings = Depends(get_app_settings)) -> HealthResponse:
    return HealthResponse(**settings.health_payload)


@chat_router.get('/conversations', response_model=ConversationListResponse)
async def list_conversations(
    auth: AuthContext = Depends(require_auth_context),
    service: ConversationService = Depends(get_conversation_service),
) -> ConversationListResponse:
    return service.list_conversations(auth)


@chat_router.get('/conversations/{conversation_id}', response_model=ConversationResponse)
async def get_conversation(
    conversation_id: UUID,
    auth: AuthContext = Depends(require_auth_context),
    service: ConversationService = Depends(get_conversation_service),
) -> ConversationResponse:
    conversation = service.get_conversation(auth, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Conversation not found')
    return conversation


@chat_router.post('/conversations', response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    request: CreateConversationRequest,
    auth: AuthContext = Depends(require_auth_context),
    service: ConversationService = Depends(get_conversation_service),
) -> ConversationResponse:
    return await service.create_conversation(auth, request.title, request.initial_message)


@chat_router.post('/conversations/{conversation_id}/messages', response_model=ConversationResponse)
async def post_message(
    conversation_id: UUID,
    request: SendMessageRequest,
    auth: AuthContext = Depends(require_auth_context),
    service: ConversationService = Depends(get_conversation_service),
) -> ConversationResponse:
    conversation = await service.post_message(auth, conversation_id, request.content)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Conversation not found')
    return conversation


@chat_router.post('/workflows/{workflow_id}/decision', response_model=WorkflowDecisionResponse)
async def apply_workflow_decision(
    workflow_id: UUID,
    request: WorkflowDecisionRequest,
    auth: AuthContext = Depends(require_auth_context),
    service: ConversationService = Depends(get_conversation_service),
) -> WorkflowDecisionResponse:
    return await service.apply_decision(auth, workflow_id, request.decision)


@chat_router.get('/approvals', response_model=list[ApprovalItem])
async def list_approvals(
    auth: AuthContext = Depends(require_auth_context),
    backend_client: BackendClient = Depends(get_backend_client),
) -> list[ApprovalItem]:
    return await backend_client.list_approvals(
        access_token=auth.access_token or '',
        tenant_id=auth.tenant_id,
    )


@chat_router.post('/approvals/{approval_id}/decision', response_model=ApprovalDecisionResponse)
async def apply_approval_decision(
    approval_id: UUID,
    request: ApprovalDecisionRequest,
    auth: AuthContext = Depends(require_auth_context),
    service: ConversationService = Depends(get_conversation_service),
) -> ApprovalDecisionResponse:
    return await service.apply_approval_decision(auth, approval_id, request.approve)


@chat_router.get('/history', response_model=list[HistoryItem])
async def list_history(
    auth: AuthContext = Depends(require_auth_context),
    backend_client: BackendClient = Depends(get_backend_client),
) -> list[HistoryItem]:
    return await backend_client.list_history(
        access_token=auth.access_token or '',
        tenant_id=auth.tenant_id,
    )
