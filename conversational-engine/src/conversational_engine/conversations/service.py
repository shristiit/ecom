from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status

from conversational_engine.ai.attachments import S3AttachmentService
from conversational_engine.ai.redis_cache import RedisActiveStateCache
from conversational_engine.ai.repository import AIRepository
from conversational_engine.clients.backend import BackendClient
from conversational_engine.config.settings import Settings
from conversational_engine.contracts.api import (
    ApprovalDecisionResponse,
    ConversationListResponse,
    ConversationResponse,
    MessagePageInfo,
    WorkflowDecisionResponse,
)
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import WorkflowStatus
from conversational_engine.contracts.runs import RunRequest
from conversational_engine.runtime.service import AgentRuntimeService

from .approval_executor import RuntimeApprovalExecutor
from .outcome_store import ConversationOutcomeStore
from .runtime_decisions import RuntimeDecisionHandler
from .runtime_runner import ConversationRuntimeRunner


class ConversationService:
    def __init__(
        self,
        repository: AIRepository,
        backend_client: BackendClient,
        runtime_service: AgentRuntimeService,
        attachment_service: S3AttachmentService,
        redis_cache: RedisActiveStateCache,
        settings: Settings,
    ) -> None:
        self._repository = repository
        self._backend_client = backend_client
        self._attachment_service = attachment_service
        self._redis_cache = redis_cache
        self._settings = settings
        self._outcome_store = ConversationOutcomeStore(repository, redis_cache)
        self._runtime_runner = ConversationRuntimeRunner(
            repository=repository,
            runtime_service=runtime_service,
            outcome_store=self._outcome_store,
            attachment_service=attachment_service,
            redis_cache=redis_cache,
            settings=settings,
        )
        self._approval_executor = RuntimeApprovalExecutor(backend_client)
        self._runtime_decision_handler = RuntimeDecisionHandler(backend_client)

    async def list_conversations(self, auth: AuthContext) -> ConversationListResponse:
        return ConversationListResponse(items=await self._repository.list_conversations(auth.tenant_id))

    async def create_conversation(
        self,
        auth: AuthContext,
        title: str | None = None,
        initial_message: str | None = None,
        attachment_ids: list[str] | None = None,
    ) -> ConversationResponse:
        conversation, workflow = await self._repository.create_conversation(
            tenant_id=auth.tenant_id,
            created_by=auth.id,
            title=title or (initial_message[:60] if initial_message else 'New conversation'),
        )
        await self._redis_cache.set_workflow_state(auth.tenant_id, str(workflow.id), workflow)

        if initial_message:
            await self._runtime_runner.run_message(
                auth=auth,
                conversation=conversation,
                workflow=workflow,
                content=initial_message,
                attachment_ids=attachment_ids or [],
                event_listener=None,
            )
            response = await self.get_conversation(auth, conversation.id)
            if response is not None:
                return response

        return ConversationResponse(conversation=conversation, workflow=workflow, messages=[])

    async def get_conversation(
        self,
        auth: AuthContext,
        conversation_id: UUID,
        *,
        message_limit: int | None = None,
        before_created_at: datetime | None = None,
        before_id: str | None = None,
    ) -> ConversationResponse | None:
        result = await self._repository.get_conversation(
            auth.tenant_id,
            conversation_id,
            message_limit=message_limit or self._settings.chat_recent_message_limit,
            before_created_at=before_created_at,
            before_id=before_id,
        )
        if result is None:
            return None
        self._ensure_conversation_access(auth, result.conversation)
        safe_workflow = self._outcome_store.sanitize_workflow(result.workflow)
        message_page = MessagePageInfo(
            next_cursor_created_at=result.page.next_cursor_created_at.isoformat()
            if result.page.next_cursor_created_at
            else None,
            next_cursor_id=result.page.next_cursor_id,
            has_more=result.page.has_more,
        )
        return ConversationResponse(
            conversation=result.conversation,
            workflow=safe_workflow,
            messages=result.page.messages,
            pending_action=self._repository.build_pending_action(safe_workflow),
            message_page=message_page,
        )

    async def post_message(
        self,
        auth: AuthContext,
        conversation_id: UUID,
        content: str,
        attachment_ids: list[str] | None = None,
    ) -> ConversationResponse | None:
        current = await self._repository.get_conversation(
            auth.tenant_id,
            conversation_id,
            message_limit=self._settings.chat_recent_message_limit,
        )
        if current is None or current.workflow is None:
            return None
        self._ensure_conversation_access(auth, current.conversation)
        await self._runtime_runner.run_message(
            auth=auth,
            conversation=current.conversation,
            workflow=current.workflow,
            content=content,
            attachment_ids=attachment_ids or [],
            event_listener=None,
        )
        return await self.get_conversation(auth, conversation_id)

    async def stream_run(self, auth: AuthContext, request: RunRequest):
        async for event in self._runtime_runner.stream_run(auth=auth, request=request):
            yield event

    async def apply_decision(
        self,
        auth: AuthContext,
        workflow_id: UUID,
        decision: str,
    ) -> WorkflowDecisionResponse:
        workflow = await self._redis_cache.get_workflow_state(auth.tenant_id, str(workflow_id))
        if workflow is None:
            workflow = await self._repository.find_workflow_by_id(auth.tenant_id, workflow_id)
            if workflow is not None:
                await self._redis_cache.set_workflow_state(auth.tenant_id, str(workflow_id), workflow)
        if workflow is None:
            return WorkflowDecisionResponse(workflow_id=workflow_id, accepted=False, message='Workflow not found.')

        conversation_lookup = await self._repository.get_conversation_by_workflow_id(auth.tenant_id, workflow_id)
        if conversation_lookup is None:
            return WorkflowDecisionResponse(
                workflow_id=workflow_id,
                accepted=False,
                message='Conversation not found for workflow.',
            )

        conversation, _existing_workflow = conversation_lookup
        self._ensure_conversation_access(auth, conversation)
        if workflow.extracted_entities.get('_workflowEngine') == 'runtime':
            outcome = await self._runtime_decision_handler.apply(
                auth=auth,
                conversation_id=conversation.id,
                workflow_id=workflow.id,
                workflow=workflow,
                decision=decision,
            )
        else:
            return WorkflowDecisionResponse(
                workflow_id=workflow_id,
                accepted=False,
                message='This workflow does not support runtime decisions.',
            )
        await self._outcome_store.store(
            auth=auth,
            conversation_id=conversation.id,
            workflow_id=workflow.id,
            raw_text=None,
            outcome=outcome,
        )
        return WorkflowDecisionResponse(
            workflow_id=workflow_id,
            accepted=True,
            message=f'Workflow decision recorded: {decision}',
        )

    async def apply_approval_decision(
        self,
        auth: AuthContext,
        approval_id: UUID,
        approve: bool,
    ) -> ApprovalDecisionResponse:
        approval = await self._backend_client.get_approval_request(
            access_token=auth.access_token or '',
            tenant_id=auth.tenant_id,
            approval_id=str(approval_id),
        )

        if approval.conversation_id:
            current = await self._repository.get_conversation(
                auth.tenant_id,
                approval.conversation_id,
                message_limit=self._settings.chat_recent_message_limit,
            )
            if current is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Conversation not found.')
            self._ensure_conversation_access(auth, current.conversation)

        result = await self._backend_client.decide_approval(
            access_token=auth.access_token or '',
            tenant_id=auth.tenant_id,
            approval_id=str(approval_id),
            approve=approve,
        )
        approval = await self._backend_client.get_approval_request(
            access_token=auth.access_token or '',
            tenant_id=auth.tenant_id,
            approval_id=str(approval_id),
        )

        if approval.workflow_id and approval.conversation_id:
            workflow = await self._repository.find_workflow_by_id(auth.tenant_id, approval.workflow_id)
            current = await self._repository.get_conversation(
                auth.tenant_id,
                approval.conversation_id,
                message_limit=self._settings.chat_recent_message_limit,
            )
            if workflow and current:
                outcome = await self._approval_executor.execute(auth=auth, approval=approval)
                await self._outcome_store.store(
                    auth=auth,
                    conversation_id=current.conversation.id,
                    workflow_id=workflow.id,
                    raw_text=None,
                    outcome=outcome,
                )

        return result

    def _ensure_conversation_access(self, auth: AuthContext, conversation) -> None:
        owner_id = getattr(conversation, 'created_by', None)
        if owner_id is None or owner_id == auth.id or self._is_admin(auth):
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='You do not have access to this conversation.',
        )

    @staticmethod
    def _is_admin(auth: AuthContext) -> bool:
        return any('admin' in permission.lower() for permission in auth.permissions)
