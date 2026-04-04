from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from conversational_engine.agents.registry_agent import AgentRegistry
from conversational_engine.agents.types_agent import AgentTurnResult
from conversational_engine.clients.backend_client import BackendClient
from conversational_engine.llm.routing_model import ModelRouting
from conversational_engine.schemas.api_schemas import ApprovalRequestStatus
from conversational_engine.schemas.auth_schemas import AuthContext
from conversational_engine.schemas.shared_schemas import (
    ApprovalPendingBlock,
    ApprovalResultBlock,
    ClarificationBlock,
    ConfirmationRequiredBlock,
    ConversationDetail,
    ErrorBlock,
    MessageBlock,
    NavigationBlock,
    PendingActionType,
    PreviewBlock,
    PreviewEntity,
    SuccessBlock,
    TableColumn,
    TableResultBlock,
    TextBlock,
    WorkflowState,
    WorkflowStatus,
)
from conversational_engine.llm.provider_interfaces import IntentClassifier
from conversational_engine.retrieval.retrieval_service import RetrievalService

SIZE_LABELS = {'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'} | {str(size) for size in range(2, 31, 2)}
READ_ONLY_INTENTS = {'stock_query', 'reporting_query', 'navigation_help'}
WRITE_PENDING_ACTIONS = [
    PendingActionType.CONFIRM.value,
    PendingActionType.CANCEL.value,
    PendingActionType.EDIT.value,
    PendingActionType.SUBMIT_FOR_APPROVAL.value,
]


@dataclass(slots=True)
class OrchestratorOutcome:
    blocks: list[MessageBlock]
    status: WorkflowStatus
    current_task: str
    extracted_entities: dict[str, object]
    missing_fields: list[str]
    active_preview_id: UUID | None = None
    active_approval_id: UUID | None = None


def _normalize(value: str) -> str:
    return ' '.join(''.join(character.lower() if character.isalnum() else ' ' for character in value).split())


def _normalized_tokens(value: str) -> set[str]:
    return {token for token in _normalize(value).split() if token}


def _contains_any(message: str, *needles: str) -> bool:
    normalized = _normalize(message)
    return any(_normalize(needle) in normalized for needle in needles)


def _matches_intent_pattern(message: str, *patterns: str) -> bool:
    return any(re.search(pattern, message, re.IGNORECASE) for pattern in patterns)


def _parse_uuid(text: str) -> str | None:
    match = re.search(
        r'\b[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}\b',
        text,
    )
    return match.group(0) if match else None


def _parse_integer(text: str, *, keyword: str | None = None) -> int | None:
    if keyword:
        pattern = re.compile(rf'{re.escape(keyword)}\s*(?:is|of|=)?\s*(\d+)', re.IGNORECASE)
        match = pattern.search(text)
        if match:
            return int(match.group(1))
    match = re.search(r'(?:x|qty|quantity|units?|cost|price|@)\s*(\d+)', text, re.IGNORECASE)
    if match:
        return int(match.group(1))
    standalone = re.search(r'\b(\d+)\b', text)
    return int(standalone.group(1)) if standalone else None


