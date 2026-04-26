from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable

from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import MessageRole, TextBlock, WorkflowStatus
from conversational_engine.contracts.runs import RunEvent, RunRequest
from conversational_engine.db.repository import EngineRepository
from conversational_engine.runtime.service import AgentRuntimeService

from .outcome_store import ConversationOutcomeStore


class ConversationRuntimeRunner:
    def __init__(
        self,
        *,
        repository: EngineRepository,
        runtime_service: AgentRuntimeService,
        outcome_store: ConversationOutcomeStore,
    ) -> None:
        self._repository = repository
        self._runtime_service = runtime_service
        self._outcome_store = outcome_store

    async def stream_run(
        self,
        *,
        auth: AuthContext,
        request: RunRequest,
    ) -> AsyncIterator[RunEvent]:
        if request.conversation_id:
            current = self._repository.get_conversation(auth.tenant_id, request.conversation_id)
            if current is None:
                raise ValueError('Conversation not found')
            conversation, workflow, _messages = current
            if workflow is None:
                raise ValueError('Workflow not found')
        else:
            conversation, workflow = self._repository.create_conversation(
                tenant_id=auth.tenant_id,
                created_by=auth.id,
                title=request.title or request.content[:60] or 'New conversation',
            )

        queue: asyncio.Queue[RunEvent | None] = asyncio.Queue()

        image_data_urls = tuple(a.data_url for a in request.attachments if a.data_url)

        async def producer() -> None:
            try:
                await self.run_message(
                    auth=auth,
                    conversation=conversation,
                    workflow=workflow,
                    content=request.content,
                    image_data_urls=image_data_urls,
                    event_listener=lambda event: queue.put_nowait(event),
                )
            finally:
                queue.put_nowait(None)

        task = asyncio.create_task(producer())
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield item
        finally:
            await task

    async def run_message(
        self,
        *,
        auth: AuthContext,
        conversation,
        workflow,
        content: str,
        image_data_urls: tuple[str, ...] = (),
        event_listener: Callable[[RunEvent], None] | None,
    ) -> None:
        self._repository.append_message(
            tenant_id=auth.tenant_id,
            conversation_id=conversation.id,
            workflow_id=workflow.id,
            role=MessageRole.USER,
            blocks=[TextBlock(content=content)],
            raw_text=content,
        )
        run = self._repository.create_run(
            tenant_id=auth.tenant_id,
            conversation_id=conversation.id,
            workflow_id=workflow.id,
            user_message=content,
        )

        sequence = 0

        def emit(event_type: str, payload: dict[str, object]) -> None:
            nonlocal sequence
            sequence += 1
            event = self._repository.append_run_event(
                tenant_id=auth.tenant_id,
                run_id=run.id,
                conversation_id=conversation.id,
                workflow_id=workflow.id,
                sequence=sequence,
                event_type=event_type,
                payload=payload,
            )
            if event_listener:
                event_listener(event)

        emit(
            'run.started',
            {
                'conversationId': str(conversation.id),
                'workflowId': str(workflow.id),
                'message': content,
            },
        )

        recent_messages = self._repository.list_message_dicts(auth.tenant_id, conversation.id)
        runtime_entities = dict(workflow.extracted_entities or {})
        if workflow.status == WorkflowStatus.AWAITING_APPROVAL and workflow.active_approval_id:
            runtime_entities.setdefault('activeApprovalId', str(workflow.active_approval_id))
            runtime_entities.setdefault('activeApprovalStatus', 'pending')

        outcome = await self._runtime_service.execute(
            auth=auth,
            conversation_id=conversation.id,
            workflow_id=workflow.id,
            user_message=content,
            extracted_entities=runtime_entities,
            recent_messages=recent_messages,
            emit=emit,
            run_id=run.id,
            image_data_urls=image_data_urls,
        )
        self._outcome_store.store(
            auth=auth,
            conversation_id=conversation.id,
            workflow_id=workflow.id,
            raw_text=content,
            outcome=outcome,
        )
        self._repository.finish_run(
            tenant_id=auth.tenant_id,
            run_id=run.id,
            status='completed' if outcome.status != WorkflowStatus.FAILED else 'failed',
            error_message=None if outcome.status != WorkflowStatus.FAILED else 'runtime_failed',
        )
        emit(
            'run.completed' if outcome.status != WorkflowStatus.FAILED else 'run.failed',
            {
                'status': outcome.status.value,
                'currentTask': outcome.current_task,
            },
        )
