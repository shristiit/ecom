from __future__ import annotations

from uuid import UUID

from conversational_engine.clients.backend import BackendClient
from conversational_engine.contracts.api import (
    ApprovalDecisionResponse,
    ConversationListResponse,
    ConversationResponse,
    WorkflowDecisionResponse,
)
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import WorkflowStatus
from conversational_engine.contracts.runs import RunRequest
from conversational_engine.db.repository import EngineRepository
from conversational_engine.orchestrator.service import OrchestratorService
from conversational_engine.runtime.service import AgentRuntimeService

from .approval_executor import RuntimeApprovalExecutor
from .outcome_store import ConversationOutcomeStore
from .runtime_decisions import RuntimeDecisionHandler
from .runtime_runner import ConversationRuntimeRunner


class ConversationService:
    def __init__(
        self,
        repository: EngineRepository,
        backend_client: BackendClient,
        orchestrator: OrchestratorService,
        runtime_service: AgentRuntimeService,
    ) -> None:
        self._repository = repository
        self._backend_client = backend_client
        self._orchestrator = orchestrator
        self._outcome_store = ConversationOutcomeStore(repository)
        self._runtime_runner = ConversationRuntimeRunner(
            repository=repository,
            runtime_service=runtime_service,
            outcome_store=self._outcome_store,
        )
        self._approval_executor = RuntimeApprovalExecutor(backend_client)
        self._runtime_decision_handler = RuntimeDecisionHandler(backend_client)

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
            await self._runtime_runner.run_message(
                auth=auth,
                conversation=conversation,
                workflow=workflow,
                content=initial_message,
                event_listener=None,
            )
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
        safe_workflow = self._outcome_store.sanitize_workflow(workflow)
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

        await self._runtime_runner.run_message(
            auth=auth,
            conversation=conversation,
            workflow=workflow,
            content=content,
            event_listener=None,
        )
        return self.get_conversation(auth, conversation_id)

    async def stream_run(self, auth: AuthContext, request: RunRequest):
        async for event in self._runtime_runner.stream_run(auth=auth, request=request):
            yield event

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
        if (
            workflow.status == WorkflowStatus.AWAITING_CONFIRMATION
            and workflow.extracted_entities.get('_workflowEngine') == 'runtime'
        ):
            outcome = await self._runtime_decision_handler.apply(
                auth=auth,
                conversation_id=conversation.id,
                workflow_id=workflow.id,
                workflow=workflow,
                decision=decision,
            )
        else:
            outcome = await self._orchestrator.handle_decision(auth, conversation, workflow, decision)
        self._outcome_store.store(
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
                outcome = await self._approval_executor.execute(auth=auth, approval=approval)
                self._outcome_store.store(
                    auth=auth,
                    conversation_id=conversation.id,
                    workflow_id=workflow.id,
                    raw_text=None,
                    outcome=outcome,
                )

        return result
