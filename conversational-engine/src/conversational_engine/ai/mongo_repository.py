from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pydantic import TypeAdapter
from pymongo import ASCENDING, DESCENDING, ReturnDocument

from conversational_engine.ai.repository import AIRepository, ConversationFetchResult, MessagePage
from conversational_engine.config.settings import Settings
from conversational_engine.contracts.common import (
    ChatMessage,
    ConversationDetail,
    ConversationSummary,
    MessageAttachmentRef,
    MessageBlock,
    MessageRole,
    PendingAction,
    PendingActionType,
    WorkflowState,
    WorkflowStatus,
)
from conversational_engine.contracts.runs import RunEvent, RunSummary, RunTraceRecord, TrainingDatasetSummary
from conversational_engine.utils.time import utc_now

logger = logging.getLogger(__name__)

MESSAGE_BLOCKS_ADAPTER = TypeAdapter(list[MessageBlock])
MESSAGE_ATTACHMENTS_ADAPTER = TypeAdapter(list[MessageAttachmentRef])

DEFAULT_RETENTION = {
    'rawMessagesDays': 730,
    'tracesDays': 90,
    'runEventsDays': 90,
    'attachmentsDays': 730,
    'summariesDays': None,
    'memoryDays': None,
}
SYSTEM_TENANT_ID = '__system__'


def _preview_text(blocks: list[dict[str, object]]) -> str | None:
    for block in blocks:
        if isinstance(block.get('content'), str):
            return str(block['content'])
        if isinstance(block.get('message'), str):
            return str(block['message'])
        if isinstance(block.get('prompt'), str):
            return str(block['prompt'])
    return None


def _estimate_tokens(text: str | None) -> int | None:
    if not text:
        return None
    return max(1, (len(text.strip()) + 3) // 4)


def _uuid_text(value: UUID | str | None) -> str | None:
    if value is None:
        return None
    return str(value)


def _to_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, str):
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    return None


def _message_from_doc(doc: dict[str, Any]) -> ChatMessage:
    return ChatMessage.model_validate(
        {
            'id': doc['_id'],
            'role': doc['role'],
            'blocks': MESSAGE_BLOCKS_ADAPTER.validate_python(doc.get('blocks') or []),
            'attachments': MESSAGE_ATTACHMENTS_ADAPTER.validate_python(doc.get('attachments') or []),
            'createdAt': doc['createdAt'],
        }
    )


def _conversation_from_doc(doc: dict[str, Any]) -> ConversationDetail:
    return ConversationDetail.model_validate(
        {
            'id': doc['_id'],
            'title': doc['title'],
            'createdAt': doc['createdAt'],
            'updatedAt': doc['updatedAt'],
        }
    )


def _workflow_from_docs(workflow_doc: dict[str, Any], memory_doc: dict[str, Any] | None) -> WorkflowState:
    memory_doc = memory_doc or {}
    return WorkflowState.model_validate(
        {
            'id': workflow_doc['_id'],
            'status': workflow_doc['status'],
            'currentTask': memory_doc.get('currentTask', workflow_doc.get('currentTask')),
            'extractedEntities': memory_doc.get('extractedEntities') or {},
            'missingFields': memory_doc.get('missingFields') or [],
            'activePreviewId': workflow_doc.get('activePreviewId'),
            'activeApprovalId': workflow_doc.get('activeApprovalId'),
        }
    )


def _summary_from_doc(doc: dict[str, Any]) -> ConversationSummary:
    return ConversationSummary.model_validate(
        {
            'id': doc['_id'],
            'title': doc['title'],
            'createdAt': doc['createdAt'],
            'updatedAt': doc['updatedAt'],
            'lastMessagePreview': doc.get('lastMessagePreview'),
            'lastRole': doc.get('lastRole'),
        }
    )