def _parse_money(text: str) -> int | None:
    patterns = [
        r'(?:\$|cost|unit cost|base price|price|prce)\s*(?:is|of|=)?\s*(\d+)',
        r'\b(\d+)\s*(?:gbp|usd|eur|pounds?|dollars?)\b',
        r'@\s*(\d+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return int(match.group(1))
    return None


def _parse_iso_date(text: str) -> str | None:
    match = re.search(r'\b(20\d{2}-\d{2}-\d{2})\b', text)
    if not match:
        return None
    return f'{match.group(1)}T00:00:00Z'


def _parse_size_labels(text: str) -> list[str]:
    labels: list[str] = []
    for token in re.findall(r'\b[A-Za-z0-9]+\b', text.upper()):
        if token in SIZE_LABELS and token not in labels:
            labels.append(token)
    return labels


def _extract_color_names(text: str) -> list[str]:
    patterns = [
        r'with\s+([a-zA-Z][a-zA-Z\s,]+?)\s+colors?\b',
        r'colors?\s+(?:are|is|=)?\s*([a-zA-Z][a-zA-Z\s,]+?)(?=\s+(?:with|sizes?|sku|barcode|location|quantity|stock|status)\b|$)',
        r'color\s+(?:is|=)?\s*([a-zA-Z][a-zA-Z\s,]+?)(?=\s+(?:with|sizes?|sku|barcode|location|quantity|stock|status)\b|$)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if not match:
            continue
        raw = match.group(1)
        tokens = [
            token.strip(" ,")
            for token in re.split(r',|\band\b', raw, flags=re.IGNORECASE)
            if token.strip(" ,")
        ]
        cleaned: list[str] = []
        for token in tokens:
            label = ' '.join(token.split())
            if label and label.lower() not in {'with'} and label not in cleaned:
                cleaned.append(label.title())
        if cleaned:
            return cleaned
    return []


def _dedupe_entities(entities: list[PreviewEntity]) -> list[PreviewEntity]:
    seen: set[tuple[str, str]] = set()
    results: list[PreviewEntity] = []
    for entity in entities:
        key = (entity.label, entity.value)
        if key in seen:
            continue
        seen.add(key)
        results.append(entity)
    return results


def _serialize_entities(entities: list[PreviewEntity]) -> list[dict[str, str]]:
    return [entity.model_dump(by_alias=True, mode='json') for entity in entities]


class OrchestratorService:
    def __init__(
        self,
        backend_client: BackendClient,
        retrieval_service: RetrievalService,
        agent_registry: AgentRegistry,
        model_routing: ModelRouting,
        intent_classifier: IntentClassifier | None,
        *,
        mutations_enabled: bool = True,
        retrieval_enabled: bool = True,
    ) -> None:
        self._backend_client = backend_client
        self._retrieval_service = retrieval_service
        self._agent_registry = agent_registry
        self._model_routing = model_routing
        self._intent_classifier = intent_classifier
        self._mutations_enabled = mutations_enabled
        self._retrieval_enabled = retrieval_enabled

    async def handle_message(
        self,
        auth: AuthContext,
        conversation: ConversationDetail,
        workflow: WorkflowState,
        user_message: str,
    ) -> OrchestratorOutcome:
        memory = dict(workflow.extracted_entities or {})
        await self._audit(
            auth,
            conversation_id=str(conversation.id),
            workflow_id=str(workflow.id),
            event_type='incoming_message',
            payload={'requestText': user_message},
        )

        if workflow.status == WorkflowStatus.AWAITING_APPROVAL and workflow.active_approval_id:
            approval = await self._backend_client.get_approval_request(
                access_token=auth.access_token or '',
                tenant_id=auth.tenant_id,
                approval_id=str(workflow.active_approval_id),
            )
            message = (
                'This request is still waiting on approval.'
                if approval.status == 'pending'
                else f'This request is currently marked as {approval.status}.'
            )
            return OrchestratorOutcome(
                blocks=[
                    TextBlock(content=message),
                    ApprovalPendingBlock(
                        approval_id=approval.id,
                        status=approval.status,
                        message='Open AI approvals to approve or reject this request.',
                    ),
                ],
                status=workflow.status,
                current_task=workflow.current_task or 'awaiting_approval',
                extracted_entities=memory,
                missing_fields=[],
                active_preview_id=workflow.active_preview_id,
                active_approval_id=workflow.active_approval_id,
            )

        intent = await self._classify_intent_with_providers(user_message, memory, workflow)
        memory['intent'] = intent
        await self._audit(
            auth,
            conversation_id=str(conversation.id),
            workflow_id=str(workflow.id),
            event_type='intent_classified',
            payload={'intent': intent},
        )
        agent = self._agent_registry.resolve(intent)
        if agent is None:
            await self._audit(
                auth,
                conversation_id=str(conversation.id),
                workflow_id=str(workflow.id),
                event_type='agent_selected',
                payload={'agent': None, 'intent': intent},
            )
            return OrchestratorOutcome(
                blocks=[
                    ErrorBlock(
                        title='Unsupported request',
                        message=f'No agent is registered for intent: {intent}',
                    )
                ],
                status=WorkflowStatus.FAILED,
                current_task='no_agent',
                extracted_entities=memory,
                missing_fields=[],
            )

        await self._audit(
            auth,
            conversation_id=str(conversation.id),
            workflow_id=str(workflow.id),
            event_type='agent_selected',
            payload={'agent': agent.name, 'intent': intent},
        )

        try:
            result: AgentTurnResult = await agent.handle_turn(
                auth=auth,
                conversation=conversation,
                workflow=workflow,
                intent=intent,
                user_message=user_message,
                memory=memory,
            )
        except Exception as exc:
            await self._audit(
                auth,
                conversation_id=str(conversation.id),
                workflow_id=str(workflow.id),
                event_type='agent_error',
                payload={'agent': agent.name, 'intent': intent, 'message': str(exc)},
            )
            return OrchestratorOutcome(
                blocks=[
                    ErrorBlock(
                        title='Assistant error',
                        message='Something went wrong while processing that request. Please try again.',
                    )
                ],
                status=WorkflowStatus.FAILED,
                current_task=f'{intent}:agent_error',
                extracted_entities=memory,
                missing_fields=[],
                active_preview_id=workflow.active_preview_id,
                active_approval_id=workflow.active_approval_id,
            )
        memory.update(result.memory_updates or {})

        if result.next_action == 'return_read_result':
            return OrchestratorOutcome(
                blocks=result.blocks or [TextBlock(content='Done.')],
                status=WorkflowStatus.IDLE,
                current_task=f'{intent}:completed',
                extracted_entities=memory,
                missing_fields=[],
                active_preview_id=workflow.active_preview_id,
                active_approval_id=workflow.active_approval_id,
            )

        missing_fields = list(result.missing_fields or [])
        if result.next_action == 'ask_follow_up':
            prompt = result.follow_up_prompt or self._clarification_prompt(intent, memory, missing_fields)
            memory.pop('_pendingActions', None)
            memory.pop('_pendingPrompt', None)
            await self._audit(
                auth,
                conversation_id=str(conversation.id),
                workflow_id=str(workflow.id),
                event_type='follow_up_requested',
                payload={'intent': intent, 'missingFields': missing_fields},
            )
            return OrchestratorOutcome(
                blocks=result.blocks
                or [ClarificationBlock(prompt=prompt, required_fields=missing_fields)],
                status=WorkflowStatus.NEEDS_INPUT,
                current_task=f'{intent}:collect_fields',
                extracted_entities=memory,
                missing_fields=missing_fields,
                active_preview_id=workflow.active_preview_id,
                active_approval_id=workflow.active_approval_id,
            )

        if not self._mutations_enabled:
            return OrchestratorOutcome(
                blocks=[
                    ErrorBlock(
                        title='Mutations Disabled',
                        message='Write workflows are disabled for this environment.',
                    )
                ],
                status=WorkflowStatus.FAILED,
                current_task=f'{intent}:mutations_disabled',
                extracted_entities=memory,
                missing_fields=[],
            )

        return await self._wrap_preview(auth, conversation, workflow, intent, memory)

    async def _classify_intent_with_providers(
        self, user_message: str, memory: dict[str, object], workflow: WorkflowState
    ) -> str:
        normalized = _normalize(user_message)
        if workflow.status in {
            WorkflowStatus.NEEDS_INPUT,
            WorkflowStatus.AWAITING_CONFIRMATION,
            WorkflowStatus.AWAITING_APPROVAL,
        }:
            if memory.get('intent') and 'new chat' not in normalized and 'start over' not in normalized:
                return str(memory['intent'])

        intents = [
            'stock_query',
            'stock_transfer',
            'stock_adjustment',
            'stock_receipt',
            'product_create',
            'product_update',
            'po_create',
            'po_update',
            'po_receive',
            'po_close',
            'so_create',
            'so_update',
            'so_dispatch',
            'so_cancel',
            'reporting_query',
            'navigation_help',
            'unknown',
        ]
        if self._intent_classifier:
            try:
                model = self._model_routing.model_for(agent_name='orchestrator_classifier', task='classify')
                result = await self._intent_classifier.classify(model=model, text=user_message, intents=intents)
                if result.confidence >= 0.3:
                    return result.intent
            except Exception:
                pass

        return self._classify_intent(user_message, memory)

    async def _wrap_preview(
        self,
        auth: AuthContext,
        conversation: ConversationDetail,
        workflow: WorkflowState,
        intent: str,
        memory: dict[str, object],
    ) -> OrchestratorOutcome:
        preview_id = uuid4()
        preview_payload = memory.get('preview')
        if not isinstance(preview_payload, dict):
            return OrchestratorOutcome(
                blocks=[
                    ErrorBlock(
                        title='Preview missing',
                        message='The workflow cannot continue because no preview payload was generated.',
                    )
                ],
                status=WorkflowStatus.FAILED,
                current_task='preview_missing',
                extracted_entities=memory,
                missing_fields=[],
            )

        action_type = str(memory.get('actionType') or intent)
        summary = str(memory.get('summary') or preview_payload.get('nextStep') or '')
        memory['summary'] = summary
        memory['reason'] = preview_payload.get('warnings', [''])[0] if preview_payload.get('warnings') else ''
        if auth.access_token:
            memory['requesterAccessToken'] = auth.access_token
        memory['_pendingActions'] = WRITE_PENDING_ACTIONS
        memory['_pendingPrompt'] = 'Review the preview, then confirm or submit it for approval.'

        await self._audit(
            auth,
            conversation_id=str(conversation.id),
            workflow_id=str(workflow.id),
            event_type='preview_generated',
            payload={'actionType': action_type, 'summary': summary},
        )

        return OrchestratorOutcome(
            blocks=[
                TextBlock(content=f'Prepared a preview for {action_type.replace("_", " ")}.'),
                PreviewBlock(
                    action_type=str(preview_payload.get('actionType') or action_type.replace('_', ' ').title()),
                    actor=str(preview_payload.get('actor') or auth.email),
                    entities=preview_payload.get('entities', []),
                    warnings=preview_payload.get('warnings', []),
                    approval_required=True,
                    next_step=str(preview_payload.get('nextStep') or 'Confirm to continue.'),
                ),
                ConfirmationRequiredBlock(
                    prompt='Confirm these details to submit the action for approval.',
                    allowed_actions=[
                        PendingActionType.CONFIRM,
                        PendingActionType.CANCEL,
                        PendingActionType.EDIT,
                        PendingActionType.SUBMIT_FOR_APPROVAL,
                    ],
                ),
            ],
            status=WorkflowStatus.AWAITING_CONFIRMATION,
            current_task=f'{action_type}:preview_ready',
            extracted_entities=memory,
            missing_fields=[],
            active_preview_id=preview_id,
            active_approval_id=None,
        )

    async def handle_decision(
        self,
        auth: AuthContext,
        conversation: ConversationDetail,
        workflow: WorkflowState,
        decision: str,
    ) -> OrchestratorOutcome:
        memory = dict(workflow.extracted_entities or {})
        action_type = str(memory.get('actionType') or memory.get('intent') or '')

        if decision == PendingActionType.CANCEL.value:
            memory.pop('requesterAccessToken', None)
            memory.pop('_pendingActions', None)
            memory.pop('_pendingPrompt', None)
            await self._audit(
                auth,
                conversation_id=str(conversation.id),
                workflow_id=str(workflow.id),
                event_type='workflow_canceled',
                payload={'actionType': action_type},
            )
            return OrchestratorOutcome(
                blocks=[
                    ErrorBlock(
                        title='Workflow canceled',
                        message='No changes were made.',
                    )
                ],
                status=WorkflowStatus.FAILED,
                current_task=f'{action_type or "workflow"}:canceled',
                extracted_entities=memory,
                missing_fields=[],
                active_preview_id=workflow.active_preview_id,
                active_approval_id=None,
            )

        if decision == PendingActionType.EDIT.value:
            memory.pop('_pendingActions', None)
            memory.pop('_pendingPrompt', None)
            return OrchestratorOutcome(
                blocks=[
                    ClarificationBlock(
                        prompt='Reply with the corrections you want and I will regenerate the preview.',
                        required_fields=[],
                    )
                ],
                status=WorkflowStatus.NEEDS_INPUT,
                current_task=f'{action_type or "workflow"}:editing',
                extracted_entities=memory,
                missing_fields=[],
                active_preview_id=workflow.active_preview_id,
                active_approval_id=workflow.active_approval_id,
            )

        if decision not in {PendingActionType.CONFIRM.value, PendingActionType.SUBMIT_FOR_APPROVAL.value}:
            return OrchestratorOutcome(
                blocks=[
                    ErrorBlock(
                        title='Unsupported decision',
                        message=f'Unhandled workflow decision: {decision}',
                    )
                ],
                status=WorkflowStatus.FAILED,
                current_task='unsupported_decision',
                extracted_entities=memory,
                missing_fields=[],
            )

        tool_name = str(memory.get('toolName') or '')
        execution_payload = memory.get('executionPayload')
        preview_payload = memory.get('preview')

        if not tool_name or not isinstance(execution_payload, dict) or not isinstance(preview_payload, dict):
            return OrchestratorOutcome(
                blocks=[
                    ErrorBlock(
                        title='Missing preview data',
                        message='The workflow cannot continue because the execution payload is incomplete.',
                    )
                ],
                status=WorkflowStatus.FAILED,
                current_task='preview_missing',
                extracted_entities=memory,
                missing_fields=[],
            )

        evaluation = await self._backend_client.evaluate_approval(
            access_token=auth.access_token or '',
            tenant_id=auth.tenant_id,
            action_type=action_type,
            quantity=int(execution_payload.get('quantity', 0)) if execution_payload.get('quantity') else None,
        )

        if evaluation.requires_approval:
            approval = await self._backend_client.create_approval_request(
                access_token=auth.access_token or '',
                tenant_id=auth.tenant_id,
                payload={
                    'actionType': action_type,
                    'toolName': tool_name,
                    'conversationId': str(conversation.id),
                    'workflowId': str(workflow.id),
                    'summary': memory.get('summary') or action_type.replace('_', ' '),
                    'reason': evaluation.reason or 'Approval is required for this action.',
                    'preview': preview_payload,
                    'executionPayload': execution_payload,
                },
            )
            memory['activeApprovalId'] = str(approval.id)
            memory.pop('_pendingActions', None)
            memory.pop('_pendingPrompt', None)
            await self._audit(
                auth,
                conversation_id=str(conversation.id),
                workflow_id=str(workflow.id),
                event_type='approval_requested',
                payload={'approvalId': str(approval.id), 'actionType': action_type},
            )
            return OrchestratorOutcome(
                blocks=[
                    ApprovalPendingBlock(
                        approval_id=approval.id,
                        status=approval.status,
                        message='Approval request submitted. Execution will continue after approval.',
                    )
                ],
                status=WorkflowStatus.AWAITING_APPROVAL,
                current_task=f'{action_type}:awaiting_approval',
                extracted_entities=memory,
                missing_fields=[],
                active_preview_id=workflow.active_preview_id,
                active_approval_id=approval.id,
            )

        execution_result = await self._execute_action(auth, action_type, tool_name, execution_payload, None)
        return self._execution_outcome(
            auth=auth,
            conversation=conversation,
            workflow=workflow,
            action_type=action_type,
            memory=memory,
            execution_result=execution_result,
        )

    async def handle_approval_result(
        self,
        auth: AuthContext,
        conversation: ConversationDetail,
        workflow: WorkflowState,
        approval: ApprovalRequestStatus,
    ) -> OrchestratorOutcome:
        memory = dict(workflow.extracted_entities or {})
        action_type = approval.action_type

        if approval.status == 'rejected':
            memory.pop('requesterAccessToken', None)
            await self._audit(
                auth,
                conversation_id=str(conversation.id),
                workflow_id=str(workflow.id),
                event_type='approval_rejected',
                payload={'approvalId': str(approval.id), 'actionType': action_type},
            )
            memory.pop('_pendingActions', None)
            memory.pop('_pendingPrompt', None)
            return OrchestratorOutcome(
                blocks=[
                    ApprovalResultBlock(
                        approval_id=approval.id,
                        status='rejected',
                        message='The request was rejected and no action was executed.',
                    ),
                    ErrorBlock(
                        title='Approval rejected',
                        message='This workflow stopped because the approval request was rejected.',
                    ),
                ],
                status=WorkflowStatus.FAILED,
                current_task=f'{action_type}:rejected',
                extracted_entities=memory,
                missing_fields=[],
                active_preview_id=workflow.active_preview_id,
                active_approval_id=approval.id,
            )

        execution_result = await self._execute_action(
            auth,
            action_type,
            approval.tool_name,
            approval.execution_payload,
            approval.id,
            access_token_override=str(memory.get('requesterAccessToken') or auth.access_token or ''),
        )

        if isinstance(execution_result, Exception):
            await self._audit(
                auth,
                conversation_id=str(conversation.id),
                workflow_id=str(workflow.id),
                approval_request_id=str(approval.id),
                event_type='execution_result',
                payload={
                    'actionType': action_type,
                    'message': str(execution_result),
                    'status': 'failed',
                    'summary': approval.summary or action_type.replace('_', ' '),
                },
            )
            return OrchestratorOutcome(
                blocks=[
                    ApprovalResultBlock(
                        approval_id=approval.id,
                        status='approved',
                        message='Approval granted. Execution was attempted.',
                    ),
                    ErrorBlock(
                        title='Execution failed',
                        message=str(execution_result),
                    ),
                ],
                status=WorkflowStatus.FAILED,
                current_task=f'{action_type}:execution_failed',
                extracted_entities=memory,
                missing_fields=[],
                active_preview_id=workflow.active_preview_id,
                active_approval_id=approval.id,
            )

        base_outcome = self._execution_outcome(
            auth=auth,
            conversation=conversation,
            workflow=workflow,
            action_type=action_type,
            memory=memory,
            execution_result=execution_result,
            approval=approval,
        )
        return base_outcome

    def _classify_intent(self, message: str, memory: dict[str, object]) -> str:
        normalized = _normalize(message)

        if memory.get('intent') and any(
            word in normalized for word in ['yes', 'update', 'change', 'it', 'that', 'for', 'with', 'at']
        ):
            return str(memory['intent'])

        if _matches_intent_pattern(
            message,
            r'\bcreate\s+(?:a\s+|an\s+)?po\b',
            r'\bcreate\s+(?:a\s+|an\s+)?purchase\s+order\b',
            r'\bpo\s+draft\b',
            r'\bnew\s+po\b',
            r'\bnew\s+purchase\s+order\b',
        ):
            return 'po_create'
        if _matches_intent_pattern(message, r'\breceive\s+(?:a\s+|the\s+)?po\b', r'\breceive\s+purchase\s+order\b'):
            return 'po_receive'
        if _matches_intent_pattern(message, r'\bclose\s+(?:a\s+|the\s+)?po\b', r'\bclose\s+purchase\s+order\b'):
            return 'po_close'
        if _matches_intent_pattern(
            message,
            r'\bupdate\s+(?:a\s+|the\s+)?po\b',
            r'\bedit\s+(?:a\s+|the\s+)?po\b',
            r'\bupdate\s+purchase\s+order\b',
            r'\bedit\s+purchase\s+order\b',
        ):
            return 'po_update'
        if _matches_intent_pattern(
            message,
            r'\bcreate\s+(?:a\s+|an\s+)?sales\s+order\b',
            r'\bnew\s+sales\s+order\b',
            r'\bcreate\s+(?:a\s+|an\s+)?so\b',
            r'\bnew\s+so\b',
            r'\bcreate\s+(?:an\s+)?invoice\b',
            r'\bnew\s+invoice\b',
        ):
            return 'so_create'
        if _matches_intent_pattern(
            message,
            r'\bupdate\s+(?:a\s+|the\s+)?sales\s+order\b',
            r'\bedit\s+(?:a\s+|the\s+)?sales\s+order\b',
            r'\bupdate\s+(?:a\s+|the\s+)?so\b',
            r'\bedit\s+(?:a\s+|the\s+)?so\b',
            r'\bupdate\s+(?:an\s+|the\s+)?invoice\b',
            r'\bedit\s+(?:an\s+|the\s+)?invoice\b',
        ):
            return 'so_update'
        if _matches_intent_pattern(
            message,
            r'\bdispatch\s+(?:a\s+|the\s+)?sales\s+order\b',
            r'\bship\s+(?:a\s+|the\s+)?sales\s+order\b',
            r'\bdispatch\s+(?:an\s+|the\s+)?invoice\b',
            r'\bship\s+(?:an\s+|the\s+)?invoice\b',
        ):
            return 'so_dispatch'
        if _matches_intent_pattern(
            message,
            r'\bcancel\s+(?:a\s+|the\s+)?sales\s+order\b',
            r'\bcancel\s+(?:a\s+|the\s+)?so\b',
            r'\bcancel\s+(?:an\s+|the\s+)?invoice\b',
        ):
            return 'so_cancel'
        if _matches_intent_pattern(
            message,
            r'\bcreate\s+(?:a\s+|an\s+)?product\b',
            r'\bnew\s+product\b',
            r'\badd\s+(?:a\s+|new\s+)?product\b',
        ):
            return 'product_create'
        if _matches_intent_pattern(
            message,
            r'\bupdate\s+(?:a\s+|the\s+)?product\b',
            r'\bedit\s+(?:a\s+|the\s+)?product\b',
            r'\badd\s+(?:a\s+|the\s+)?sku\b',
            r'\badd\s+(?:a\s+|the\s+)?size\b',
        ):
            return 'product_update'
        if 'transfer' in normalized:
            return 'stock_transfer'
        if any(phrase in normalized for phrase in ['write off', 'damaged', 'adjust', 'cycle count']):
            return 'stock_adjustment'
        if 'receive stock' in normalized or 'stock receipt' in normalized:
            return 'stock_receipt'
        if any(phrase in normalized for phrase in ['report', 'summary', 'movement', 'receipts', 'receipt summary']):
            return 'reporting_query'
        if any(phrase in normalized for phrase in ['help', 'where is', 'how do i', 'how to', 'screen', 'navigate']):
            return 'navigation_help'
        if any(phrase in normalized for phrase in ['stock', 'inventory', 'sku']):
            return 'stock_query'
        if any(phrase in normalized for phrase in ['purchase order', 'po ']):
            return 'reporting_query'
        return str(memory.get('intent') or 'navigation_help')

    async def _extract_entities(
        self,
        auth: AuthContext,
        intent: str,
        memory: dict[str, object],
        message: str,
    ) -> dict[str, object]:
        extracted: dict[str, object] = {}

        if intent in {'stock_transfer', 'stock_adjustment', 'stock_receipt'}:
            extracted.update(await self._extract_inventory_entities(auth, intent, memory, message))
        elif intent in {'po_create', 'po_update', 'po_receive', 'po_close'}:
            extracted.update(await self._extract_po_entities(auth, intent, memory, message))
        elif intent in {'so_create', 'so_update', 'so_dispatch', 'so_cancel'}:
            extracted.update(await self._extract_sales_entities(auth, intent, memory, message))
        elif intent in {'product_create', 'product_update'}:
            extracted.update(await self._extract_product_entities(auth, intent, memory, message))
        elif intent == 'reporting_query':
            extracted.update(await self._extract_reporting_entities(auth, message))
        elif intent == 'navigation_help':
            extracted['query'] = message.strip()
        elif intent == 'stock_query':
            extracted.update(await self._extract_stock_query_entities(auth, message))

        return extracted

    async def _extract_stock_query_entities(self, auth: AuthContext, message: str) -> dict[str, object]:
        location = await self._match_location(auth, message)
        sku_code = self._extract_sku_code(message)
        return {
            'query': message.strip(),
            **({'locationId': location['id'], 'locationLabel': location['label']} if location else {}),
            **({'skuQuery': sku_code} if sku_code else {}),
        }

    async def _extract_reporting_entities(self, auth: AuthContext, message: str) -> dict[str, object]:
        normalized = _normalize(message)
        report_type = 'stock'
        if 'movement' in normalized:
            report_type = 'movement'
        elif 'receipt' in normalized:
            report_type = 'receipt'
        elif 'po' in normalized or 'purchase order' in normalized:
            report_type = 'po'

        location = await self._match_location(auth, message)
        status_match = re.search(r'\b(draft|open|partial|closed)\b', normalized)

        payload: dict[str, object] = {
            'reportType': report_type,
            'query': message.strip(),
        }
        if location:
            payload['locationId'] = location['id']
            payload['locationLabel'] = location['label']
        if status_match:
            payload['status'] = status_match.group(1)
        start = _parse_iso_date(message)
        if start:
            payload['from'] = start
        return payload

    async def _extract_inventory_entities(
        self,
        auth: AuthContext,
        intent: str,
        memory: dict[str, object],
        message: str,
    ) -> dict[str, object]:
        extracted: dict[str, object] = {}
        normalized = _normalize(message)

        if intent == 'stock_transfer':
            from_location = await self._match_location(auth, message, qualifier='from')
            to_location = await self._match_location(auth, message, qualifier='to')
            if from_location:
                extracted['fromLocationId'] = from_location['id']
                extracted['fromLocationLabel'] = from_location['label']
            if to_location:
                extracted['toLocationId'] = to_location['id']
                extracted['toLocationLabel'] = to_location['label']
            extracted['actionType'] = 'transfer_stock'
            extracted['toolName'] = 'inventory.transferStock'
        else:
            location = await self._match_location(auth, message)
            if location:
                extracted['locationId'] = location['id']
                extracted['locationLabel'] = location['label']
            if intent == 'stock_receipt' or 'receive' in normalized:
                extracted['actionType'] = 'receive_stock'
                extracted['toolName'] = 'inventory.receiveStock'
            elif 'cycle count' in normalized:
                extracted['actionType'] = 'cycle_count'
                extracted['toolName'] = 'inventory.cycleCount'
            elif 'write off' in normalized or 'damaged' in normalized:
                extracted['actionType'] = 'write_off_stock'
                extracted['toolName'] = 'inventory.writeOffStock'
            else:
                extracted['actionType'] = 'adjust_stock'
                extracted['toolName'] = 'inventory.adjustStock'

        size_match = await self._resolve_size_reference(
            auth,
            sku_code=self._extract_sku_code(message) or str(memory.get('skuCode') or ''),
            size_label=self._extract_size_label(message) or str(memory.get('sizeLabel') or ''),
        )
        if size_match:
            extracted.update(size_match)

        quantity_match = re.search(
            r'\b(?:quantity|qty|initial stock|stock)\s*(?:is|of|=)?\s*(\d+)\b',
            message,
            re.IGNORECASE,
        )
        if quantity_match:
            extracted['quantity'] = int(quantity_match.group(1))

        reason = self._extract_reason(message)
        if reason:
            extracted['reason'] = reason
        elif extracted.get('actionType') == 'write_off_stock':
            extracted.setdefault('reason', 'damaged stock')
        elif extracted.get('actionType') == 'cycle_count':
            extracted.setdefault('reason', 'cycle count')

        return extracted

    async def _extract_po_entities(
        self,
        auth: AuthContext,
        intent: str,
        memory: dict[str, object],
        message: str,
    ) -> dict[str, object]:
        extracted: dict[str, object] = {}
        normalized = _normalize(message)

        if intent == 'po_create':
            extracted['actionType'] = 'create_po'
            extracted['toolName'] = 'purchasing.createPO'
        elif intent == 'po_receive':
            extracted['actionType'] = 'receive_po'
            extracted['toolName'] = 'purchasing.receivePO'
        elif intent == 'po_close' or 'close po' in normalized:
            extracted['actionType'] = 'close_po'
            extracted['toolName'] = 'purchasing.closePO'
        else:
            extracted['actionType'] = 'update_po'
            extracted['toolName'] = 'purchasing.updatePO'

        supplier = await self._match_supplier(auth, message)
        if supplier:
            extracted['supplierId'] = supplier['id']
            extracted['supplierName'] = supplier['label']

        po_ref = await self._match_po(auth, message)
        if po_ref:
            extracted['poId'] = po_ref['id']
            extracted['poNumber'] = po_ref['number']

        location = await self._match_location(auth, message)
        if location:
            extracted['locationId'] = location['id']
            extracted['locationLabel'] = location['label']

        expected_date = _parse_iso_date(message)
        if expected_date:
            extracted['expectedDate'] = expected_date

        lines = await self._parse_po_lines(
            auth,
            message,
            po_id=str(extracted.get('poId') or memory.get('poId') or ''),
            allow_missing_cost=intent == 'po_receive',
        )
        if lines:
            extracted['lines'] = lines

        return extracted

    async def _extract_sales_entities(
        self,
        auth: AuthContext,
        intent: str,
        memory: dict[str, object],
        message: str,
    ) -> dict[str, object]:
        extracted: dict[str, object] = {}

        if intent == 'so_create':
            extracted['actionType'] = 'create_sales_order'
            extracted['toolName'] = 'sales.createInvoice'
        elif intent == 'so_update':
            extracted['actionType'] = 'update_sales_order'
            extracted['toolName'] = 'sales.updateInvoice'
        elif intent == 'so_dispatch':
            extracted['actionType'] = 'dispatch_sales_order'
            extracted['toolName'] = 'sales.dispatchInvoice'
        else:
            extracted['actionType'] = 'cancel_sales_order'
            extracted['toolName'] = 'sales.cancelInvoice'

        customer = await self._match_customer(auth, message)
        if customer:
            extracted['customerId'] = customer['id']
            extracted['customerName'] = customer['label']

        invoice_ref = await self._match_invoice(auth, message)
        if invoice_ref:
            extracted['invoiceId'] = invoice_ref['id']
            extracted['invoiceNumber'] = invoice_ref['number']

        location = await self._match_location(auth, message)
        if location:
            extracted['locationId'] = location['id']
            extracted['locationLabel'] = location['label']

        lines = await self._parse_sales_lines(
            auth,
            message,
            invoice_id=str(extracted.get('invoiceId') or memory.get('invoiceId') or ''),
        )
        if lines:
            extracted['lines'] = lines

        return extracted

    async def _extract_product_entities(
        self,
        auth: AuthContext,
        intent: str,
        memory: dict[str, object],
        message: str,
    ) -> dict[str, object]:
        extracted: dict[str, object] = {}
        normalized = _normalize(message)

        product_ref = await self._match_product(auth, message)
        if product_ref:
            extracted['productId'] = product_ref['id']
            extracted['productName'] = product_ref['label']

        category = await self._match_category(auth, message)
        if category:
            extracted['categoryId'] = category['id']
            extracted['category'] = category['label']
        elif match := re.search(r'category\s+([a-zA-Z0-9 -]+)', message, re.IGNORECASE):
            extracted['category'] = match.group(1).strip()
        elif match := re.search(r'([a-zA-Z0-9 -]+)\s+category\b', message, re.IGNORECASE):
            extracted['category'] = match.group(1).strip(' ,')

        if style := re.search(r'sty(?:le|e)(?:\s*code)?\s*(?:is|=|:)?\s*([A-Za-z0-9_-]+)', message, re.IGNORECASE):
            extracted['styleCode'] = style.group(1).strip().upper()

        name_match = re.search(
            r'(?:name|named)\s+"?(.+?)"?(?=\s+(?:with|style|category|base|price|colors?|sizes?|sku|barcode|location|stock|qty|quantity)\b|$)',
            message,
            re.IGNORECASE,
        )
        if name_match:
            extracted['name'] = name_match.group(1).strip()

        price = _parse_money(message)
        if price is not None:
            extracted['basePrice'] = price

        if brand := re.search(r'brand\s+([a-zA-Z0-9 -]+)', message, re.IGNORECASE):
            extracted['brand'] = brand.group(1).strip()

        color_names = _extract_color_names(message)
        if color_names:
            extracted['colorNames'] = color_names
            extracted['colorName'] = color_names[0]

        sku_code = self._extract_sku_code(message)
        if sku_code:
            extracted['skuCode'] = sku_code

        size_labels = _parse_size_labels(message)
        if size_labels:
            extracted['sizeLabels'] = size_labels

        if barcode := re.search(r'barcode\s+([A-Za-z0-9-]+)', message, re.IGNORECASE):
            extracted['barcode'] = barcode.group(1).strip()

        location = await self._match_location(auth, message)
        if location:
            extracted['locationId'] = location['id']
            extracted['locationLabel'] = location['label']

        quantity_match = re.search(
            (
                r'(?:\b(?:quantity|qty|initial stock|stock)\s*(?:is|of|=)?\s*(\d+)\b|'
                r'\bhas\s+(\d+)\s+stock\b|\b(\d+)\s+stock\b)'
            ),
            message,
            re.IGNORECASE,
        )
        if quantity_match:
            extracted['quantity'] = int(next(group for group in quantity_match.groups() if group is not None))
            size_labels = extracted.get('sizeLabels') or memory.get('sizeLabels')
            if (
                isinstance(size_labels, list)
                and size_labels
                and re.search(r'\beach\b', message, re.IGNORECASE)
            ):
                extracted['sizeQuantities'] = {
                    str(size_label): int(extracted['quantity']) for size_label in size_labels
                }

        media_url = re.search(r'(https?://\S+)', message)
        if media_url:
            extracted['mediaUrl'] = media_url.group(1)

        if 'inactive' in normalized:
            extracted['status'] = 'inactive'
        elif 'active' in normalized:
            extracted['status'] = 'active'

        if intent == 'product_create':
            extracted['actionType'] = 'create_product'
            extracted['toolName'] = 'products.createProduct'
        else:
            extracted['actionType'] = 'update_product'
            extracted['toolName'] = 'products.updateProduct'

        if pickup := re.search(r'pickup\s+(enabled|disabled)', normalized):
            extracted['pickupEnabled'] = pickup.group(1) == 'enabled'

        return extracted

    def _missing_fields(self, intent: str, memory: dict[str, object]) -> list[str]:
        required: list[str]

        if intent == 'po_create':
            required = ['supplier_id', 'lines']
        elif intent == 'po_receive':
            required = ['po_id', 'location_id', 'lines']
        elif intent == 'po_close':
            required = ['po_id']
        elif intent == 'po_update':
            required = ['po_id', 'changes']
        elif intent == 'so_create':
            required = ['customer_id', 'lines']
        elif intent == 'so_dispatch':
            required = ['invoice_id', 'location_id']
        elif intent == 'so_cancel':
            required = ['invoice_id']
        elif intent == 'so_update':
            required = ['invoice_id', 'changes']
        elif intent == 'stock_transfer':
            required = ['from_location_id', 'to_location_id', 'sku_and_size', 'quantity', 'reason']
        elif intent in {'stock_adjustment', 'stock_receipt'}:
            required = ['location_id', 'sku_and_size', 'quantity', 'reason']
        elif intent == 'product_create':
            required = ['style_code', 'name', 'base_price', 'category', 'color_name', 'size_labels']
            if ('quantity' in memory) ^ ('locationId' in memory):
                required.append('location_and_quantity')
            size_labels = memory.get('sizeLabels')
            if (
                isinstance(size_labels, list)
                and len(size_labels) > 1
                and memory.get('quantity') is not None
                and memory.get('locationId')
                and not memory.get('sizeQuantities')
            ):
                required.append('size_quantity_breakdown')
        elif intent == 'product_update':
            required = ['product_id', 'changes']
        elif intent == 'reporting_query':
            required = ['report_type']
        else:
            required = []

        missing: list[str] = []
        for field in required:
            if field == 'supplier_id' and not memory.get('supplierId'):
                missing.append(field)
            elif field == 'customer_id' and not memory.get('customerId'):
                missing.append(field)
            elif field == 'lines' and not memory.get('lines'):
                missing.append(field)
            elif field == 'po_id' and not memory.get('poId'):
                missing.append(field)
            elif field == 'invoice_id' and not memory.get('invoiceId'):
                missing.append(field)
            elif field == 'location_id' and not memory.get('locationId'):
                missing.append(field)
            elif field == 'from_location_id' and not memory.get('fromLocationId'):
                missing.append(field)
            elif field == 'to_location_id' and not memory.get('toLocationId'):
                missing.append(field)
            elif field == 'sku_and_size' and not memory.get('sizeId'):
                missing.append(field)
            elif field == 'quantity' and not memory.get('quantity'):
                missing.append(field)
            elif field == 'reason' and not memory.get('reason'):
                missing.append(field)
            elif field == 'style_code' and not memory.get('styleCode'):
                missing.append(field)
            elif field == 'name' and not memory.get('name'):
                missing.append(field)
            elif field == 'base_price' and memory.get('basePrice') is None:
                missing.append(field)
            elif field == 'category' and not memory.get('category'):
                missing.append(field)
            elif field == 'color_name' and not memory.get('colorName'):
                missing.append(field)
            elif field == 'size_labels' and not memory.get('sizeLabels'):
                missing.append(field)
            elif field == 'location_and_quantity' and (not memory.get('locationId') or memory.get('quantity') is None):
                missing.append(field)
            elif field == 'product_id' and not memory.get('productId'):
                missing.append(field)
            elif (
                field == 'changes'
                and not self._has_product_changes(memory)
                and not self._has_po_changes(memory)
                and not self._has_so_changes(memory)
            ):
                missing.append(field)
            elif field == 'report_type' and not memory.get('reportType'):
                missing.append(field)

        return missing

    def _clarification_prompt(
        self,
        intent: str,
        memory: dict[str, object],
        missing_fields: list[str],
    ) -> str:
        if intent == 'po_create':
            if 'supplier_id' in missing_fields:
                return 'Which supplier should this PO draft use?'
            if 'lines' in missing_fields:
                return 'Reply with PO lines in the format `SKUCODE/SIZE xQTY @UNIT_COST`, separated by commas.'
        if intent == 'po_receive':
            if 'po_id' in missing_fields:
                return (
                    'Which purchase order should I receive? You can reply with the PO number, PO id, or supplier name.'
                )
            if 'location_id' in missing_fields:
                return 'Which location should receive this PO?'
            if 'lines' in missing_fields:
                return 'Reply with receipt lines in the format `SKUCODE/SIZE xQTY`, separated by commas.'
        if intent == 'po_update':
            if 'po_id' in missing_fields:
                return 'Which purchase order should I update or close?'
            return 'What should change on the PO? You can update supplier, expected date, or lines.'
        if intent == 'po_close':
            return 'Which purchase order should I close?'
        if intent == 'so_create':
            if 'customer_id' in missing_fields:
                return 'Which customer should this sales order use?'
            if 'lines' in missing_fields:
                return (
                    'Reply with sales order lines in the format '
                    '`SKUCODE/SIZE xQTY @UNIT_PRICE`, separated by commas.'
                )
        if intent == 'so_update':
            if 'invoice_id' in missing_fields:
                return 'Which sales order should I update? Reply with the SO number, invoice id, or customer name.'
            return 'What should change on the sales order? You can update customer or lines.'
        if intent == 'so_dispatch':
            if 'invoice_id' in missing_fields:
                return 'Which sales order should I dispatch?'
            if 'location_id' in missing_fields:
                return 'Which location should dispatch this sales order?'
        if intent == 'so_cancel':
            return 'Which sales order should I cancel?'
        if intent == 'stock_transfer':
            prompts = {
                'from_location_id': 'Which source location should stock move from?',
                'to_location_id': 'Which destination location should stock move to?',
                'sku_and_size': 'Which SKU and size should move? Reply like `SKUCODE/SIZE`.',
                'quantity': 'How many units should move?',
                'reason': 'What reason should be recorded for this transfer?',
            }
            return prompts[missing_fields[0]]
        if intent in {'stock_adjustment', 'stock_receipt'}:
            prompts = {
                'location_id': 'Which location is affected?',
                'sku_and_size': 'Which SKU and size is affected? Reply like `SKUCODE/SIZE`.',
                'quantity': 'How many units should be changed?',
                'reason': 'What reason should be recorded?',
            }
            return prompts[missing_fields[0]]
        if intent == 'product_create':
            prompts = {
                'style_code': 'What style code should this product use?',
                'name': 'What product name should I use?',
                'base_price': 'What base price should I set?',
                'category': 'Which category should the product belong to?',
                'color_name': 'What is the first variant color?',
                'size_labels': 'Which sizes should I create? Reply like `S, M, L`.',
                'location_and_quantity': (
                    'If you want initial stock, reply with both location and quantity. '
                    'Otherwise say `no initial stock`.'
                ),
                'size_quantity_breakdown': (
                    'You included multiple sizes with one stock quantity. Reply with one size, '
                    'or send per-size quantities one at a time.'
                ),
            }
            return prompts[missing_fields[0]]
        if intent == 'product_update':
            if 'product_id' in missing_fields:
                return 'Which product should I update? Reply with the product name, style code, or product id.'
            return (
                'What should change on this product? You can update base fields, '
                'add or update a SKU, add a size, or enable a location.'
            )
        if intent == 'reporting_query':
            return 'Which report do you need: stock, movement, purchase orders, or receipts?'
        return f'I still need: {", ".join(missing_fields)}.'

    async def _handle_read(
        self,
        auth: AuthContext,
        conversation: ConversationDetail,
        workflow: WorkflowState,
        intent: str,
        memory: dict[str, object],
        user_message: str,
    ) -> OrchestratorOutcome:
        if intent == 'stock_query':
            params: dict[str, object] = {}
            if memory.get('skuQuery'):
                params['sku'] = memory['skuQuery']
            if memory.get('locationId'):
                params['locationId'] = memory['locationId']
            await self._audit(
                auth,
                conversation_id=str(conversation.id),
                workflow_id=str(workflow.id),
                event_type='tool_call',
                payload={'toolName': 'inventory.getStockOnHand', 'params': params},
            )
            payload = await self._backend_client.stock_on_hand(
                access_token=auth.access_token or '',
                tenant_id=auth.tenant_id,
                params=params,
            )
            rows = payload if isinstance(payload, list) else [payload]
            table_rows = [self._json_safe_row(row) for row in rows[:25] if isinstance(row, dict)]
            await self._audit(
                auth,
                conversation_id=str(conversation.id),
                workflow_id=str(workflow.id),
                event_type='tool_result',
                payload={'toolName': 'inventory.getStockOnHand', 'rowCount': len(table_rows)},
            )
            blocks: list[MessageBlock] = [
                TextBlock(content=f'Found {len(table_rows)} stock row(s).'),
                TableResultBlock(
                    title='Stock on hand',
                    columns=[
                        TableColumn(key='sku_code', label='SKU'),
                        TableColumn(key='product_name', label='Product'),
                        TableColumn(key='size_label', label='Size'),
                        TableColumn(key='location_code', label='Location'),
                        TableColumn(key='on_hand', label='On hand'),
                        TableColumn(key='reserved', label='Reserved'),
                        TableColumn(key='available', label='Available'),
                    ],
                    rows=table_rows,
                ),
            ]
            return OrchestratorOutcome(
                blocks=blocks,
                status=WorkflowStatus.COMPLETED,
                current_task='stock_query:completed',
                extracted_entities=memory,
                missing_fields=[],
            )

        if intent == 'reporting_query':
            report_type = str(memory.get('reportType') or 'stock')
            params: dict[str, object] = {}
            for key in ('locationId', 'from', 'to', 'status'):
                if memory.get(key):
                    params[key] = memory[key]
            tool_name = f'reporting.{report_type}'
            await self._audit(
                auth,
                conversation_id=str(conversation.id),
                workflow_id=str(workflow.id),
                event_type='tool_call',
                payload={'toolName': tool_name, 'params': params},
            )
            if report_type == 'movement':
                rows = await self._backend_client.reporting_movement_summary(
                    auth.access_token or '',
                    auth.tenant_id,
                    params,
                )
                title = 'Movement summary'
            elif report_type == 'receipt':
                rows = await self._backend_client.reporting_receipt_summary(
                    auth.access_token or '',
                    auth.tenant_id,
                    params,
                )
                title = 'Receipt summary'
            elif report_type == 'po':
                rows = await self._backend_client.reporting_po_summary(
                    auth.access_token or '',
                    auth.tenant_id,
                    params,
                )
                title = 'Purchase order summary'
            else:
                rows = await self._backend_client.reporting_stock_summary(
                    auth.access_token or '',
                    auth.tenant_id,
                    params,
                )
                title = 'Stock summary'
            safe_rows = [self._json_safe_row(row) for row in rows[:25]]
            columns = (
                [TableColumn(key=key, label=key.replace('_', ' ').title()) for key in safe_rows[0].keys()]
                if safe_rows
                else []
            )
            await self._audit(
                auth,
                conversation_id=str(conversation.id),
                workflow_id=str(workflow.id),
                event_type='tool_result',
                payload={'toolName': tool_name, 'rowCount': len(safe_rows)},
            )
            return OrchestratorOutcome(
                blocks=[
                    TextBlock(content=f'{title} ready.'),
                    TableResultBlock(title=title, columns=columns, rows=safe_rows),
                ],
                status=WorkflowStatus.COMPLETED,
                current_task=f'{report_type}_report:completed',
                extracted_entities=memory,
                missing_fields=[],
            )

        query = str(memory.get('query') or user_message)
        results = (
            await self._retrieval_service.search_with_navigation(query)
            if self._retrieval_enabled
            else {'docs': [], 'routes': []}
        )
        docs = results.get('docs', [])
        routes = results.get('routes', [])

        blocks: list[MessageBlock] = []
        if docs:
            snippets = ' '.join(str(item.get('content', '')) for item in docs[:2]).strip()
            blocks.append(TextBlock(content=snippets[:400] if snippets else 'I found relevant help content.'))
        elif routes:
            blocks.append(TextBlock(content='I found the most relevant screen for that workflow.'))
        else:
            blocks.append(
                ErrorBlock(
                    title='Help not found',
                    message='I could not find a matching help article or screen for that request.',
                )
            )

        for route in routes[:2]:
            blocks.append(
                NavigationBlock(
                    label=str(route.get('label', 'Open screen')),
                    href=str(route.get('href', '/ai')),
                    description=str(route.get('description', 'Relevant workflow screen')),
                )
            )

        return OrchestratorOutcome(
            blocks=blocks,
            status=WorkflowStatus.COMPLETED,
            current_task='navigation_help:completed',
            extracted_entities=memory,
            missing_fields=[],
        )

    async def _prepare_preview(
        self,
        auth: AuthContext,
        conversation: ConversationDetail,
        workflow: WorkflowState,
        intent: str,
        memory: dict[str, object],
    ) -> OrchestratorOutcome:
        preview_id = uuid4()
        preview_payload = self._build_preview_payload(auth, memory)
        action_type = str(memory.get('actionType') or intent)
        summary = str(memory.get('summary') or preview_payload['nextStep'])
        memory['preview'] = preview_payload
        memory['summary'] = summary
        memory['reason'] = preview_payload['warnings'][0] if preview_payload['warnings'] else ''
        if auth.access_token:
            memory['requesterAccessToken'] = auth.access_token
        memory['_pendingActions'] = WRITE_PENDING_ACTIONS
        memory['_pendingPrompt'] = 'Review the preview, then confirm or submit it for approval.'

        await self._audit(
            auth,
            conversation_id=str(conversation.id),
            workflow_id=str(workflow.id),
            event_type='preview_generated',
            payload={'actionType': action_type, 'summary': summary},
        )

        return OrchestratorOutcome(
            blocks=[
                TextBlock(content=f'Prepared a preview for {action_type.replace("_", " ")}.'),
                PreviewBlock(
                    action_type=preview_payload['actionType'],
                    actor=preview_payload['actor'],
                    entities=preview_payload['entities'],
                    warnings=preview_payload['warnings'],
                    approval_required=True,
                    next_step=preview_payload['nextStep'],
                ),
                ConfirmationRequiredBlock(
                    prompt='Confirm these details to submit the action for approval.',
                    allowed_actions=[
                        PendingActionType.CONFIRM,
                        PendingActionType.CANCEL,
                        PendingActionType.EDIT,
                        PendingActionType.SUBMIT_FOR_APPROVAL,
                    ],
                ),
            ],
            status=WorkflowStatus.AWAITING_CONFIRMATION,
            current_task=f'{action_type}:preview_ready',
            extracted_entities=memory,
            missing_fields=[],
            active_preview_id=preview_id,
            active_approval_id=None,
        )

    def _build_preview_payload(self, auth: AuthContext, memory: dict[str, object]) -> dict[str, object]:
        action_type = str(memory.get('actionType') or memory.get('intent') or 'workflow')
        entities: list[PreviewEntity] = []
        warnings: list[str] = []

        if action_type == 'transfer_stock':
            memory['executionPayload'] = {
                'sizeId': memory['sizeId'],
                'fromLocationId': memory['fromLocationId'],
                'toLocationId': memory['toLocationId'],
                'quantity': memory['quantity'],
                'reason': memory['reason'],
            }
            entities.extend(
                [
                    PreviewEntity(label='SKU', value=str(memory.get('skuCode', ''))),
                    PreviewEntity(label='Size', value=str(memory.get('sizeLabel', ''))),
                    PreviewEntity(label='From', value=str(memory.get('fromLocationLabel', ''))),
                    PreviewEntity(label='To', value=str(memory.get('toLocationLabel', ''))),
                    PreviewEntity(label='Quantity', value=str(memory.get('quantity', ''))),
                    PreviewEntity(label='Reason', value=str(memory.get('reason', ''))),
                ]
            )
            memory['summary'] = (
                f'Transfer {memory.get("quantity")} units of {memory.get("skuCode")} / {memory.get("sizeLabel")} '
                f'from {memory.get("fromLocationLabel")} to {memory.get("toLocationLabel")}'
            )
        elif action_type in {'adjust_stock', 'receive_stock', 'write_off_stock', 'cycle_count'}:
            memory['executionPayload'] = {
                'sizeId': memory['sizeId'],
                'locationId': memory['locationId'],
                'quantity': memory['quantity'],
                'reason': memory['reason'],
            }
            entities.extend(
                [
                    PreviewEntity(label='SKU', value=str(memory.get('skuCode', ''))),
                    PreviewEntity(label='Size', value=str(memory.get('sizeLabel', ''))),
                    PreviewEntity(label='Location', value=str(memory.get('locationLabel', ''))),
                    PreviewEntity(label='Quantity', value=str(memory.get('quantity', ''))),
                    PreviewEntity(label='Reason', value=str(memory.get('reason', ''))),
                ]
            )
            memory['summary'] = (
                f'{action_type.replace("_", " ").title()} for {memory.get("quantity")} units of '
                f'{memory.get("skuCode")} / {memory.get("sizeLabel")} at {memory.get("locationLabel")}'
            )
            if action_type == 'write_off_stock':
                warnings.append('This write-off will permanently reduce stock.')
        elif action_type == 'create_po':
            memory['executionPayload'] = {
                'supplierId': memory['supplierId'],
                'lines': memory['lines'],
            }
            if memory.get('expectedDate'):
                memory['executionPayload']['expectedDate'] = memory['expectedDate']
            entities.extend(
                [
                    PreviewEntity(label='Supplier', value=str(memory.get('supplierName', ''))),
                    PreviewEntity(label='Line count', value=str(len(memory.get('lines', [])))),
                ]
            )
            if memory.get('expectedDate'):
                entities.insert(1, PreviewEntity(label='Expected date', value=str(memory.get('expectedDate', ''))[:10]))
            memory['summary'] = (
                f'Create PO draft for {memory.get("supplierName")} with {len(memory.get("lines", []))} line(s)'
            )
        elif action_type == 'update_po':
            patch: dict[str, object] = {}
            if memory.get('supplierId'):
                patch['supplierId'] = memory['supplierId']
                entities.append(PreviewEntity(label='Supplier', value=str(memory.get('supplierName', ''))))
            if memory.get('expectedDate'):
                patch['expectedDate'] = memory['expectedDate']
                entities.append(PreviewEntity(label='Expected date', value=str(memory.get('expectedDate', ''))[:10]))
            if memory.get('lines'):
                patch['lines'] = memory['lines']
                entities.append(PreviewEntity(label='Line count', value=str(len(memory.get('lines', [])))))
            memory['executionPayload'] = {'poId': memory['poId'], 'patch': patch}
            entities.insert(0, PreviewEntity(label='PO', value=str(memory.get('poNumber', memory.get('poId', '')))))
            memory['summary'] = f'Update {memory.get("poNumber", memory.get("poId", "PO"))}'
        elif action_type == 'receive_po':
            memory['executionPayload'] = {
                'poId': memory['poId'],
                'locationId': memory['locationId'],
                'lines': memory['lines'],
            }
            entities.extend(
                [
                    PreviewEntity(label='PO', value=str(memory.get('poNumber', memory.get('poId', '')))),
                    PreviewEntity(label='Location', value=str(memory.get('locationLabel', ''))),
                    PreviewEntity(label='Line count', value=str(len(memory.get('lines', [])))),
                ]
            )
            memory['summary'] = (
                f'Receive {len(memory.get("lines", []))} PO line(s) for '
                f'{memory.get("poNumber", memory.get("poId", "PO"))}'
            )
        elif action_type == 'close_po':
            memory['executionPayload'] = {'poId': memory['poId']}
            entities.append(PreviewEntity(label='PO', value=str(memory.get('poNumber', memory.get('poId', '')))))
            memory['summary'] = f'Close {memory.get("poNumber", memory.get("poId", "PO"))}'
            warnings.append('Closing a PO stops further draft edits.')
        elif action_type == 'create_sales_order':
            memory['executionPayload'] = {
                'customerId': memory['customerId'],
                'lines': memory['lines'],
            }
            entities.extend(
                [
                    PreviewEntity(label='Customer', value=str(memory.get('customerName', ''))),
                    PreviewEntity(label='Line count', value=str(len(memory.get('lines', [])))),
                ]
            )
            memory['summary'] = (
                f'Create sales order for {memory.get("customerName")} with {len(memory.get("lines", []))} line(s)'
            )
        elif action_type == 'update_sales_order':
            patch: dict[str, object] = {}
            if memory.get('customerId'):
                patch['customerId'] = memory['customerId']
                entities.append(PreviewEntity(label='Customer', value=str(memory.get('customerName', ''))))
            if memory.get('lines'):
                patch['lines'] = memory['lines']
                entities.append(PreviewEntity(label='Line count', value=str(len(memory.get('lines', [])))))
            memory['executionPayload'] = {'invoiceId': memory['invoiceId'], 'patch': patch}
            entities.insert(
                0,
                PreviewEntity(label='Sales order', value=str(memory.get('invoiceNumber', memory.get('invoiceId', '')))),
            )
            memory['summary'] = f'Update {memory.get("invoiceNumber", memory.get("invoiceId", "sales order"))}'
        elif action_type == 'dispatch_sales_order':
            memory['executionPayload'] = {
                'invoiceId': memory['invoiceId'],
                'locationId': memory['locationId'],
            }
            entities.extend(
                [
                    PreviewEntity(
                        label='Sales order',
                        value=str(memory.get('invoiceNumber', memory.get('invoiceId', ''))),
                    ),
                    PreviewEntity(label='Location', value=str(memory.get('locationLabel', ''))),
                ]
            )
            memory['summary'] = (
                f'Dispatch {memory.get("invoiceNumber", memory.get("invoiceId", "sales order"))} '
                f'from {memory.get("locationLabel")}'
            )
        elif action_type == 'cancel_sales_order':
            memory['executionPayload'] = {'invoiceId': memory['invoiceId']}
            entities.append(
                PreviewEntity(label='Sales order', value=str(memory.get('invoiceNumber', memory.get('invoiceId', ''))))
            )
            memory['summary'] = f'Cancel {memory.get("invoiceNumber", memory.get("invoiceId", "sales order"))}'
            warnings.append('Canceling a sales order stops further processing.')
        elif action_type == 'create_product':
            size_labels = [str(label) for label in memory.get('sizeLabels', [])]
            color_names = [str(label) for label in memory.get('colorNames', [])] or [str(memory.get('colorName', ''))]
            stock_by_size = memory.get('sizeQuantities') if isinstance(memory.get('sizeQuantities'), dict) else {}
            media: list[dict[str, object]] = []
            if memory.get('mediaUrl'):
                media.append(
                    {
                        'url': memory['mediaUrl'],
                        'altText': str(memory.get('name', '')),
                        'sortOrder': 0,
                        'isPrimary': True,
                    }
                )
            memory['executionPayload'] = {
                'product': {
                    'styleCode': memory['styleCode'],
                    'name': memory['name'],
                    'category': memory.get('category', ''),
                    'brand': memory.get('brand', ''),
                    'basePrice': memory['basePrice'],
                    'categoryId': memory.get('categoryId'),
                    'status': memory.get('status', 'active'),
                },
                'styleMedia': media,
                'variants': [],
            }
            for index, color_name in enumerate(color_names):
                variant: dict[str, object] = {
                    'colorName': color_name,
                    'media': media,
                    'sizes': [],
                }
                if memory.get('skuCode') and index == 0:
                    variant['skuCode'] = memory['skuCode']
                for size_label in size_labels:
                    stock_by_location: list[dict[str, object]] = []
                    if memory.get('locationId'):
                        per_size_quantity = stock_by_size.get(size_label)
                        if per_size_quantity is not None:
                            stock_by_location = [
                                {'locationId': memory['locationId'], 'quantity': int(per_size_quantity)}
                            ]
                        elif memory.get('quantity') is not None and len(size_labels) == 1:
                            stock_by_location = [{'locationId': memory['locationId'], 'quantity': memory['quantity']}]
                    variant['sizes'].append(
                        {
                            'sizeLabel': size_label,
                            'stockByLocation': stock_by_location,
                        }
                    )
                memory['executionPayload']['variants'].append(variant)
            entities.extend(
                [
                    PreviewEntity(label='Style code', value=str(memory.get('styleCode', ''))),
                    PreviewEntity(label='Name', value=str(memory.get('name', ''))),
                    PreviewEntity(label='Category', value=str(memory.get('category', ''))),
                    PreviewEntity(label='Variants', value=', '.join(color_names)),
                    PreviewEntity(label='Sizes', value=', '.join(size_labels)),
                ]
            )
            if memory.get('skuCode'):
                entities.insert(4, PreviewEntity(label='SKU', value=str(memory.get('skuCode', ''))))
            if memory.get('locationLabel'):
                stock_summary = (
                    ', '.join(f'{size}:{qty}' for size, qty in stock_by_size.items())
                    if stock_by_size
                    else str(memory.get('quantity', 0))
                )
                entities.append(
                    PreviewEntity(
                        label='Initial stock',
                        value=f'{stock_summary} at {memory.get("locationLabel")}',
                    )
                )
            memory['summary'] = f'Create product {memory.get("styleCode")} / {memory.get("name")}'
        elif action_type == 'update_product':
            operations = self._build_product_update_operations(memory)
            memory['executionPayload'] = operations
            entities.extend(operations['previewEntities'])
            memory['summary'] = f'Update product {memory.get("productName", memory.get("productId", ""))}'
        else:
            memory['executionPayload'] = {}
            warnings.append('The execution payload could not be constructed.')

        preview = {
            'actionType': action_type.replace('_', ' ').title(),
            'actor': auth.email,
            'entities': _serialize_entities(_dedupe_entities(entities)),
            'warnings': warnings,
            'nextStep': 'Confirm to submit this request for approval.',
        }
        return preview

    def _build_product_update_operations(self, memory: dict[str, object]) -> dict[str, object]:
        product_patch: dict[str, object] = {}
        for source, target in (
            ('styleCode', 'styleCode'),
            ('name', 'name'),
            ('category', 'category'),
            ('brand', 'brand'),
            ('basePrice', 'basePrice'),
            ('categoryId', 'categoryId'),
            ('status', 'status'),
            ('pickupEnabled', 'pickupEnabled'),
        ):
            if memory.get(source) is not None:
                product_patch[target] = memory[source]

        preview_entities = [
            PreviewEntity(label='Product', value=str(memory.get('productName', memory.get('productId', ''))))
        ]
        sku_ops: list[dict[str, object]] = []
        size_ops: list[dict[str, object]] = []
        location_ops: list[dict[str, object]] = []

        if memory.get('skuCode') or memory.get('colorName'):
            if memory.get('existingSkuId'):
                sku_ops.append(
                    {
                        'op': 'update',
                        'skuId': memory['existingSkuId'],
                        'payload': {
                            key: value
                            for key, value in {
                                'skuCode': memory.get('skuCode'),
                                'colorName': memory.get('colorName'),
                                'status': memory.get('status'),
                            }.items()
                            if value is not None
                        },
                    }
                )
                preview_entities.append(PreviewEntity(label='SKU update', value=str(memory.get('skuCode', 'existing'))))
            else:
                sku_ops.append(
                    {
                        'op': 'create',
                        'payload': {
                            'skuCode': memory['skuCode'],
                            'colorName': memory.get('colorName', 'Default'),
                            'status': memory.get('status', 'active'),
                        },
                    }
                )
                preview_entities.append(PreviewEntity(label='SKU create', value=str(memory.get('skuCode', 'new'))))

        if memory.get('sizeLabels'):
            size_label = str(memory['sizeLabels'][0])
            size_payload = {
                'sizeLabel': size_label,
                'barcode': str(memory.get('barcode') or f'AUTO-{size_label}'),
                'unitOfMeasure': 'unit',
                'packSize': 1,
                'status': memory.get('status', 'active'),
            }
            if memory.get('existingSizeId'):
                size_ops.append({'op': 'update', 'sizeId': memory['existingSizeId'], 'payload': size_payload})
                preview_entities.append(PreviewEntity(label='Size update', value=size_label))
            else:
                size_ops.append({'op': 'create', 'skuCode': memory.get('skuCode'), 'payload': size_payload})
                preview_entities.append(PreviewEntity(label='Size create', value=size_label))

        if memory.get('locationId'):
            location_ops.append(
                {
                    'payload': {
                        'locationId': memory['locationId'],
                        'isEnabled': True,
                        'pickupEnabled': bool(memory.get('pickupEnabled', False)),
                    }
                }
            )
            preview_entities.append(PreviewEntity(label='Location', value=str(memory.get('locationLabel', ''))))

        return {
            'productId': memory['productId'],
            'productPatch': product_patch,
            'skuOps': sku_ops,
            'sizeOps': size_ops,
            'locationOps': location_ops,
            'previewEntities': _serialize_entities(_dedupe_entities(preview_entities)),
        }

    async def _execute_action(
        self,
        auth: AuthContext,
        action_type: str,
        tool_name: str,
        payload: dict[str, object],
        approval_id: UUID | None,
        access_token_override: str | None = None,
    ) -> dict[str, object] | Exception:
        try:
            access_token = access_token_override or auth.access_token or ''
            await self._audit(
                auth,
                event_type='tool_call',
                payload={'toolName': tool_name, 'actionType': action_type, 'payload': payload},
            )
            if action_type == 'transfer_stock':
                return await self._backend_client.transfer_stock(
                    access_token,
                    auth.tenant_id,
                    {**payload, 'confirm': True, 'approvalId': str(approval_id) if approval_id else None},
                )
            if action_type == 'adjust_stock':
                return await self._backend_client.adjust_stock(
                    access_token,
                    auth.tenant_id,
                    {**payload, 'confirm': True, 'approvalId': str(approval_id) if approval_id else None},
                )
            if action_type == 'receive_stock':
                return await self._backend_client.receive_stock(
                    access_token,
                    auth.tenant_id,
                    {**payload, 'confirm': True, 'approvalId': str(approval_id) if approval_id else None},
                )
            if action_type == 'write_off_stock':
                return await self._backend_client.write_off_stock(
                    access_token,
                    auth.tenant_id,
                    {**payload, 'confirm': True, 'approvalId': str(approval_id) if approval_id else None},
                )
            if action_type == 'cycle_count':
                return await self._backend_client.cycle_count(
                    access_token,
                    auth.tenant_id,
                    {**payload, 'confirm': True, 'approvalId': str(approval_id) if approval_id else None},
                )
            if action_type == 'create_po':
                return await self._backend_client.create_po(access_token, auth.tenant_id, payload)
            if action_type == 'update_po':
                return await self._backend_client.update_po(
                    access_token,
                    auth.tenant_id,
                    str(payload['poId']),
                    dict(payload.get('patch') or {}),
                )
            if action_type == 'receive_po':
                return await self._backend_client.receive_po(
                    access_token,
                    auth.tenant_id,
                    str(payload['poId']),
                    {
                        'locationId': payload['locationId'],
                        'lines': payload['lines'],
                        'confirm': True,
                    },
                )
            if action_type == 'close_po':
                return await self._backend_client.close_po(
                    access_token,
                    auth.tenant_id,
                    str(payload['poId']),
                )
            if action_type == 'create_sales_order':
                return await self._backend_client.create_invoice(access_token, auth.tenant_id, payload)
            if action_type == 'update_sales_order':
                return await self._backend_client.update_invoice(
                    access_token,
                    auth.tenant_id,
                    str(payload['invoiceId']),
                    dict(payload.get('patch') or {}),
                )
            if action_type == 'dispatch_sales_order':
                return await self._backend_client.dispatch_invoice(
                    access_token,
                    auth.tenant_id,
                    str(payload['invoiceId']),
                    {
                        'locationId': payload['locationId'],
                        'confirm': True,
                    },
                )
            if action_type == 'cancel_sales_order':
                return await self._backend_client.cancel_invoice(
                    access_token,
                    auth.tenant_id,
                    str(payload['invoiceId']),
                )
            if action_type == 'create_product':
                return await self._backend_client.create_product(access_token, auth.tenant_id, payload)
            if action_type == 'update_product':
                return await self._execute_product_update(auth, payload, access_token=access_token)
            raise RuntimeError(f'Unsupported action type: {action_type}')
        except Exception as exc:  # pragma: no cover - exercised in integration flows
            return exc

    async def _execute_product_update(
        self,
        auth: AuthContext,
        payload: dict[str, object],
        *,
        access_token: str,
    ) -> dict[str, object]:
        product_id = str(payload['productId'])
        result: dict[str, object] = {'productId': product_id, 'operations': []}

        product_patch = payload.get('productPatch')
        if isinstance(product_patch, dict) and product_patch:
            updated = await self._backend_client.update_product(
                access_token,
                auth.tenant_id,
                product_id,
                product_patch,
            )
            result['operations'].append({'type': 'product', 'result': updated})

        sku_code_to_id: dict[str, str] = {}
        product_detail = await self._backend_client.get_product(access_token, auth.tenant_id, product_id)
        for sku in product_detail.get('skus', []):
            if isinstance(sku, dict) and sku.get('sku_code'):
                sku_code_to_id[str(sku['sku_code'])] = str(sku['id'])

        for operation in payload.get('skuOps', []):
            if not isinstance(operation, dict):
                continue
            op = operation.get('op')
            op_payload = dict(operation.get('payload') or {})
            if op == 'update' and operation.get('skuId'):
                updated = await self._backend_client.update_sku(
                    access_token,
                    auth.tenant_id,
                    str(operation['skuId']),
                    op_payload,
                )
                result['operations'].append({'type': 'sku', 'result': updated})
                if updated.get('sku_code'):
                    sku_code_to_id[str(updated['sku_code'])] = str(updated['id'])
            elif op == 'create':
                created = await self._backend_client.create_sku(
                    access_token,
                    auth.tenant_id,
                    product_id,
                    op_payload,
                )
                result['operations'].append({'type': 'sku', 'result': created})
                if created.get('sku_code'):
                    sku_code_to_id[str(created['sku_code'])] = str(created['id'])

        for operation in payload.get('sizeOps', []):
            if not isinstance(operation, dict):
                continue
            op = operation.get('op')
            op_payload = dict(operation.get('payload') or {})
            if op == 'update' and operation.get('sizeId'):
                updated = await self._backend_client.update_sku_size(
                    access_token,
                    auth.tenant_id,
                    str(operation['sizeId']),
                    op_payload,
                )
                result['operations'].append({'type': 'size', 'result': updated})
            elif op == 'create':
                sku_code = str(operation.get('skuCode') or '')
                sku_id = sku_code_to_id.get(sku_code)
                if not sku_id:
                    continue
                created = await self._backend_client.create_sku_size(
                    access_token,
                    auth.tenant_id,
                    sku_id,
                    op_payload,
                )
                result['operations'].append({'type': 'size', 'result': created})

        for operation in payload.get('locationOps', []):
            if not isinstance(operation, dict):
                continue
            created = await self._backend_client.upsert_product_location(
                access_token,
                auth.tenant_id,
                product_id,
                dict(operation.get('payload') or {}),
            )
            result['operations'].append({'type': 'location', 'result': created})

        return result

    def _execution_outcome(
        self,
        *,
        auth: AuthContext,
        conversation: ConversationDetail,
        workflow: WorkflowState,
        action_type: str,
        memory: dict[str, object],
        execution_result: dict[str, object] | Exception,
        approval: ApprovalRequestStatus | None = None,
    ) -> OrchestratorOutcome:
        memory.pop('_pendingActions', None)
        memory.pop('_pendingPrompt', None)
        memory.pop('requesterAccessToken', None)

        approval_id = approval.id if approval else None
        if isinstance(execution_result, Exception):
            blocks: list[MessageBlock] = []
            if approval_id:
                blocks.append(
                    ApprovalResultBlock(
                        approval_id=approval_id,
                        status='approved',
                        message='Approval granted. Execution was attempted.',
                    )
                )
            blocks.append(
                ErrorBlock(
                    title='Execution failed',
                    message=str(execution_result),
                )
            )
            return OrchestratorOutcome(
                blocks=blocks,
                status=WorkflowStatus.FAILED,
                current_task=f'{action_type}:execution_failed',
                extracted_entities=memory,
                missing_fields=[],
                active_preview_id=workflow.active_preview_id,
                active_approval_id=approval_id,
            )

        result_id = (
            execution_result.get('id') or execution_result.get('receiptId') or execution_result.get('transactionId')
        )
        message = (
            f'{action_type.replace("_", " ").title()} completed successfully.'
            if not result_id
            else f'{action_type.replace("_", " ").title()} completed successfully. Result: {result_id}.'
        )
        blocks = []
        if approval_id:
            blocks.append(
                ApprovalResultBlock(
                    approval_id=approval_id,
                    status='approved',
                    message='Approval granted and execution completed.',
                )
            )
        blocks.append(
            SuccessBlock(
                title='Execution complete',
                message=message,
            )
        )
        return OrchestratorOutcome(
            blocks=blocks,
            status=WorkflowStatus.COMPLETED,
            current_task=f'{action_type}:completed',
            extracted_entities=memory,
            missing_fields=[],
            active_preview_id=workflow.active_preview_id,
            active_approval_id=approval_id,
        )

    def _extract_sku_code(self, message: str) -> str | None:
        if sku_match := re.search(r'sku\s+([A-Za-z0-9-]+)', message, re.IGNORECASE):
            return sku_match.group(1).strip().upper()
        if pair_match := re.search(r'([A-Za-z0-9-]+)\s*/\s*([A-Za-z0-9]+)', message):
            return pair_match.group(1).strip().upper()
        return None

    def _extract_size_label(self, message: str) -> str | None:
        if pair_match := re.search(r'([A-Za-z0-9-]+)\s*/\s*([A-Za-z0-9]+)', message):
            return pair_match.group(2).strip().upper()
        labels = _parse_size_labels(message)
        return labels[0] if labels else None

    def _extract_reason(self, message: str) -> str | None:
        if match := re.search(r'reason\s+(.*)', message, re.IGNORECASE):
            return match.group(1).strip().strip('.')
        normalized = _normalize(message)
        if 'damaged' in normalized:
            return 'damaged stock'
        if 'cycle count' in normalized:
            return 'cycle count'
        return None

    async def _match_location(
        self,
        auth: AuthContext,
        message: str,
        *,
        qualifier: str | None = None,
    ) -> dict[str, str] | None:
        text = message
        if qualifier:
            qualifier_match = re.search(rf'{qualifier}\s+([A-Za-z0-9 \-]+)', message, re.IGNORECASE)
            if qualifier_match:
                text = qualifier_match.group(1)
        locations = await self._backend_client.list_locations(auth.access_token or '', auth.tenant_id)
        target = _normalize(text)
        target_tokens = _normalized_tokens(text)
        for location in locations:
            name = str(location.get('name') or '')
            code = str(location.get('code') or '')
            normalized_name = _normalize(name)
            normalized_code = _normalize(code)
            name_tokens = _normalized_tokens(name)
            code_tokens = _normalized_tokens(code)
            if (
                normalized_name in target
                or normalized_code in target
                or target in normalized_name
                or target in normalized_code
                or bool(target_tokens & name_tokens)
                or bool(target_tokens & code_tokens)
            ):
                return {'id': str(location['id']), 'label': f'{name} ({code})'}
        return None

    async def _match_supplier(self, auth: AuthContext, message: str) -> dict[str, str] | None:
        suppliers = await self._backend_client.list_suppliers(auth.access_token or '', auth.tenant_id)
        target = _normalize(message)
        for supplier in suppliers:
            name = str(supplier.get('name') or '')
            if _normalize(name) in target:
                return {'id': str(supplier['id']), 'label': name}
        return None

    async def _match_customer(self, auth: AuthContext, message: str) -> dict[str, str] | None:
        customers = await self._backend_client.list_customers(auth.access_token or '', auth.tenant_id)
        target = _normalize(message)
        for customer in customers:
            name = str(customer.get('name') or '')
            if _normalize(name) in target:
                return {'id': str(customer['id']), 'label': name}
        return None

    async def _match_category(self, auth: AuthContext, message: str) -> dict[str, str] | None:
        categories = await self._backend_client.list_categories(auth.access_token or '', auth.tenant_id)
        target = _normalize(message)
        for category in categories:
            name = str(category.get('name') or '')
            if _normalize(name) in target:
                return {'id': str(category['id']), 'label': name}
        return None

    async def _match_po(self, auth: AuthContext, message: str) -> dict[str, str] | None:
        uuid_value = _parse_uuid(message)
        if uuid_value:
            return {'id': uuid_value, 'number': uuid_value[:8]}

        payload = await self._backend_client.list_pos(auth.access_token or '', auth.tenant_id, params={'pageSize': 50})
        items = payload.get('items', []) if isinstance(payload, dict) else []
        target = _normalize(message)
        for item in items:
            if not isinstance(item, dict):
                continue
            number = str(item.get('number') or '')
            supplier_name = str(item.get('supplierName') or '')
            identifier = str(item.get('id') or '')
            if _normalize(number) in target or identifier[:8].lower() in target or _normalize(supplier_name) in target:
                return {'id': identifier, 'number': number or identifier[:8]}
        return None

    async def _match_product(self, auth: AuthContext, message: str) -> dict[str, str] | None:
        uuid_value = _parse_uuid(message)
        if uuid_value:
            product = await self._backend_client.get_product(auth.access_token or '', auth.tenant_id, uuid_value)
            product_name = str(product.get('product', {}).get('name') or uuid_value)
            return {'id': uuid_value, 'label': product_name}

        products = await self._backend_client.list_products(auth.access_token or '', auth.tenant_id)
        target = _normalize(message)
        for product in products:
            if not isinstance(product, dict):
                continue
            name = str(product.get('name') or '')
            style_code = str(product.get('style_code') or product.get('styleCode') or '')
            if _normalize(name) in target or _normalize(style_code) in target:
                return {'id': str(product['id']), 'label': f'{name} ({style_code})'.strip()}
        return None

    async def _match_invoice(self, auth: AuthContext, message: str) -> dict[str, str] | None:
        uuid_value = _parse_uuid(message)
        if uuid_value:
            return {'id': uuid_value, 'number': f'SO-{uuid_value[:8].upper()}'}

        payload = await self._backend_client.list_invoices(
            auth.access_token or '',
            auth.tenant_id,
            params={'pageSize': 50},
        )
        items = payload.get('items', []) if isinstance(payload, dict) else []
        target = _normalize(message)
        for item in items:
            if not isinstance(item, dict):
                continue
            number = str(item.get('number') or '')
            customer_name = str(item.get('customerName') or '')
            identifier = str(item.get('id') or '')
            if _normalize(number) in target or identifier[:8].lower() in target or _normalize(customer_name) in target:
                return {'id': identifier, 'number': number or f'SO-{identifier[:8].upper()}'}
        return None

    async def _resolve_size_reference(
        self,
        auth: AuthContext,
        *,
        sku_code: str,
        size_label: str,
    ) -> dict[str, object] | None:
        if not sku_code or not size_label:
            return None
        sku_matches = await self._backend_client.search_skus(auth.access_token or '', auth.tenant_id, sku_code)
        exact = None
        for candidate in sku_matches:
            code = str(candidate.get('sku_code') or '')
            if code.upper() == sku_code.upper():
                exact = candidate
                break
        candidate = exact or (sku_matches[0] if sku_matches else None)
        if not isinstance(candidate, dict):
            return None

        product = await self._backend_client.get_product(
            auth.access_token or '',
            auth.tenant_id,
            str(candidate['product_id']),
        )
        skus = product.get('skus', []) if isinstance(product, dict) else []
        sizes = product.get('sizes', []) if isinstance(product, dict) else []

        existing_sku_id: str | None = None
        for sku in skus:
            if not isinstance(sku, dict):
                continue
            if str(sku.get('sku_code') or '').upper() == sku_code.upper():
                existing_sku_id = str(sku['id'])
                break

        for size in sizes:
            if not isinstance(size, dict):
                continue
            if existing_sku_id and str(size.get('sku_id')) != existing_sku_id:
                continue
            if str(size.get('size_label') or '').upper() != size_label.upper():
                continue
            return {
                'sizeId': str(size['id']),
                'sizeLabel': str(size['size_label']),
                'skuCode': sku_code.upper(),
                'existingSkuId': existing_sku_id,
                'existingSizeId': str(size['id']),
            }
        return {
            'skuCode': sku_code.upper(),
            'sizeLabel': size_label.upper(),
            'existingSkuId': existing_sku_id,
        }

    async def _parse_po_lines(
        self,
        auth: AuthContext,
        message: str,
        *,
        po_id: str,
        allow_missing_cost: bool,
    ) -> list[dict[str, object]]:
        segments = [segment.strip() for segment in re.split(r'[,\n;]+', message) if segment.strip()]
        if not segments:
            return []

        po_cost_map: dict[tuple[str, str], int] = {}
        if allow_missing_cost and po_id:
            po_detail = await self._backend_client.get_po(auth.access_token or '', auth.tenant_id, po_id)
            for line in po_detail.get('lines', []):
                if not isinstance(line, dict):
                    continue
                sku = str(line.get('sku') or '')
                if '-' not in sku:
                    continue
                sku_code, size_label = sku.rsplit('-', 1)
                po_cost_map[(sku_code.upper(), size_label.upper())] = int(line.get('unitCost') or 0)

        lines: list[dict[str, object]] = []
        pattern = re.compile(
            r'(?P<sku>[A-Za-z0-9-]+)\s*/\s*(?P<size>[A-Za-z0-9]+)\s*x(?P<qty>\d+)(?:\s*@(?P<cost>\d+))?',
            re.IGNORECASE,
        )
        for segment in segments:
            match = pattern.search(segment)
            if not match:
                continue
            size_ref = await self._resolve_size_reference(
                auth,
                sku_code=match.group('sku').upper(),
                size_label=match.group('size').upper(),
            )
            if not size_ref or not size_ref.get('sizeId'):
                continue
            cost = match.group('cost')
            if cost is None and allow_missing_cost:
                cost = str(po_cost_map.get((match.group('sku').upper(), match.group('size').upper()), 0))
            if cost is None:
                continue
            lines.append(
                {
                    'sizeId': size_ref['sizeId'],
                    'qty': int(match.group('qty')),
                    'unitCost': int(cost),
                }
            )
        return lines

    async def _parse_sales_lines(
        self,
        auth: AuthContext,
        message: str,
        *,
        invoice_id: str,
    ) -> list[dict[str, object]]:
        del invoice_id
        segments = [segment.strip() for segment in re.split(r'[,\n;]+', message) if segment.strip()]
        if not segments:
            return []

        lines: list[dict[str, object]] = []
        pattern = re.compile(
            r'(?P<sku>[A-Za-z0-9-]+)\s*/\s*(?P<size>[A-Za-z0-9]+)\s*x(?P<qty>\d+)(?:\s*@(?P<price>\d+))?',
            re.IGNORECASE,
        )
        for segment in segments:
            match = pattern.search(segment)
            if not match or match.group('price') is None:
                continue
            size_ref = await self._resolve_size_reference(
                auth,
                sku_code=match.group('sku').upper(),
                size_label=match.group('size').upper(),
            )
            if not size_ref or not size_ref.get('sizeId'):
                continue
            lines.append(
                {
                    'sizeId': size_ref['sizeId'],
                    'qty': int(match.group('qty')),
                    'unitPrice': int(match.group('price')),
                }
            )
        return lines

    def _has_product_changes(self, memory: dict[str, object]) -> bool:
        return any(
            memory.get(key) is not None
            for key in (
                'styleCode',
                'name',
                'category',
                'brand',
                'basePrice',
                'skuCode',
                'colorName',
                'sizeLabels',
                'locationId',
                'status',
            )
        )

    def _has_po_changes(self, memory: dict[str, object]) -> bool:
        return any(memory.get(key) is not None for key in ('supplierId', 'expectedDate', 'lines'))

    def _has_so_changes(self, memory: dict[str, object]) -> bool:
        return any(memory.get(key) is not None for key in ('customerId', 'lines'))

    @staticmethod
    def _json_safe_row(row: dict[str, Any]) -> dict[str, object]:
        safe: dict[str, object] = {}
        for key, value in row.items():
            if isinstance(value, datetime):
                safe[key] = value.astimezone(UTC).isoformat()
            else:
                safe[key] = value
        return safe

    async def _audit(
        self,
        auth: AuthContext,
        *,
        event_type: str,
        payload: dict[str, object],
        conversation_id: str | None = None,
        workflow_id: str | None = None,
        approval_request_id: str | None = None,
    ) -> None:
        try:
            await self._backend_client.record_audit_event(
                access_token=auth.access_token or '',
                tenant_id=auth.tenant_id,
                payload={
                    'conversationId': conversation_id,
                    'workflowId': workflow_id,
                    'approvalRequestId': approval_request_id,
                    'eventType': event_type,
                    'payload': payload,
                },
            )
        except Exception:
            return
