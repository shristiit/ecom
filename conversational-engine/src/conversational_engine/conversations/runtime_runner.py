from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable

from conversational_engine.ai.attachments import S3AttachmentService
from conversational_engine.ai.redis_cache import RedisActiveStateCache
from conversational_engine.ai.repository import AIRepository
from conversational_engine.config.settings import Settings
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import ConversationDetail, MessageRole, TextBlock, WorkflowState, WorkflowStatus
from conversational_engine.contracts.runs import ImageAttachment, RunEvent, RunRequest
from conversational_engine.runtime.service import AgentRuntimeService

from .outcome_store import ConversationOutcomeStore


class ConversationRuntimeRunner:
    def __init__(
        self,
        *,
        repository: AIRepository,
        runtime_service: AgentRuntimeService,
        outcome_store: ConversationOutcomeStore,
        attachment_service: S3AttachmentService,
        redis_cache: RedisActiveStateCache,
        settings: Settings,
    ) -> None:
        self._repository = repository
        self._runtime_service = runtime_service
        self._outcome_store = outcome_store
        self._attachment_service = attachment_service
        self._redis_cache = redis_cache
        self._settings = settings

    async def stream_run(
        self,
        *,
        auth: AuthContext,
        request: RunRequest,
    ) -> AsyncIterator[RunEvent]:
        if request.conversation_id:
            current = await self._repository.get_conversation(
                auth.tenant_id,
                request.conversation_id,
                message_limit=self._settings.chat_recent_message_limit,
            )
            if current is None or current.workflow is None:
                raise ValueError('Conversation not found')
            conversation = current.conversation
            workflow = current.workflow
        else:
            conversation, workflow = await self._repository.create_conversation(
                tenant_id=auth.tenant_id,
                created_by=auth.id,
                title=request.title or request.content[:60] or 'New conversation',
            )
            await self._redis_cache.set_workflow_state(auth.tenant_id, str(workflow.id), workflow)

        queue: asyncio.Queue[RunEvent | None] = asyncio.Queue()

        async def producer() -> None:
            try:
                await self.run_message(
                    auth=auth,
                    conversation=conversation,
                    workflow=workflow,
                    content=request.content,
                    attachment_ids=request.attachment_ids,
                    inline_attachments=request.attachments,
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
        conversation: ConversationDetail,
        workflow: WorkflowState,
        content: str,
        attachment_ids: list[str] | None = None,
        inline_attachments: list[ImageAttachment] | None = None,
        event_listener: Callable[[RunEvent], None] | None,
    ) -> None:
        attachment_ids = attachment_ids or []
        inline_attachments = inline_attachments or []
        attachment_payload = await self._attachment_service.prepare_runtime_attachments(
            tenant_id=auth.tenant_id,
            conversation_id=str(conversation.id),
            attachment_ids=attachment_ids,
        )
        image_data_urls = tuple(a.data_url for a in inline_attachments if a.data_url) + attachment_payload.image_data_urls
        content_with_attachments = self._merge_content(content, attachment_payload.prompt_prefixes)

        await self._repository.append_message(
            tenant_id=auth.tenant_id,
            conversation_id=conversation.id,
            workflow_id=workflow.id,
            role=MessageRole.USER,
            blocks=[TextBlock(content=content_with_attachments)],
            raw_text=content_with_attachments,
            attachments=attachment_payload.attachment_refs,
        )
        run = await self._repository.create_run(
            tenant_id=auth.tenant_id,
            conversation_id=conversation.id,
            workflow_id=workflow.id,
            user_message=content_with_attachments,
        )

        sequence = 0
        emit_tasks: list[asyncio.Task[None]] = []

        async def _persist_event(event_type: str, sequence_number: int, payload: dict[str, object]) -> None:
            event = await self._repository.append_run_event(
                tenant_id=auth.tenant_id,
                run_id=run.id,
                conversation_id=conversation.id,
                workflow_id=workflow.id,
                sequence=sequence_number,
                event_type=event_type,
                payload=payload,
            )
            await self._redis_cache.set_stream_state(
                auth.tenant_id,
                str(run.id),
                {'type': event_type, 'sequence': sequence_number, 'payload': payload},
            )
            if event_listener:
                event_listener(event)

        def emit(event_type: str, payload: dict[str, object]) -> None:
            nonlocal sequence
            sequence += 1
            emit_tasks.append(asyncio.create_task(_persist_event(event_type, sequence, payload)))

        emit(
            'run.started',
            {
                'conversationId': str(conversation.id),
                'workflowId': str(workflow.id),
                'message': content,
                'attachmentIds': attachment_ids,
            },
        )

        recent_messages = await self._repository.list_message_dicts(
            auth.tenant_id,
            conversation.id,
            limit=self._settings.chat_max_context_messages,
        )
        runtime_entities = dict(workflow.extracted_entities or {})
        if workflow.status == WorkflowStatus.AWAITING_APPROVAL and workflow.active_approval_id:
            runtime_entities.setdefault('activeApprovalId', str(workflow.active_approval_id))
            runtime_entities.setdefault('activeApprovalStatus', 'pending')

        outcome = await self._runtime_service.execute(
            auth=auth,
            conversation_id=conversation.id,
            workflow_id=workflow.id,
            user_message=content_with_attachments,
            extracted_entities=runtime_entities,
            recent_messages=recent_messages,
            workflow_status=workflow.status,
            emit=emit,
            run_id=run.id,
            image_data_urls=image_data_urls,
        )
        await self._outcome_store.store(
            auth=auth,
            conversation_id=conversation.id,
            workflow_id=workflow.id,
            raw_text=content_with_attachments,
            outcome=outcome,
        )
        await self._repository.finish_run(
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
        if emit_tasks:
            await asyncio.gather(*emit_tasks)

    @staticmethod
    def _merge_content(content: str, prompt_prefixes: list[str]) -> str:
        if not prompt_prefixes:
            return content
        return f'{"\n\n".join(prompt_prefixes)}\n\n{content}'