class MongoAIRepository(AIRepository):
    def __init__(self, client: AsyncIOMotorClient, settings: Settings) -> None:
        self._client = client
        self._settings = settings
        self._db: AsyncIOMotorDatabase = client[settings.mongo_database]
        self._indexes_ready = False
        self._tenant_settings_cache: dict[str, dict[str, Any]] = {}

    @property
    def database(self) -> AsyncIOMotorDatabase:
        return self._db

    async def ensure_indexes(self) -> None:
        if self._indexes_ready:
            return

        await self._db.ai_conversations.create_index([('tenantId', ASCENDING), ('updatedAt', DESCENDING)])
        await self._db.ai_conversations.create_index([('tenantId', ASCENDING), ('createdBy', ASCENDING), ('updatedAt', DESCENDING)])
        await self._db.ai_conversations.create_index([('tenantId', ASCENDING), ('status', ASCENDING), ('updatedAt', DESCENDING)])
        await self._db.ai_conversations.create_index('expiresAt', expireAfterSeconds=0)

        await self._db.ai_conversation_messages.create_index(
            [('tenantId', ASCENDING), ('conversationId', ASCENDING), ('createdAt', ASCENDING), ('_id', ASCENDING)]
        )
        await self._db.ai_conversation_messages.create_index([('tenantId', ASCENDING), ('workflowId', ASCENDING), ('createdAt', ASCENDING)])
        await self._db.ai_conversation_messages.create_index([('tenantId', ASCENDING), ('runId', ASCENDING), ('createdAt', ASCENDING)])
        await self._db.ai_conversation_messages.create_index([('tenantId', ASCENDING), ('createdAt', DESCENDING)])
        await self._db.ai_conversation_messages.create_index('expiresAt', expireAfterSeconds=0)

        await self._db.ai_workflows.create_index([('tenantId', ASCENDING), ('conversationId', ASCENDING), ('updatedAt', DESCENDING)])
        await self._db.ai_workflows.create_index([('tenantId', ASCENDING), ('activeApprovalId', ASCENDING)])
        await self._db.ai_workflows.create_index([('tenantId', ASCENDING), ('status', ASCENDING), ('updatedAt', DESCENDING)])
        await self._db.ai_workflows.create_index('expiresAt', expireAfterSeconds=0)

        await self._db.ai_workflow_memory.create_index(
            [('tenantId', ASCENDING), ('workflowId', ASCENDING)],
            unique=True,
        )
        await self._db.ai_workflow_memory.create_index([('tenantId', ASCENDING), ('conversationId', ASCENDING), ('updatedAt', DESCENDING)])
        await self._db.ai_workflow_memory.create_index('expiresAt', expireAfterSeconds=0)

        await self._db.ai_runs.create_index([('tenantId', ASCENDING), ('conversationId', ASCENDING), ('createdAt', DESCENDING)])
        await self._db.ai_runs.create_index([('tenantId', ASCENDING), ('workflowId', ASCENDING), ('createdAt', DESCENDING)])
        await self._db.ai_runs.create_index([('tenantId', ASCENDING), ('status', ASCENDING), ('createdAt', DESCENDING)])
        await self._db.ai_runs.create_index('expiresAt', expireAfterSeconds=0)

        await self._db.ai_run_events.create_index([('tenantId', ASCENDING), ('runId', ASCENDING), ('sequence', ASCENDING)], unique=True)
        await self._db.ai_run_events.create_index([('tenantId', ASCENDING), ('conversationId', ASCENDING), ('createdAt', DESCENDING)])
        await self._db.ai_run_events.create_index('expiresAt', expireAfterSeconds=0)

        await self._db.ai_traces.create_index([('tenantId', ASCENDING), ('runId', ASCENDING), ('createdAt', ASCENDING)])
        await self._db.ai_traces.create_index([('tenantId', ASCENDING), ('agentRole', ASCENDING), ('createdAt', DESCENDING)])
        await self._db.ai_traces.create_index([('tenantId', ASCENDING), ('createdAt', DESCENDING)])
        await self._db.ai_traces.create_index('expiresAt', expireAfterSeconds=0)

        await self._db.ai_entity_memory.create_index([('tenantId', ASCENDING), ('conversationId', ASCENDING), ('createdAt', DESCENDING)])
        await self._db.ai_entity_memory.create_index([('tenantId', ASCENDING), ('userId', ASCENDING), ('createdAt', DESCENDING)])
        await self._db.ai_entity_memory.create_index([('tenantId', ASCENDING), ('entityType', ASCENDING), ('normalizedLabel', ASCENDING)])
        await self._db.ai_entity_memory.create_index([('tenantId', ASCENDING), ('entityType', ASCENDING), ('entityId', ASCENDING)])
        await self._db.ai_entity_memory.create_index('expiresAt', expireAfterSeconds=0)

        await self._db.ai_business_memory.create_index(
            [('tenantId', ASCENDING), ('memoryType', ASCENDING), ('key', ASCENDING)],
            unique=True,
        )
        await self._db.ai_business_memory.create_index([('tenantId', ASCENDING), ('memoryType', ASCENDING)])
        await self._db.ai_business_memory.create_index([('tenantId', ASCENDING), ('updatedAt', DESCENDING)])
        await self._db.ai_business_memory.create_index('expiresAt', expireAfterSeconds=0)

        await self._db.ai_user_memory.create_index(
            [('tenantId', ASCENDING), ('userId', ASCENDING), ('memoryType', ASCENDING), ('key', ASCENDING)],
            unique=True,
        )
        await self._db.ai_user_memory.create_index([('tenantId', ASCENDING), ('userId', ASCENDING), ('updatedAt', DESCENDING)])
        await self._db.ai_user_memory.create_index('expiresAt', expireAfterSeconds=0)

        await self._db.ai_conversation_summaries.create_index([('tenantId', ASCENDING), ('conversationId', ASCENDING), ('createdAt', DESCENDING)])
        await self._db.ai_conversation_summaries.create_index('expiresAt', expireAfterSeconds=0)

        await self._db.ai_training_datasets.create_index(
            [('tenantId', ASCENDING), ('name', ASCENDING), ('version', ASCENDING)],
            unique=True,
        )
        await self._db.ai_training_examples.create_index([('tenantId', ASCENDING), ('datasetId', ASCENDING), ('createdAt', DESCENDING)])
        await self._db.ai_training_examples.create_index([('tenantId', ASCENDING), ('quality', ASCENDING), ('createdAt', DESCENDING)])

        await self._db.ai_semantic_memory.create_index([('tenantId', ASCENDING), ('memoryType', ASCENDING), ('createdAt', DESCENDING)])
        await self._db.ai_semantic_memory.create_index([('tenantId', ASCENDING), ('userId', ASCENDING), ('createdAt', DESCENDING)])
        await self._db.ai_semantic_memory.create_index([('tenantId', ASCENDING), ('conversationId', ASCENDING), ('createdAt', DESCENDING)])
        await self._db.ai_semantic_memory.create_index('expiresAt', expireAfterSeconds=0)

        await self._db.ai_tenant_settings.create_index('tenantId', unique=True)

        await self._db.ai_attachments.create_index([('tenantId', ASCENDING), ('conversationId', ASCENDING), ('createdAt', DESCENDING)])
        await self._db.ai_attachments.create_index([('tenantId', ASCENDING), ('uploadedBy', ASCENDING), ('createdAt', DESCENDING)])
        await self._db.ai_attachments.create_index([('tenantId', ASCENDING), ('status', ASCENDING), ('createdAt', DESCENDING)])
        await self._db.ai_attachments.create_index('expiresAt', expireAfterSeconds=0)

        await self._db.ai_help_documents.create_index([('tenantId', ASCENDING), ('sourceKey', ASCENDING)], unique=True)
        await self._db.ai_help_chunks.create_index([('tenantId', ASCENDING), ('documentId', ASCENDING), ('chunkIndex', ASCENDING)], unique=True)

        self._indexes_ready = True

    async def list_conversations(self, tenant_id: str) -> list[ConversationSummary]:
        docs = await self._db.ai_conversations.find(
            {'tenantId': tenant_id, 'status': {'$ne': 'deleted'}}
        ).sort('updatedAt', DESCENDING).to_list(length=200)
        return [_summary_from_doc(doc) for doc in docs]

    async def create_conversation(
        self,
        tenant_id: str,
        created_by: str,
        title: str,
    ) -> tuple[ConversationDetail, WorkflowState]:
        now = utc_now()
        conversation_id = str(uuid4())
        workflow_id = str(uuid4())
        memory_id = str(uuid4())
        conversation_doc = {
            '_id': conversation_id,
            'tenantId': tenant_id,
            'createdBy': created_by,
            'title': title,
            'status': 'active',
            'lastMessagePreview': None,
            'lastRole': None,
            'messageCount': 0,
            'summaryStatus': 'none',
            'createdAt': now,
            'updatedAt': now,
            'expiresAt': None,
        }
        workflow_doc = {
            '_id': workflow_id,
            'tenantId': tenant_id,
            'conversationId': conversation_id,
            'status': WorkflowStatus.IDLE.value,
            'currentTask': 'conversation_bootstrap',
            'activePreviewId': None,
            'activeApprovalId': None,
            'createdAt': now,
            'updatedAt': now,
            'expiresAt': None,
        }
        memory_doc = {
            '_id': memory_id,
            'tenantId': tenant_id,
            'conversationId': conversation_id,
            'workflowId': workflow_id,
            'currentTask': 'conversation_bootstrap',
            'extractedEntities': {},
            'missingFields': [],
            'recentEntities': {},
            'pendingState': {
                'pendingAction': None,
                'pendingToolName': None,
                'awaitingField': None,
                'requiredInputs': [],
                'draftPayload': {},
                'lastClarificationQuestion': None,
            },
            'createdAt': now,
            'updatedAt': now,
            'expiresAt': None,
        }
        await self._db.ai_conversations.insert_one(conversation_doc)
        await self._db.ai_workflows.insert_one(workflow_doc)
        await self._db.ai_workflow_memory.insert_one(memory_doc)
        return _conversation_from_doc(conversation_doc), _workflow_from_docs(workflow_doc, memory_doc)

    async def get_conversation(
        self,
        tenant_id: str,
        conversation_id: UUID,
        *,
        message_limit: int,
        before_created_at: datetime | None = None,
        before_id: str | None = None,
    ) -> ConversationFetchResult | None:
        conversation_doc = await self._db.ai_conversations.find_one(
            {'tenantId': tenant_id, '_id': str(conversation_id), 'status': {'$ne': 'deleted'}}
        )
        if conversation_doc is None:
            return None
        workflow_doc = await self._db.ai_workflows.find_one(
            {'tenantId': tenant_id, 'conversationId': str(conversation_id)},
            sort=[('updatedAt', DESCENDING)],
        )
        memory_doc = None
        workflow = None
        if workflow_doc is not None:
            memory_doc = await self._db.ai_workflow_memory.find_one(
                {'tenantId': tenant_id, 'workflowId': workflow_doc['_id']}
            )
            workflow = _workflow_from_docs(workflow_doc, memory_doc)
        page = await self._list_message_page(
            tenant_id=tenant_id,
            conversation_id=str(conversation_id),
            limit=message_limit,
            before_created_at=before_created_at,
            before_id=before_id,
        )
        return ConversationFetchResult(
            conversation=_conversation_from_doc(conversation_doc),
            workflow=workflow,
            page=page,
        )

    async def update_conversation(
        self,
        tenant_id: str,
        conversation_id: UUID,
        *,
        title: str | None = None,
        status: str | None = None,
        archived_at: datetime | None = None,
    ) -> None:
        update: dict[str, Any] = {'updatedAt': utc_now()}
        if title is not None:
            update['title'] = title
        if status is not None:
            update['status'] = status
        if archived_at is not None:
            update['archivedAt'] = archived_at
        await self._db.ai_conversations.update_one({'tenantId': tenant_id, '_id': str(conversation_id)}, {'$set': update})

    async def archive_conversation(self, tenant_id: str, conversation_id: UUID) -> None:
        await self.update_conversation(tenant_id, conversation_id, status='archived', archived_at=utc_now())

    async def delete_conversation_soft(self, tenant_id: str, conversation_id: UUID) -> None:
        await self.update_conversation(tenant_id, conversation_id, status='deleted')

    async def append_message(
        self,
        tenant_id: str,
        conversation_id: UUID,
        workflow_id: UUID | None,
        role: MessageRole,
        blocks: list[MessageBlock],
        *,
        raw_text: str | None = None,
        attachments: list[MessageAttachmentRef] | None = None,
        run_id: UUID | None = None,
        metadata: dict[str, object] | None = None,
    ) -> ChatMessage:
        now = utc_now()
        message_doc = {
            '_id': str(uuid4()),
            'tenantId': tenant_id,
            'conversationId': str(conversation_id),
            'workflowId': _uuid_text(workflow_id),
            'runId': _uuid_text(run_id),
            'role': role.value,
            'rawText': raw_text,
            'blocks': [block.model_dump(by_alias=True, mode='json') for block in blocks],
            'attachments': [attachment.model_dump(by_alias=True, mode='json') for attachment in attachments or []],
            'tokenEstimate': _estimate_tokens(raw_text or _preview_text([block.model_dump(by_alias=True, mode='json') for block in blocks])),
            'metadata': metadata or {},
            'createdAt': now,
            'expiresAt': await self._get_retention_expiry(tenant_id, 'raw_messages', now=now),
        }
        await self._db.ai_conversation_messages.insert_one(message_doc)
        await self._db.ai_conversations.update_one(
            {'tenantId': tenant_id, '_id': str(conversation_id)},
            {
                '$set': {
                    'updatedAt': now,
                    'lastMessagePreview': _preview_text(message_doc['blocks']),
                    'lastRole': role.value,
                },
                '$inc': {'messageCount': 1},
            },
        )
        return _message_from_doc(message_doc)

    async def list_message_dicts(
        self,
        tenant_id: str,
        conversation_id: UUID,
        *,
        limit: int,
    ) -> list[dict[str, object]]:
        messages = await self.list_recent_messages(tenant_id, conversation_id, limit=limit)
        return [message.model_dump(by_alias=True, mode='json') for message in messages]

    async def list_recent_messages(
        self,
        tenant_id: str,
        conversation_id: UUID,
        *,
        limit: int,
    ) -> list[ChatMessage]:
        docs = await self._db.ai_conversation_messages.find(
            {'tenantId': tenant_id, 'conversationId': str(conversation_id)}
        ).sort([('createdAt', DESCENDING), ('_id', DESCENDING)]).limit(limit).to_list(length=limit)
        docs.reverse()
        return [_message_from_doc(doc) for doc in docs]

    async def get_message(self, tenant_id: str, conversation_id: UUID, message_id: str) -> ChatMessage | None:
        doc = await self._db.ai_conversation_messages.find_one(
            {'tenantId': tenant_id, 'conversationId': str(conversation_id), '_id': message_id}
        )
        return None if doc is None else _message_from_doc(doc)

    async def create_workflow(
        self,
        tenant_id: str,
        conversation_id: UUID,
        *,
        current_task: str,
    ) -> WorkflowState:
        now = utc_now()
        workflow_doc = {
            '_id': str(uuid4()),
            'tenantId': tenant_id,
            'conversationId': str(conversation_id),
            'status': WorkflowStatus.IDLE.value,
            'currentTask': current_task,
            'activePreviewId': None,
            'activeApprovalId': None,
            'createdAt': now,
            'updatedAt': now,
            'expiresAt': None,
        }
        memory_doc = {
            '_id': str(uuid4()),
            'tenantId': tenant_id,
            'conversationId': str(conversation_id),
            'workflowId': workflow_doc['_id'],
            'currentTask': current_task,
            'extractedEntities': {},
            'missingFields': [],
            'recentEntities': {},
            'pendingState': {
                'pendingAction': None,
                'pendingToolName': None,
                'awaitingField': None,
                'requiredInputs': [],
                'draftPayload': {},
                'lastClarificationQuestion': None,
            },
            'createdAt': now,
            'updatedAt': now,
            'expiresAt': None,
        }
        await self._db.ai_workflows.insert_one(workflow_doc)
        await self._db.ai_workflow_memory.insert_one(memory_doc)
        return _workflow_from_docs(workflow_doc, memory_doc)

    async def find_workflow_by_id(self, tenant_id: str, workflow_id: UUID) -> WorkflowState | None:
        workflow_doc = await self._db.ai_workflows.find_one({'tenantId': tenant_id, '_id': str(workflow_id)})
        if workflow_doc is None:
            return None
        memory_doc = await self._db.ai_workflow_memory.find_one({'tenantId': tenant_id, 'workflowId': str(workflow_id)})
        return _workflow_from_docs(workflow_doc, memory_doc)

    async def get_conversation_by_workflow_id(
        self,
        tenant_id: str,
        workflow_id: UUID,
    ) -> tuple[ConversationDetail, WorkflowState] | None:
        workflow_doc = await self._db.ai_workflows.find_one({'tenantId': tenant_id, '_id': str(workflow_id)})
        if workflow_doc is None:
            return None
        conversation_doc = await self._db.ai_conversations.find_one(
            {'tenantId': tenant_id, '_id': workflow_doc['conversationId'], 'status': {'$ne': 'deleted'}}
        )
        if conversation_doc is None:
            return None
        memory_doc = await self._db.ai_workflow_memory.find_one({'tenantId': tenant_id, 'workflowId': str(workflow_id)})
        return _conversation_from_doc(conversation_doc), _workflow_from_docs(workflow_doc, memory_doc)

    async def find_workflow_by_approval_id(self, tenant_id: str, approval_id: str) -> WorkflowState | None:
        workflow_doc = await self._db.ai_workflows.find_one({'tenantId': tenant_id, 'activeApprovalId': approval_id})
        if workflow_doc is None:
            return None
        memory_doc = await self._db.ai_workflow_memory.find_one({'tenantId': tenant_id, 'workflowId': workflow_doc['_id']})
        return _workflow_from_docs(workflow_doc, memory_doc)

    async def save_workflow_state(
        self,
        tenant_id: str,
        workflow_id: UUID,
        *,
        status: WorkflowStatus,
        current_task: str | None = None,
        extracted_entities: dict[str, object] | None = None,
        missing_fields: list[str] | None = None,
        active_preview_id: UUID | None = None,
        active_approval_id: UUID | None = None,
    ) -> None:
        now = utc_now()
        workflow_doc = await self._db.ai_workflows.find_one({'tenantId': tenant_id, '_id': str(workflow_id)})
        if workflow_doc is None:
            return
        await self._db.ai_workflows.update_one(
            {'tenantId': tenant_id, '_id': str(workflow_id)},
            {
                '$set': {
                    'status': status.value,
                    'currentTask': current_task,
                    'activePreviewId': _uuid_text(active_preview_id),
                    'activeApprovalId': _uuid_text(active_approval_id),
                    'updatedAt': now,
                }
            },
        )
        await self._db.ai_workflow_memory.update_one(
            {'tenantId': tenant_id, 'workflowId': str(workflow_id)},
            {
                '$set': {
                    'conversationId': workflow_doc['conversationId'],
                    'currentTask': current_task,
                    'extractedEntities': extracted_entities or {},
                    'missingFields': missing_fields or [],
                    'updatedAt': now,
                },
                '$setOnInsert': {
                    '_id': str(uuid4()),
                    'tenantId': tenant_id,
                    'workflowId': str(workflow_id),
                    'createdAt': now,
                },
            },
            upsert=True,
        )

    async def update_workflow_status(
        self,
        tenant_id: str,
        workflow_id: UUID,
        status: WorkflowStatus,
        current_task: str | None = None,
    ) -> None:
        await self.save_workflow_state(
            tenant_id,
            workflow_id,
            status=status,
            current_task=current_task,
        )

    def build_pending_action(self, workflow: WorkflowState | None) -> PendingAction | None:
        if workflow is None:
            return None
        pending_actions = workflow.extracted_entities.get('_pendingActions')
        pending_prompt = workflow.extracted_entities.get('_pendingPrompt')
        if not isinstance(pending_actions, list) or not pending_prompt:
            return None
        actions: list[PendingActionType] = []
        for action in pending_actions:
            try:
                actions.append(PendingActionType(str(action)))
            except ValueError:
                continue
        if not actions:
            return None
        return PendingAction(workflow_id=workflow.id, actions=actions, prompt=str(pending_prompt))

    async def create_run(
        self,
        *,
        tenant_id: str,
        conversation_id: UUID,
        workflow_id: UUID | None,
        user_message: str,
    ) -> RunSummary:
        now = utc_now()
        doc = {
            '_id': str(uuid4()),
            'tenantId': tenant_id,
            'conversationId': str(conversation_id),
            'workflowId': _uuid_text(workflow_id),
            'status': 'running',
            'userMessage': user_message,
            'errorMessage': None,
            'startedAt': now,
            'completedAt': None,
            'createdAt': now,
            'updatedAt': now,
            'expiresAt': await self._get_retention_expiry(tenant_id, 'raw_messages', now=now),
        }
        await self._db.ai_runs.insert_one(doc)
        return RunSummary.model_validate(
            {
                'id': doc['_id'],
                'conversationId': doc['conversationId'],
                'workflowId': doc.get('workflowId'),
                'status': doc['status'],
                'userMessage': doc['userMessage'],
                'createdAt': doc['createdAt'],
                'updatedAt': doc['updatedAt'],
            }
        )

    async def finish_run(
        self,
        *,
        tenant_id: str,
        run_id: UUID,
        status: str,
        error_message: str | None = None,
    ) -> None:
        now = utc_now()
        await self._db.ai_runs.update_one(
            {'tenantId': tenant_id, '_id': str(run_id)},
            {
                '$set': {
                    'status': status,
                    'errorMessage': error_message,
                    'completedAt': now if status != 'running' else None,
                    'updatedAt': now,
                }
            },
        )

    async def append_run_event(
        self,
        *,
        tenant_id: str,
        run_id: UUID,
        conversation_id: UUID,
        workflow_id: UUID | None,
        sequence: int,
        event_type: str,
        payload: dict[str, object],
    ) -> RunEvent:
        now = utc_now()
        doc = {
            '_id': str(uuid4()),
            'tenantId': tenant_id,
            'runId': str(run_id),
            'conversationId': str(conversation_id),
            'workflowId': _uuid_text(workflow_id),
            'sequence': sequence,
            'eventType': event_type,
            'payload': payload,
            'createdAt': now,
            'expiresAt': await self._get_retention_expiry(tenant_id, 'run_events', now=now),
        }
        await self._db.ai_run_events.insert_one(doc)
        return RunEvent.model_validate(
            {
                'type': event_type,
                'runId': str(run_id),
                'conversationId': str(conversation_id),
                'workflowId': _uuid_text(workflow_id),
                'sequence': sequence,
                'payload': payload,
            }
        )

    async def list_run_events(self, *, tenant_id: str, run_id: UUID) -> list[RunEvent]:
        docs = await self._db.ai_run_events.find({'tenantId': tenant_id, 'runId': str(run_id)}).sort('sequence', ASCENDING).to_list(length=500)
        return [
            RunEvent.model_validate(
                {
                    'type': doc['eventType'],
                    'runId': doc['runId'],
                    'conversationId': doc['conversationId'],
                    'workflowId': doc.get('workflowId'),
                    'sequence': doc['sequence'],
                    'payload': doc.get('payload') or {},
                }
            )
            for doc in docs
        ]

    async def record_trace(
        self,
        *,
        tenant_id: str,
        run_id: UUID,
        conversation_id: UUID | None,
        workflow_id: UUID | None,
        agent_role: str,
        provider_name: str,
        model_name: str,
        stage: str,
        payload: dict[str, object],
        redacted_payload: dict[str, object],
    ) -> RunTraceRecord:
        now = utc_now()
        doc = {
            '_id': str(uuid4()),
            'tenantId': tenant_id,
            'runId': str(run_id),
            'conversationId': _uuid_text(conversation_id),
            'workflowId': _uuid_text(workflow_id),
            'agentRole': agent_role,
            'providerName': provider_name,
            'modelName': model_name,
            'stage': stage,
            'payload': payload,
            'redactedPayload': redacted_payload,
            'createdAt': now,
            'expiresAt': await self._get_retention_expiry(tenant_id, 'traces', now=now),
        }
        await self._db.ai_traces.insert_one(doc)
        return RunTraceRecord.model_validate(
            {
                'id': doc['_id'],
                'runId': doc['runId'],
                'stage': doc['stage'],
                'agentRole': doc['agentRole'],
                'providerName': doc['providerName'],
                'modelName': doc['modelName'],
                'payload': doc.get('payload') or {},
                'redactedPayload': doc.get('redactedPayload') or {},
                'createdAt': doc['createdAt'],
            }
        )

    async def list_recent_trace_examples(self, tenant_id: str, *, limit: int) -> list[dict[str, object]]:
        docs = await self._db.ai_traces.find({'tenantId': tenant_id}).sort('createdAt', DESCENDING).limit(limit).to_list(length=limit)
        return [
            {
                'agentRole': doc['agentRole'],
                'stage': doc['stage'],
                'payload': doc.get('redactedPayload') or {},
                'createdAt': doc['createdAt'].isoformat(),
            }
            for doc in docs
        ]

    async def create_training_dataset(
        self,
        *,
        tenant_id: str,
        name: str,
        version: str,
        status: str,
    ) -> dict[str, object]:
        now = utc_now()
        doc = {
            '_id': str(uuid4()),
            'tenantId': tenant_id,
            'name': name,
            'version': version,
            'status': status,
            'exampleCount': 0,
            'createdAt': now,
            'updatedAt': now,
        }
        await self._db.ai_training_datasets.insert_one(doc)
        return TrainingDatasetSummary.model_validate(
            {
                'id': doc['_id'],
                'name': doc['name'],
                'version': doc['version'],
                'status': doc['status'],
                'exampleCount': doc['exampleCount'],
                'createdAt': doc['createdAt'],
                'updatedAt': doc['updatedAt'],
            }
        ).model_dump(by_alias=True, mode='json')

    async def add_training_example(
        self,
        *,
        tenant_id: str,
        dataset_id: str,
        trace_id: str | None,
        payload: dict[str, object],
        redacted_payload: dict[str, object],
        quality: str = 'unknown',
    ) -> dict[str, object]:
        now = utc_now()
        doc = {
            '_id': str(uuid4()),
            'tenantId': tenant_id,
            'datasetId': dataset_id,
            'traceId': trace_id,
            'payload': payload,
            'redactedPayload': redacted_payload,
            'quality': quality,
            'createdAt': now,
        }
        await self._db.ai_training_examples.insert_one(doc)
        await self._db.ai_training_datasets.update_one(
            {'tenantId': tenant_id, '_id': dataset_id},
            {'$inc': {'exampleCount': 1}, '$set': {'updatedAt': now}},
        )
        return doc

    async def record_entity_memory(self, *, tenant_id: str, payload: dict[str, object]) -> dict[str, object]:
        now = utc_now()
        doc = {
            '_id': payload.get('_id') or payload.get('id') or str(uuid4()),
            'tenantId': tenant_id,
            'userId': payload.get('userId'),
            'conversationId': payload.get('conversationId'),
            'entityType': payload.get('entityType', 'generic'),
            'entityId': payload.get('entityId'),
            'label': payload.get('label', ''),
            'normalizedLabel': payload.get('normalizedLabel') or str(payload.get('label', '')).strip().lower(),
            'metadata': payload.get('metadata') or {},
            'source': payload.get('source', 'system'),
            'confidence': float(payload.get('confidence') or 0),
            'createdAt': now,
            'updatedAt': now,
            'expiresAt': await self._get_retention_expiry(tenant_id, 'memory', now=now),
        }
        await self._db.ai_entity_memory.insert_one(doc)
        return doc

    async def list_recent_entity_memory(
        self,
        tenant_id: str,
        *,
        conversation_id: str | None = None,
        user_id: str | None = None,
        limit: int,
    ) -> list[dict[str, object]]:
        query: dict[str, Any] = {'tenantId': tenant_id}
        if conversation_id is not None:
            query['conversationId'] = conversation_id
        if user_id is not None:
            query['userId'] = user_id
        return await self._db.ai_entity_memory.find(query).sort('createdAt', DESCENDING).limit(limit).to_list(length=limit)

    async def upsert_business_memory(
        self,
        *,
        tenant_id: str,
        memory_type: str,
        key: str,
        value: dict[str, object],
        confidence: float,
        source: str,
        created_by: str | None = None,
    ) -> dict[str, object]:
        now = utc_now()
        return await self._db.ai_business_memory.find_one_and_update(
            {'tenantId': tenant_id, 'memoryType': memory_type, 'key': key},
            {
                '$set': {
                    'value': value,
                    'confidence': confidence,
                    'source': source,
                    'createdBy': created_by,
                    'updatedAt': now,
                    'expiresAt': await self._get_retention_expiry(tenant_id, 'memory', now=now),
                },
                '$setOnInsert': {
                    '_id': str(uuid4()),
                    'tenantId': tenant_id,
                    'memoryType': memory_type,
                    'key': key,
                    'createdAt': now,
                },
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )

    async def list_business_memory(self, tenant_id: str, *, limit: int) -> list[dict[str, object]]:
        return await self._db.ai_business_memory.find({'tenantId': tenant_id}).sort('updatedAt', DESCENDING).limit(limit).to_list(length=limit)

    async def upsert_user_memory(
        self,
        *,
        tenant_id: str,
        user_id: str,
        memory_type: str,
        key: str,
        value: dict[str, object],
        confidence: float,
        source: str,
    ) -> dict[str, object]:
        now = utc_now()
        return await self._db.ai_user_memory.find_one_and_update(
            {'tenantId': tenant_id, 'userId': user_id, 'memoryType': memory_type, 'key': key},
            {
                '$set': {
                    'value': value,
                    'confidence': confidence,
                    'source': source,
                    'updatedAt': now,
                    'expiresAt': await self._get_retention_expiry(tenant_id, 'memory', now=now),
                },
                '$setOnInsert': {
                    '_id': str(uuid4()),
                    'tenantId': tenant_id,
                    'userId': user_id,
                    'memoryType': memory_type,
                    'key': key,
                    'createdAt': now,
                },
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )

    async def list_user_memory(self, tenant_id: str, user_id: str, *, limit: int) -> list[dict[str, object]]:
        return await self._db.ai_user_memory.find({'tenantId': tenant_id, 'userId': user_id}).sort('updatedAt', DESCENDING).limit(limit).to_list(length=limit)

    async def append_conversation_summary(
        self,
        *,
        tenant_id: str,
        conversation_id: str,
        summary: str,
        entities: dict[str, object],
        summary_type: str,
        token_estimate: int | None = None,
    ) -> dict[str, object]:
        now = utc_now()
        doc = {
            '_id': str(uuid4()),
            'tenantId': tenant_id,
            'conversationId': conversation_id,
            'summary': summary,
            'entities': entities,
            'tokenEstimate': token_estimate,
            'summaryType': summary_type,
            'createdAt': now,
            'expiresAt': await self._get_retention_expiry(tenant_id, 'summaries', now=now),
        }
        await self._db.ai_conversation_summaries.insert_one(doc)
        await self._db.ai_conversations.update_one(
            {'tenantId': tenant_id, '_id': conversation_id},
            {'$set': {'summaryStatus': 'ready', 'updatedAt': now}},
        )
        return doc

    async def get_latest_conversation_summary(self, tenant_id: str, conversation_id: str) -> dict[str, object] | None:
        return await self._db.ai_conversation_summaries.find_one(
            {'tenantId': tenant_id, 'conversationId': conversation_id},
            sort=[('createdAt', DESCENDING)],
        )

    async def upsert_semantic_memory(self, *, tenant_id: str, payload: dict[str, object]) -> dict[str, object]:
        now = utc_now()
        doc_id = payload.get('_id') or payload.get('id') or str(uuid4())
        doc = {
            '_id': doc_id,
            'tenantId': tenant_id,
            'userId': payload.get('userId'),
            'conversationId': payload.get('conversationId'),
            'memoryType': payload.get('memoryType', 'message'),
            'content': payload.get('content', ''),
            'embedding': payload.get('embedding') or [],
            'metadata': payload.get('metadata') or {},
            'createdAt': payload.get('createdAt') or now,
            'updatedAt': now,
            'expiresAt': payload.get('expiresAt') or await self._get_retention_expiry(tenant_id, 'memory', now=now),
        }
        await self._db.ai_semantic_memory.update_one({'tenantId': tenant_id, '_id': doc_id}, {'$set': doc}, upsert=True)
        return doc

    async def search_semantic_memory(
        self,
        *,
        tenant_id: str,
        query_embedding: list[float] | None,
        user_id: str | None = None,
        conversation_id: str | None = None,
        limit: int,
    ) -> list[dict[str, object]]:
        if not self._settings.ai_vector_search_enabled or not query_embedding:
            return []
        vector_filter: dict[str, Any] = {'tenantId': tenant_id}
        if user_id is not None:
            vector_filter['userId'] = user_id
        if conversation_id is not None:
            vector_filter['conversationId'] = conversation_id
        try:
            cursor = self._db.ai_semantic_memory.aggregate(
                [
                    {
                        '$vectorSearch': {
                            'index': 'ai_semantic_memory_embedding',
                            'path': 'embedding',
                            'queryVector': query_embedding,
                            'numCandidates': max(limit * 10, 20),
                            'limit': limit,
                            'filter': vector_filter,
                        }
                    }
                ]
            )
            return await cursor.to_list(length=limit)
        except Exception:  # pragma: no cover - depends on Atlas configuration
            logger.exception('Semantic memory search failed')
            return []

    async def create_attachment_metadata(self, *, tenant_id: str, payload: dict[str, object]) -> dict[str, object]:
        now = utc_now()
        doc = {
            '_id': payload.get('_id') or payload.get('id') or str(uuid4()),
            'tenantId': tenant_id,
            'conversationId': payload['conversationId'],
            'messageId': payload.get('messageId'),
            'uploadedBy': payload['uploadedBy'],
            'filename': payload['filename'],
            'contentType': payload['contentType'],
            'sizeBytes': int(payload['sizeBytes']),
            's3Bucket': payload['s3Bucket'],
            's3Key': payload['s3Key'],
            'sha256': payload.get('sha256'),
            'status': payload.get('status', 'uploaded'),
            'metadata': payload.get('metadata') or {},
            'expiresAt': payload.get('expiresAt') or await self._get_retention_expiry(tenant_id, 'attachments', now=now),
            'createdAt': now,
            'updatedAt': now,
        }
        await self._db.ai_attachments.insert_one(doc)
        return doc

    async def update_attachment_status(
        self,
        *,
        tenant_id: str,
        attachment_id: str,
        status: str,
        metadata: dict[str, object] | None = None,
    ) -> dict[str, object] | None:
        update: dict[str, Any] = {'status': status, 'updatedAt': utc_now()}
        if metadata is not None:
            update['metadata'] = metadata
        return await self._db.ai_attachments.find_one_and_update(
            {'tenantId': tenant_id, '_id': attachment_id},
            {'$set': update},
            return_document=ReturnDocument.AFTER,
        )

    async def get_attachment_metadata(
        self,
        *,
        tenant_id: str,
        attachment_id: str,
    ) -> dict[str, object] | None:
        return await self._db.ai_attachments.find_one({'tenantId': tenant_id, '_id': attachment_id})

    async def list_attachments_by_ids(
        self,
        *,
        tenant_id: str,
        conversation_id: str,
        attachment_ids: list[str],
    ) -> list[dict[str, object]]:
        if not attachment_ids:
            return []
        docs = await self._db.ai_attachments.find(
            {'tenantId': tenant_id, 'conversationId': conversation_id, '_id': {'$in': attachment_ids}}
        ).to_list(length=len(attachment_ids))
        by_id = {doc['_id']: doc for doc in docs}
        return [by_id[attachment_id] for attachment_id in attachment_ids if attachment_id in by_id]

    async def list_conversation_attachments(self, tenant_id: str, conversation_id: str) -> list[dict[str, object]]:
        return await self._db.ai_attachments.find(
            {'tenantId': tenant_id, 'conversationId': conversation_id}
        ).sort('createdAt', DESCENDING).to_list(length=200)

    async def get_tenant_ai_settings(self, tenant_id: str) -> dict[str, object]:
        cached = self._tenant_settings_cache.get(tenant_id)
        if cached is not None:
            return cached
        doc = await self._db.ai_tenant_settings.find_one({'tenantId': tenant_id})
        if doc is None:
            now = utc_now()
            doc = {
                '_id': tenant_id,
                'tenantId': tenant_id,
                'retention': DEFAULT_RETENTION.copy(),
                'features': {
                    'vectorSearchEnabled': self._settings.ai_vector_search_enabled,
                    'trainingDatasetEnabled': True,
                    'attachmentUploadsEnabled': True,
                },
                'createdAt': now,
                'updatedAt': now,
            }
        self._tenant_settings_cache[tenant_id] = doc
        return doc

    async def upsert_tenant_ai_settings(self, tenant_id: str, payload: dict[str, object]) -> dict[str, object]:
        now = utc_now()
        doc = await self._db.ai_tenant_settings.find_one_and_update(
            {'tenantId': tenant_id},
            {
                '$set': {
                    'retention': payload.get('retention') or DEFAULT_RETENTION.copy(),
                    'features': payload.get('features')
                    or {
                        'vectorSearchEnabled': self._settings.ai_vector_search_enabled,
                        'trainingDatasetEnabled': True,
                        'attachmentUploadsEnabled': True,
                    },
                    'updatedAt': now,
                },
                '$setOnInsert': {
                    '_id': tenant_id,
                    'tenantId': tenant_id,
                    'createdAt': now,
                },
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        self._tenant_settings_cache[tenant_id] = doc
        return doc

    async def _list_message_page(
        self,
        *,
        tenant_id: str,
        conversation_id: str,
        limit: int,
        before_created_at: datetime | None,
        before_id: str | None,
    ) -> MessagePage:
        query: dict[str, Any] = {'tenantId': tenant_id, 'conversationId': conversation_id}
        if before_created_at is not None and before_id is not None:
            query['$or'] = [
                {'createdAt': {'$lt': before_created_at}},
                {'createdAt': before_created_at, '_id': {'$lt': before_id}},
            ]
        docs = await self._db.ai_conversation_messages.find(query).sort(
            [('createdAt', DESCENDING), ('_id', DESCENDING)]
        ).limit(limit + 1).to_list(length=limit + 1)
        has_more = len(docs) > limit
        page_docs = docs[:limit]
        page_docs.reverse()
        next_cursor_created_at = None
        next_cursor_id = None
        if has_more and page_docs:
            next_cursor_created_at = page_docs[0]['createdAt']
            next_cursor_id = page_docs[0]['_id']
        return MessagePage(
            messages=[_message_from_doc(doc) for doc in page_docs],
            next_cursor_created_at=next_cursor_created_at,
            next_cursor_id=next_cursor_id,
            has_more=has_more,
        )

    async def _get_retention_expiry(
        self,
        tenant_id: str,
        data_type: str,
        *,
        now: datetime | None = None,
    ) -> datetime | None:
        settings = await self.get_tenant_ai_settings(tenant_id)
        retention = settings.get('retention') or DEFAULT_RETENTION
        field_by_type = {
            'raw_messages': 'rawMessagesDays',
            'traces': 'tracesDays',
            'run_events': 'runEventsDays',
            'attachments': 'attachmentsDays',
            'summaries': 'summariesDays',
            'memory': 'memoryDays',
        }
        days = retention.get(field_by_type[data_type])
        if days is None:
            return None
        return (now or utc_now()) + timedelta(days=int(days))
