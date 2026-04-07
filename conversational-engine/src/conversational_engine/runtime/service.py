from __future__ import annotations

from collections.abc import Callable
from dataclasses import asdict
import logging
from uuid import UUID

from conversational_engine.agents.executor import ExecutorAgent
from conversational_engine.agents.narrator import NarratorAgent
from conversational_engine.agents.planner import PlannerAgent
from conversational_engine.agents.reviewer import ReviewerAgent
from conversational_engine.clients.backend import BackendClient
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import PendingActionType, WorkflowStatus
from conversational_engine.memory.layered import LayeredMemoryService
from conversational_engine.runtime.contracts import RuntimeOutcome
from conversational_engine.runtime.renderer import (
    render_approval_pending,
    render_clarification,
    render_confirmation_required,
    render_failure,
    render_tool_result,
)
from conversational_engine.tools.catalog import SemanticToolCatalog
from conversational_engine.training.service import TrainingDataService

EventSink = Callable[[str, dict[str, object]], None]
logger = logging.getLogger(__name__)


class AgentRuntimeService:
    def __init__(
        self,
        *,
        backend_client: BackendClient,
        planner: PlannerAgent,
        executor: ExecutorAgent,
        reviewer: ReviewerAgent,
        narrator: NarratorAgent,
        memory_service: LayeredMemoryService,
        training_data_service: TrainingDataService,
    ) -> None:
        self._backend_client = backend_client
        self._planner = planner
        self._executor = executor
        self._reviewer = reviewer
        self._narrator = narrator
        self._memory_service = memory_service
        self._training_data_service = training_data_service

    async def execute(
        self,
        *,
        auth: AuthContext,
        conversation_id: UUID,
        workflow_id: UUID,
        user_message: str,
        extracted_entities: dict[str, object],
        recent_messages: list[dict[str, object]],
        emit: EventSink,
        run_id: UUID,
    ) -> RuntimeOutcome:
        tool_history: list[dict[str, object]] = []
        catalog = SemanticToolCatalog(backend=self._backend_client, auth=auth)
        memory = self._memory_service.build(
            auth=auth,
            workflow_id=str(workflow_id),
            conversation_id=str(conversation_id),
            recent_messages=recent_messages,
            extracted_entities=extracted_entities,
        )

        try:
            for iteration in range(3):
                def record_trace(agent_role: str, current_iteration: int):
                    def _record(_role: str, trace) -> None:
                        payload = {
                            'attempts': [asdict(attempt) for attempt in trace.attempts],
                            'response': trace.response.raw_payload if trace.response else {},
                        }
                        provider_name = trace.response.provider_name if trace.response else 'unavailable'
                        model_name = trace.response.model_name if trace.response else 'unavailable'
                        self._training_data_service.record_trace(
                            tenant_id=auth.tenant_id,
                            run_id=run_id,
                            agent_role=agent_role,
                            provider_name=provider_name,
                            model_name=model_name,
                            stage=f'{agent_role}_iteration_{current_iteration + 1}',
                            payload=payload,
                        )
                    return _record

                plan = await self._planner.plan(
                    user_message=user_message,
                    memory={
                        'session': memory.session_memory,
                        'workflow': memory.workflow_memory,
                        'tenant': memory.tenant_memory,
                    },
                    tools=catalog.schema_catalog(),
                    history=tool_history,
                    trace_callback=record_trace('planner', iteration),
                )
                emit(
                    'plan.updated',
                    {
                        'iteration': iteration + 1,
                        'goal': plan.get('goal'),
                        'action': plan.get('action'),
                        'reasoning': plan.get('reasoning'),
                    },
                )

                if plan.get('action') == 'clarify':
                    question = await self._narrator.write_message(
                        user_message=user_message,
                        directive=str(plan.get('clarificationQuestion') or 'Please clarify your request.'),
                        supporting_context={
                            'requiredInputs': plan.get('requiredInputs') or [],
                            'goal': plan.get('goal'),
                        },
                        trace_callback=record_trace('narrator', iteration),
                    )
                    required = [str(item) for item in plan.get('requiredInputs') or []]
                    emit('assistant.message.delta', {'content': question})
                    return RuntimeOutcome(
                        blocks=render_clarification(question, required),
                        status=WorkflowStatus.NEEDS_INPUT,
                        current_task='clarification_requested',
                        extracted_entities=extracted_entities,
                        missing_fields=required,
                    )

                if plan.get('action') == 'respond':
                    response_text = await self._narrator.write_message(
                        user_message=user_message,
                        directive=str(plan.get('goal') or 'The request is complete.'),
                        supporting_context={'reasoning': plan.get('reasoning')},
                        trace_callback=record_trace('narrator', iteration),
                    )
                    emit('assistant.message.delta', {'content': response_text})
                    return RuntimeOutcome(
                        blocks=render_tool_result(response_text, 'assistant.response', {}),
                        status=WorkflowStatus.COMPLETED,
                        current_task='response_completed',
                        extracted_entities=extracted_entities,
                    )

                proposal = await self._executor.propose(
                    user_message=user_message,
                    plan=plan,
                    tools=catalog.schema_catalog(),
                    history=tool_history,
                    trace_callback=record_trace('executor', iteration),
                )
                emit(
                    'agent.selected',
                    {
                        'role': 'executor',
                        'action': proposal.get('action'),
                        'toolName': proposal.get('toolName'),
                    },
                )

                if proposal.get('action') == 'clarify':
                    question = await self._narrator.write_message(
                        user_message=user_message,
                        directive=str(proposal.get('assistantMessage') or 'Please clarify your request.'),
                        supporting_context={
                            'requiredInputs': proposal.get('requiredInputs') or [],
                            'plan': plan,
                        },
                        trace_callback=record_trace('narrator', iteration),
                    )
                    required = [str(item) for item in proposal.get('requiredInputs') or []]
                    emit('assistant.message.delta', {'content': question})
                    return RuntimeOutcome(
                        blocks=render_clarification(question, required),
                        status=WorkflowStatus.NEEDS_INPUT,
                        current_task='clarification_requested',
                        extracted_entities=extracted_entities,
                        missing_fields=required,
                    )

                if proposal.get('action') == 'respond':
                    response_text = await self._narrator.write_message(
                        user_message=user_message,
                        directive=str(proposal.get('assistantMessage') or 'The request is complete.'),
                        supporting_context={'plan': plan},
                        trace_callback=record_trace('narrator', iteration),
                    )
                    emit('assistant.message.delta', {'content': response_text})
                    return RuntimeOutcome(
                        blocks=render_tool_result(response_text, 'assistant.response', {}),
                        status=WorkflowStatus.COMPLETED,
                        current_task='response_completed',
                        extracted_entities=extracted_entities,
                    )

                tool_name = str(proposal.get('toolName') or '')
                tool_arguments = proposal.get('toolArguments')
                if not tool_name or not isinstance(tool_arguments, dict):
                    return RuntimeOutcome(
                        blocks=render_failure('The AI runtime could not construct a valid tool call.'),
                        status=WorkflowStatus.FAILED,
                        current_task='tool_call_invalid',
                        extracted_entities=extracted_entities,
                    )

                emit('tool.called', {'toolName': tool_name, 'arguments': tool_arguments})
                tool = catalog.get(tool_name)
                if tool is None:
                    return RuntimeOutcome(
                        blocks=render_failure(f'Unknown tool selected by AI runtime: {tool_name}'),
                        status=WorkflowStatus.FAILED,
                        current_task='tool_unknown',
                        extracted_entities=extracted_entities,
                    )

                if tool.side_effect:
                    active_approval_id = extracted_entities.get('activeApprovalId')
                    has_pending_approval = (
                        isinstance(active_approval_id, str)
                        and bool(active_approval_id)
                        and extracted_entities.get('activeApprovalStatus') == 'pending'
                    )
                    quantity = tool_arguments.get('quantity')
                    evaluation = await self._backend_client.evaluate_approval(
                        access_token=auth.access_token or '',
                        tenant_id=auth.tenant_id,
                        action_type=tool_name,
                        quantity=int(quantity) if isinstance(quantity, int) else None,
                    )
                    if evaluation.requires_approval and has_pending_approval:
                        confirmation_prompt = (
                            'Review these updated details and confirm. The pending approval request will be updated.'
                        )
                    elif evaluation.requires_approval:
                        confirmation_prompt = (
                            'Review these details and confirm. The request will then be submitted for approval.'
                        )
                    else:
                        confirmation_prompt = 'Review these details and confirm to continue.'
                    message = await self._narrator.write_message(
                        user_message=user_message,
                        directive=str(
                            proposal.get('assistantMessage')
                            or f'Prepared {tool_name.replace(".", " ")}. Review the details before continuing.'
                        ),
                        supporting_context={
                            'toolName': tool_name,
                            'toolArguments': tool_arguments,
                            'approvalReason': evaluation.reason,
                            'requiresApproval': evaluation.requires_approval,
                            'approvalOperation': 'update_existing' if has_pending_approval else 'create_new',
                        },
                        trace_callback=record_trace('narrator', iteration),
                    )
                    emit('assistant.message.delta', {'content': message})
                    next_entities = {
                        **extracted_entities,
                        '_workflowEngine': 'runtime',
                        '_pendingActions': [
                            PendingActionType.CONFIRM.value,
                            PendingActionType.CANCEL.value,
                            PendingActionType.EDIT.value,
                        ],
                        '_pendingPrompt': confirmation_prompt,
                        'toolName': tool_name,
                        'executionPayload': tool_arguments,
                        'preview': {'tool': tool_name, 'arguments': tool_arguments},
                        'approvalRequired': evaluation.requires_approval,
                        'approvalReason': evaluation.reason,
                        'summary': str(plan.get('goal') or proposal.get('assistantMessage') or tool_name),
                        'activeApprovalId': active_approval_id if has_pending_approval else None,
                        'activeApprovalStatus': 'pending' if has_pending_approval else None,
                        '_approvalOperation': 'update_existing' if has_pending_approval else 'create_new',
                    }
                    if has_pending_approval:
                        next_entities['_pendingApprovalUpdateOriginal'] = {
                            'toolName': extracted_entities.get('toolName'),
                            'executionPayload': extracted_entities.get('executionPayload')
                            if isinstance(extracted_entities.get('executionPayload'), dict)
                            else {},
                            'preview': extracted_entities.get('preview')
                            if isinstance(extracted_entities.get('preview'), dict)
                            else {},
                            'summary': extracted_entities.get('summary'),
                        }
                    else:
                        next_entities.pop('_pendingApprovalUpdateOriginal', None)
                    return RuntimeOutcome(
                        blocks=render_confirmation_required(
                            message=message,
                            tool_name=tool_name,
                            tool_arguments=tool_arguments,
                            approval_required=evaluation.requires_approval,
                            confirmation_prompt=confirmation_prompt,
                        ),
                        status=WorkflowStatus.AWAITING_CONFIRMATION,
                        current_task='awaiting_confirmation',
                        extracted_entities=next_entities,
                    )

                tool_result = await catalog.invoke(tool_name, tool_arguments)
                emit('tool.result', {'toolName': tool_name, 'result': tool_result})

                review = await self._reviewer.review(
                    user_message=user_message,
                    plan=plan,
                    proposal=proposal,
                    tool_result=tool_result,
                    history=tool_history,
                    trace_callback=record_trace('reviewer', iteration),
                )
                emit('review.passed', {'action': review.get('action'), 'feedback': review.get('feedback')})

                tool_history.append({'plan': plan, 'proposal': proposal, 'toolResult': tool_result, 'review': review})

                if review.get('action') == 'clarify':
                    question = await self._narrator.write_message(
                        user_message=user_message,
                        directive=str(review.get('assistantMessage') or 'Please clarify your request.'),
                        supporting_context={'requiredInputs': review.get('requiredInputs') or []},
                        trace_callback=record_trace('narrator', iteration),
                    )
                    required = [str(item) for item in review.get('requiredInputs') or []]
                    emit('assistant.message.delta', {'content': question})
                    return RuntimeOutcome(
                        blocks=render_clarification(question, required),
                        status=WorkflowStatus.NEEDS_INPUT,
                        current_task='clarification_requested',
                        extracted_entities=extracted_entities,
                        missing_fields=required,
                    )

                if review.get('action') == 'complete':
                    message = await self._narrator.write_message(
                        user_message=user_message,
                        directive=str(review.get('assistantMessage') or proposal.get('assistantMessage') or 'Done.'),
                        supporting_context={
                            'toolName': tool_name,
                            'toolResult': tool_result,
                        },
                        trace_callback=record_trace('narrator', iteration),
                    )
                    emit('assistant.message.delta', {'content': message})
                    return RuntimeOutcome(
                        blocks=render_tool_result(message, tool_name, tool_result),
                        status=WorkflowStatus.COMPLETED,
                        current_task='completed',
                        extracted_entities={
                            **extracted_entities,
                            'lastToolName': tool_name,
                        },
                    )

            return RuntimeOutcome(
                blocks=render_failure('The AI runtime reached its planning limit before completing the task.'),
                status=WorkflowStatus.FAILED,
                current_task='iteration_limit_reached',
                extracted_entities=extracted_entities,
            )
        except Exception:
            logger.exception('AI runtime failed for conversation %s workflow %s', conversation_id, workflow_id)
            return RuntimeOutcome(
                blocks=render_failure('The AI runtime could not complete this request.'),
                status=WorkflowStatus.FAILED,
                current_task='runtime_error',
                extracted_entities=extracted_entities,
            )
