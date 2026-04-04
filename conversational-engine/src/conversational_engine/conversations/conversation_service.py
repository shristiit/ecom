from __future__ import annotations

from uuid import UUID

from conversational_engine.clients.backend_client import BackendClient
from conversational_engine.schemas.api_schemas import (
    ApprovalDecisionResponse,
    ConversationListResponse,
    ConversationResponse,
    WorkflowDecisionResponse,
)
from conversational_engine.schemas.auth_schemas import AuthContext
from conversational_engine.schemas.shared_schemas import MessageRole, TextBlock
from conversational_engine.repositories.engine_repository import EngineRepository
from conversational_engine.orchestrator.orchestrator_service import OrchestratorOutcome, OrchestratorService


class ConversationService:
    def __init__(
        self,
        repository: EngineRepository,
        backend_client: BackendClient,
        orchestrator: OrchestratorService,
    ) -> None:
        self._repository = repository
        self._backend_client = backend_client
        self._orchestrator = orchestrator

    def list_conversations(self, auth: AuthContext) -> ConversationListResponse:
        return ConversationListResponse(items=self._repository.list_conversations(auth.tenant_id))

    async def create_conversation(
        self,
        auth: AuthContext,
        title: str | None = None,
        initial_message: str | None = None,
    ) -> ConversationResponse:
        conversation, workflow = self._repository.create_conversation(
            tenant_id=auth.tenant_id,
            created_by=auth.id,
            title=title or (initial_message[:60] if initial_message else 'New conversation'),
        )

        if initial_message:
            self._repository.append_message(
                tenant_id=auth.tenant_id,
                conversation_id=conversation.id,
                workflow_id=workflow.id,
                role=MessageRole.USER,
                blocks=[TextBlock(content=initial_message)],
                raw_text=initial_message,
            )
            outcome = await self._orchestrator.handle_message(auth, conversation, workflow, initial_message)
            self._store_outcome(auth, conversation.id, workflow.id, initial_message, outcome)
            return self.get_conversation(auth, conversation.id) or ConversationResponse(
                conversation=conversation,
                workflow=workflow,
                messages=[],
            )

        return ConversationResponse(conversation=conversation, workflow=workflow, messages=[])

    def get_conversation(self, auth: AuthContext, conversation_id: UUID) -> ConversationResponse | None:
        result = self._repository.get_conversation(auth.tenant_id, conversation_id)
        if result is None:
            return None
        conversation, workflow, messages = result
        safe_workflow = self._sanitize_workflow(workflow)
        return ConversationResponse(
            conversation=conversation,
            workflow=safe_workflow,
            messages=messages,
            pending_action=self._repository.build_pending_action(safe_workflow),
        )

    async def post_message(self, auth: AuthContext, conversation_id: UUID, content: str) -> ConversationResponse | None:
        current = self._repository.get_conversation(auth.tenant_id, conversation_id)
        if current is None:
            return None

        conversation, workflow, _messages = current
        if workflow is None:
            return None

        self._repository.append_message(
            tenant_id=auth.tenant_id,
            conversation_id=conversation.id,
            workflow_id=workflow.id,
            role=MessageRole.USER,
            blocks=[TextBlock(content=content)],
            raw_text=content,
        )
        outcome = await self._orchestrator.handle_message(auth, conversation, workflow, content)
        self._store_outcome(auth, conversation.id, workflow.id, content, outcome)
        return self.get_conversation(auth, conversation_id)

    async def apply_decision(
        self,
        auth: AuthContext,
        workflow_id: UUID,
        decision: str,
    ) -> WorkflowDecisionResponse:
        workflow = self._repository.find_workflow_by_id(auth.tenant_id, workflow_id)
        if workflow is None:
            return WorkflowDecisionResponse(
                workflow_id=workflow_id,
                accepted=False,
                message='Workflow not found.',
            )

        conversation_lookup = self._repository.get_conversation_by_workflow_id(auth.tenant_id, workflow_id)
        if conversation_lookup is None:
            return WorkflowDecisionResponse(
                workflow_id=workflow_id,
                accepted=False,
                message='Conversation not found for workflow.',
            )

        conversation, _existing_workflow = conversation_lookup
        outcome = await self._orchestrator.handle_decision(auth, conversation, workflow, decision)
        self._store_outcome(auth, conversation.id, workflow.id, None, outcome)
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
            workflow = self._repository.find_workflow_by_id(auth.tenant_id, approval.workflow_id)
            current = self._repository.get_conversation(auth.tenant_id, approval.conversation_id)
            if workflow and current:
                conversation, _workflow, _messages = current
                outcome = await self._orchestrator.handle_approval_result(auth, conversation, workflow, approval)
                self._store_outcome(auth, conversation.id, workflow.id, None, outcome)

        return result

    def _store_outcome(
        self,
        auth: AuthContext,
        conversation_id: UUID,
        workflow_id: UUID,
        raw_text: str | None,
        outcome: OrchestratorOutcome,
    ) -> None:
        self._repository.append_message(
            tenant_id=auth.tenant_id,
            conversation_id=conversation_id,
            workflow_id=workflow_id,
            role=MessageRole.ASSISTANT,
            blocks=outcome.blocks,
            raw_text=raw_text,
        )
        self._repository.save_workflow_state(
            auth.tenant_id,
            workflow_id,
            status=outcome.status,
            current_task=outcome.current_task,
            extracted_entities=outcome.extracted_entities,
            missing_fields=outcome.missing_fields,
            active_preview_id=outcome.active_preview_id,
            active_approval_id=outcome.active_approval_id,
        )

    @staticmethod
    def _sanitize_workflow(workflow):
        if workflow is None:
            return None
        extracted_entities = dict(workflow.extracted_entities or {})
        extracted_entities.pop('requesterAccessToken', None)
        return workflow.model_copy(update={'extracted_entities': extracted_entities})
