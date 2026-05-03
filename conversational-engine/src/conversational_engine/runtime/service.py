from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import asdict
import logging
import re
from time import perf_counter
from uuid import UUID

from conversational_engine.agents.executor import ExecutorAgent
from conversational_engine.agents.narrator import NarratorAgent
from conversational_engine.agents.planner import PlannerAgent
from conversational_engine.agents.reviewer import ReviewerAgent
from conversational_engine.agents.state_updater import StateUpdateAgent
from conversational_engine.clients.backend import BackendClient, BackendValidationError
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import PendingActionType, TextBlock, WorkflowStatus
from conversational_engine.memory.layered import LayeredMemoryService
from conversational_engine.retrieval.service import RetrievalService
from conversational_engine.runtime.contracts import RuntimeOutcome
from conversational_engine.runtime.renderer import (
    render_clarification,
    render_confirmation_required,
    render_failure,
    render_navigation_blocks,
    render_tool_result,
)
from conversational_engine.runtime.state_update import (
    ROUTE_NAVIGATION,
    RuntimeStateUpdate,
    apply_task_context,
    build_post_action_blocks,
    increment_clarification_count,
    mark_task_status,
    resolve_state_update,
    task_context_from_entities,
)
from conversational_engine.tools.catalog import SemanticToolCatalog
from conversational_engine.tools.catalog.utils import ToolPreparationError
from conversational_engine.tools.validation import ToolSchemaValidationError
from conversational_engine.training.service import TrainingDataService

EventSink = Callable[[str, dict[str, object]], None]
logger = logging.getLogger(__name__)


def _estimate_tokens(text: str) -> int:
    return max(1, (len(text.strip()) + 3) // 4)


class AgentRuntimeService:
    def __init__(
        self,
        *,
        backend_client: BackendClient,
        planner: PlannerAgent,
        executor: ExecutorAgent,
        reviewer: ReviewerAgent,
        narrator: NarratorAgent,
        state_updater: StateUpdateAgent | None = None,
        memory_service: LayeredMemoryService,
        training_data_service: TrainingDataService,
        retrieval_service: RetrievalService,
    ) -> None:
        self._backend_client = backend_client
        self._planner = planner
        self._executor = executor
        self._reviewer = reviewer
        self._state_updater = state_updater
        self._narrator = narrator
        self._memory_service = memory_service
        self._training_data_service = training_data_service
        self._retrieval_service = retrieval_service

    async def execute(
        self,
        *,
        auth: AuthContext,
        conversation_id: UUID,
        workflow_id: UUID,
        user_message: str,
        extracted_entities: dict[str, object],
        recent_messages: list[dict[str, object]],
        workflow_status: WorkflowStatus | None,
        emit: EventSink,
        run_id: UUID,
        image_data_urls: tuple[str, ...] = (),
    ) -> RuntimeOutcome:
        tool_history: list[dict[str, object]] = []
        catalog = SemanticToolCatalog(backend=self._backend_client, auth=auth)
        usage_entries: list[dict[str, object]] = []
        trace_tasks: list[asyncio.Task[None]] = []

        await self._backend_client.check_ai_usage_quota(
            access_token=auth.access_token or '',
            tenant_id=auth.tenant_id,
            requested_tokens=_estimate_tokens(user_message),
        )

        try:
            state_update = await self._run_state_update(
                user_message=user_message,
                extracted_entities=extracted_entities,
                recent_messages=recent_messages,
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                emit=emit,
            )
            current_entities = state_update.extracted_entities

            if self._should_bypass_tool_planning_for_ambiguous_message(
                user_message=user_message,
                state_update=state_update,
            ):
                message = await self._run_phase(
                    emit=emit,
                    conversation_id=conversation_id,
                    workflow_id=workflow_id,
                    phase='render',
                    route=state_update.primary_route,
                    intent=state_update.primary_intent,
                    action=lambda: self._narrator.write_message(
                        user_message=user_message,
                        directive=self._conversational_response_directive(user_message),
                        supporting_context={
                            'classification': 'ambiguous_conversational_turn',
                            'confidence': state_update.confidence,
                        },
                    ),
                )
                emit('assistant.message.delta', {'content': message})
                return RuntimeOutcome(
                    blocks=render_tool_result(message, 'assistant.response', {}),
                    status=WorkflowStatus.COMPLETED,
                    current_task='response_completed',
                    extracted_entities=mark_task_status(current_entities, 'completed'),
                )

            if state_update.primary_intent == 'off_topic':
                message = (
                    'I can help with inventory, products, purchasing, sales orders, suppliers, customers, and reports.'
                )
                return RuntimeOutcome(
                    blocks=render_tool_result(message, 'assistant.response', {}),
                    status=WorkflowStatus.COMPLETED,
                    current_task='off_topic_redirected',
                    extracted_entities=mark_task_status(current_entities, 'completed'),
                )

            for post_action in state_update.new_post_actions:
                route = post_action.get('route')
                emit(
                    'post_action.queued',
                    self._event_payload(
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        status='queued',
                        extra={
                            'postActionType': str(post_action.get('type') or ''),
                            'label': str(route.get('label') or '') if isinstance(route, dict) else '',
                        },
                    ),
                )

            direct_confirmation_outcome = await self._handle_confirmation_edit(
                auth=auth,
                workflow_status=workflow_status,
                workflow_id=workflow_id,
                conversation_id=conversation_id,
                current_entities=current_entities,
                state_update=state_update,
                emit=emit,
            )
            if direct_confirmation_outcome is not None:
                return direct_confirmation_outcome
            direct_clarification_outcome = await self._handle_clarification_reply(
                auth=auth,
                workflow_status=workflow_status,
                workflow_id=workflow_id,
                conversation_id=conversation_id,
                current_entities=current_entities,
                state_update=state_update,
                emit=emit,
            )
            if direct_clarification_outcome is not None:
                return direct_clarification_outcome

            if state_update.primary_route == ROUTE_NAVIGATION:
                route_blocks = render_navigation_blocks(
                    build_post_action_blocks([{'route': row} for row in state_update.navigation_rows]),
                )
                navigation_entities = mark_task_status(current_entities, 'completed')
                return RuntimeOutcome(
                    blocks=[
                        TextBlock(content='Opening the requested screen.'),
                        *route_blocks,
                    ],
                    status=WorkflowStatus.COMPLETED,
                    current_task='navigation_completed',
                    extracted_entities=navigation_entities,
                )

            memory = await self._memory_service.build(
                auth=auth,
                workflow_id=str(workflow_id),
                conversation_id=str(conversation_id),
                workflow_status=workflow_status.value if workflow_status else None,
                current_task=str(current_entities.get('currentTask') or state_update.primary_intent or ''),
                recent_messages=recent_messages,
                extracted_entities=current_entities,
                missing_fields=list(current_entities.get('missingFields') or []),
            )

            for iteration in range(3):
                def record_trace(agent_role: str, current_iteration: int):
                    def _record(_role: str, trace) -> None:
                        payload = {
                            'attempts': [asdict(attempt) for attempt in trace.attempts],
                            'response': trace.response.raw_payload if trace.response else {},
                        }
                        provider_name = trace.response.provider_name if trace.response else 'unavailable'
                        model_name = trace.response.model_name if trace.response else 'unavailable'
                        for attempt in trace.attempts:
                            emit(
                                'fallback.used',
                                self._event_payload(
                                    conversation_id=conversation_id,
                                    workflow_id=workflow_id,
                                    phase=agent_role,
                                    route=state_update.primary_route,
                                    intent=state_update.primary_intent,
                                    status='fallback',
                                    extra={
                                        'fromPhase': agent_role,
                                        'toPhase': provider_name,
                                        'provider': attempt.provider_name,
                                        'attempt': attempt.model_name,
                                        'reason': attempt.error,
                                    },
                                ),
                            )
                        if trace.response and trace.response.raw_payload:
                            usage_entries.append(
                                {
                                    'provider': provider_name,
                                    'model': model_name,
                                    'rawPayload': trace.response.raw_payload,
                                }
                            )
                        trace_tasks.append(
                            asyncio.create_task(
                                self._training_data_service.record_trace(
                                    tenant_id=auth.tenant_id,
                                    run_id=run_id,
                                    conversation_id=conversation_id,
                                    workflow_id=workflow_id,
                                    agent_role=agent_role,
                                    provider_name=provider_name,
                                    model_name=model_name,
                                    stage=f'{agent_role}_iteration_{current_iteration + 1}',
                                    payload=payload,
                                )
                            )
                        )

                    return _record

                plan = await self._run_phase(
                    emit=emit,
                    conversation_id=conversation_id,
                    workflow_id=workflow_id,
                    phase='planning',
                    route=state_update.primary_route,
                    intent=state_update.primary_intent,
                    action=lambda: self._planner.plan(
                        user_message=state_update.planner_message,
                        memory={
                            'session': memory.session_memory,
                            'workflow': memory.workflow_memory,
                            'recentMessages': memory.recent_messages,
                            'latestSummary': memory.latest_summary,
                            'recentEntities': memory.recent_entities,
                            'businessMemory': memory.business_memory,
                            'userMemory': memory.user_memory,
                            'semanticMemory': memory.semantic_memory,
                        },
                        tools=self._schema_catalog_for_state(catalog, state_update),
                        history=tool_history,
                        image_data_urls=image_data_urls if iteration == 0 else (),
                        trace_callback=record_trace('planner', iteration),
                    ),
                )
                emit(
                    'plan.updated',
                    self._event_payload(
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        phase='planning',
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        extra={
                            'iteration': iteration + 1,
                            'goal': plan.get('goal'),
                            'action': plan.get('action'),
                            'reasoning': plan.get('reasoning'),
                        },
                    ),
                )

                if plan.get('action') == 'clarify':
                    question = await self._run_phase(
                        emit=emit,
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        phase='render',
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        action=lambda: self._narrator.write_message(
                            user_message=state_update.planner_message,
                            directive=str(plan.get('clarificationQuestion') or 'Please clarify your request.'),
                            supporting_context={
                                'requiredInputs': plan.get('requiredInputs') or [],
                                'goal': plan.get('goal'),
                            },
                            trace_callback=record_trace('narrator', iteration),
                        ),
                    )
                    required = [str(item) for item in plan.get('requiredInputs') or []]
                    emit('assistant.message.delta', {'content': question})
                    emit(
                        'clarification.requested',
                        self._event_payload(
                            conversation_id=conversation_id,
                            workflow_id=workflow_id,
                            route=state_update.primary_route,
                            intent=state_update.primary_intent,
                            missing_fields=required,
                            status='needs_input',
                        ),
                    )
                    next_entities = mark_task_status(
                        apply_task_context(current_entities, increment_clarification_count(task_context_from_entities(current_entities))),
                        'drafting',
                    )
                    return RuntimeOutcome(
                        blocks=render_clarification(question, required),
                        status=WorkflowStatus.NEEDS_INPUT,
                        current_task='clarification_requested',
                        extracted_entities=next_entities,
                        missing_fields=required,
                    )

                if plan.get('action') == 'respond':
                    response_text = await self._run_phase(
                        emit=emit,
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        phase='render',
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        action=lambda: self._narrator.write_message(
                            user_message=state_update.planner_message,
                            directive=str(plan.get('goal') or 'The request is complete.'),
                            supporting_context={'reasoning': plan.get('reasoning')},
                            trace_callback=record_trace('narrator', iteration),
                        ),
                    )
                    emit('assistant.message.delta', {'content': response_text})
                    return RuntimeOutcome(
                        blocks=render_tool_result(response_text, 'assistant.response', {}),
                        status=WorkflowStatus.COMPLETED,
                        current_task='response_completed',
                        extracted_entities=mark_task_status(current_entities, 'completed'),
                    )

                proposal = await self._run_phase(
                    emit=emit,
                    conversation_id=conversation_id,
                    workflow_id=workflow_id,
                    phase='proposal',
                    route=state_update.primary_route,
                    intent=state_update.primary_intent,
                    action=lambda: self._executor.propose(
                        user_message=state_update.planner_message,
                        plan=plan,
                        tools=self._schema_catalog_for_state(catalog, state_update),
                        history=tool_history,
                        trace_callback=record_trace('executor', iteration),
                    ),
                )
                emit(
                    'agent.selected',
                    self._event_payload(
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        phase='proposal',
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        extra={
                            'role': 'executor',
                            'action': proposal.get('action'),
                            'toolName': proposal.get('toolName'),
                        },
                    ),
                )

                if proposal.get('action') == 'clarify':
                    question = await self._run_phase(
                        emit=emit,
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        phase='render',
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        action=lambda: self._narrator.write_message(
                            user_message=state_update.planner_message,
                            directive=str(proposal.get('assistantMessage') or 'Please clarify your request.'),
                            supporting_context={
                                'requiredInputs': proposal.get('requiredInputs') or [],
                                'plan': plan,
                            },
                            trace_callback=record_trace('narrator', iteration),
                        ),
                    )
                    required = [str(item) for item in proposal.get('requiredInputs') or []]
                    emit('assistant.message.delta', {'content': question})
                    emit(
                        'clarification.requested',
                        self._event_payload(
                            conversation_id=conversation_id,
                            workflow_id=workflow_id,
                            route=state_update.primary_route,
                            intent=state_update.primary_intent,
                            missing_fields=required,
                            status='needs_input',
                        ),
                    )
                    next_entities = mark_task_status(
                        apply_task_context(current_entities, increment_clarification_count(task_context_from_entities(current_entities))),
                        'drafting',
                    )
                    return RuntimeOutcome(
                        blocks=render_clarification(question, required),
                        status=WorkflowStatus.NEEDS_INPUT,
                        current_task='clarification_requested',
                        extracted_entities=next_entities,
                        missing_fields=required,
                    )

                if proposal.get('action') == 'respond':
                    response_text = await self._run_phase(
                        emit=emit,
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        phase='render',
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        action=lambda: self._narrator.write_message(
                            user_message=state_update.planner_message,
                            directive=str(proposal.get('assistantMessage') or 'The request is complete.'),
                            supporting_context={'plan': plan},
                            trace_callback=record_trace('narrator', iteration),
                        ),
                    )
                    emit('assistant.message.delta', {'content': response_text})
                    return RuntimeOutcome(
                        blocks=render_tool_result(response_text, 'assistant.response', {}),
                        status=WorkflowStatus.COMPLETED,
                        current_task='response_completed',
                        extracted_entities=mark_task_status(current_entities, 'completed'),
                    )

                tool_name = str(proposal.get('toolName') or '')
                tool_arguments = proposal.get('toolArguments')
                if isinstance(tool_arguments, dict):
                    tool_arguments = self._sanitize_tool_arguments(
                        tool_name=tool_name,
                        tool_arguments=tool_arguments,
                        current_entities=current_entities,
                    )
                if not tool_name or not isinstance(tool_arguments, dict):
                    logger.error('Invalid executor proposal: %s', proposal)
                    prompt, required = self._fallback_clarification_for_intent(state_update.primary_intent)
                    return RuntimeOutcome(
                        blocks=render_clarification(prompt, required),
                        status=WorkflowStatus.NEEDS_INPUT,
                        current_task='tool_call_invalid',
                        extracted_entities=mark_task_status(
                            apply_task_context(
                                current_entities,
                                increment_clarification_count(task_context_from_entities(current_entities)),
                            ),
                            'drafting',
                        ),
                        missing_fields=required,
                    )

                emit(
                    'tool.called',
                    self._event_payload(
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        phase='execution',
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        tool_name=tool_name,
                        extra={'arguments': tool_arguments},
                    ),
                )
                tool = catalog.get(tool_name)
                if tool is None:
                    return RuntimeOutcome(
                        blocks=render_failure(f'Unknown tool selected by AI runtime: {tool_name}'),
                        status=WorkflowStatus.FAILED,
                        current_task='tool_unknown',
                        extracted_entities=current_entities,
                    )

                if tool.side_effect:
                    return await self._prepare_confirmation(
                        auth=auth,
                        catalog=catalog,
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        state_update=state_update,
                        current_entities=current_entities,
                        tool_name=tool_name,
                        tool_arguments=tool_arguments,
                        message_hint=str(
                            proposal.get('assistantMessage')
                            or f'Prepared {tool_name.replace(".", " ")}. Review the details before continuing.'
                        ),
                        emit=emit,
                    )

                try:
                    catalog.validate(tool_name, tool_arguments)
                except ToolSchemaValidationError as exc:
                    return self._clarification_outcome_from_schema_error(
                        current_entities=current_entities,
                        required=exc.required_fields,
                        prompt=exc.prompt,
                    )

                try:
                    tool_result = await self._run_phase(
                        emit=emit,
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        phase='execution',
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        tool_name=tool_name,
                        action=lambda: catalog.invoke(tool_name, tool_arguments),
                    )
                except BackendValidationError as exc:
                    last_error = exc.user_message
                    emit(
                        'tool.error',
                        self._event_payload(
                            conversation_id=conversation_id,
                            workflow_id=workflow_id,
                            phase='execution',
                            route=state_update.primary_route,
                            intent=state_update.primary_intent,
                            tool_name=tool_name,
                            status='failed',
                            extra={'error': last_error},
                        ),
                    )
                    tool_history.append(
                        {
                            'plan': plan,
                            'proposal': proposal,
                            'toolError': last_error,
                            'errorType': 'backend_validation',
                        }
                    )
                    if iteration < 2:
                        continue
                    return RuntimeOutcome(
                        blocks=render_failure(last_error),
                        status=WorkflowStatus.FAILED,
                        current_task='tool_validation_failed',
                        extracted_entities=current_entities,
                    )
                except Exception as exc:
                    emit(
                        'tool.failed',
                        self._event_payload(
                            conversation_id=conversation_id,
                            workflow_id=workflow_id,
                            phase='execution',
                            route=state_update.primary_route,
                            intent=state_update.primary_intent,
                            tool_name=tool_name,
                            status='failed',
                            extra={'error': str(exc)},
                        ),
                    )
                    raise

                emit(
                    'tool.succeeded',
                    self._event_payload(
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        phase='execution',
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        tool_name=tool_name,
                        status='completed',
                    ),
                )

                review = await self._run_phase(
                    emit=emit,
                    conversation_id=conversation_id,
                    workflow_id=workflow_id,
                    phase='review',
                    route=state_update.primary_route,
                    intent=state_update.primary_intent,
                    tool_name=tool_name,
                    action=lambda: self._reviewer.review(
                        user_message=state_update.planner_message,
                        plan=plan,
                        proposal=proposal,
                        tool_result=tool_result,
                        history=tool_history,
                        trace_callback=record_trace('reviewer', iteration),
                    ),
                )

                tool_history.append({'plan': plan, 'proposal': proposal, 'toolResult': tool_result, 'review': review})

                if review.get('action') == 'clarify':
                    question = await self._run_phase(
                        emit=emit,
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        phase='render',
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        action=lambda: self._narrator.write_message(
                            user_message=state_update.planner_message,
                            directive=str(review.get('assistantMessage') or 'Please clarify your request.'),
                            supporting_context={'requiredInputs': review.get('requiredInputs') or []},
                            trace_callback=record_trace('narrator', iteration),
                        ),
                    )
                    required = [str(item) for item in review.get('requiredInputs') or []]
                    emit('assistant.message.delta', {'content': question})
                    emit(
                        'clarification.requested',
                        self._event_payload(
                            conversation_id=conversation_id,
                            workflow_id=workflow_id,
                            route=state_update.primary_route,
                            intent=state_update.primary_intent,
                            missing_fields=required,
                            status='needs_input',
                        ),
                    )
                    next_entities = mark_task_status(
                        apply_task_context(current_entities, increment_clarification_count(task_context_from_entities(current_entities))),
                        'drafting',
                    )
                    return RuntimeOutcome(
                        blocks=render_clarification(question, required),
                        status=WorkflowStatus.NEEDS_INPUT,
                        current_task='clarification_requested',
                        extracted_entities=next_entities,
                        missing_fields=required,
                    )

                if review.get('action') == 'complete':
                    if self._tool_result_has_no_matches(tool_result):
                        return RuntimeOutcome(
                            blocks=render_tool_result("I couldn't find any matches.", tool_name, tool_result),
                            status=WorkflowStatus.COMPLETED,
                            current_task='completed',
                            extracted_entities=mark_task_status(
                                {
                                    **current_entities,
                                    'lastToolName': tool_name,
                                },
                                'completed',
                                clear_post_actions=True,
                            ),
                        )
                    message = await self._run_phase(
                        emit=emit,
                        conversation_id=conversation_id,
                        workflow_id=workflow_id,
                        phase='render',
                        route=state_update.primary_route,
                        intent=state_update.primary_intent,
                        tool_name=tool_name,
                        action=lambda: self._narrator.write_message(
                            user_message=state_update.planner_message,
                            directive=str(review.get('assistantMessage') or proposal.get('assistantMessage') or 'Done.'),
                            supporting_context={
                                'toolName': tool_name,
                                'toolResult': tool_result,
                            },
                            trace_callback=record_trace('narrator', iteration),
                        ),
                    )
                    emit('assistant.message.delta', {'content': message})
                    post_action_blocks = render_navigation_blocks(
                        build_post_action_blocks(task_context_from_entities(current_entities).get('postActions') or []),
                    )
                    for route_block in post_action_blocks:
                        emit(
                            'post_action.executed',
                            self._event_payload(
                                conversation_id=conversation_id,
                                workflow_id=workflow_id,
                                phase='render',
                                route=state_update.primary_route,
                                intent=state_update.primary_intent,
                                status='completed',
                                extra={'label': getattr(route_block, 'label', '')},
                            ),
                        )
                    completed_entities = self._merge_context_from_tool_interaction(
                        current_entities=current_entities,
                        tool_name=tool_name,
                        tool_arguments=tool_arguments,
                        tool_result=tool_result,
                        resolved_entities=review.get('resolvedEntities'),
                    )
                    return RuntimeOutcome(
                        blocks=[
                            *render_tool_result(
                                message,
                                tool_name,
                                tool_result,
                                include_table=bool(review.get('includeTable')),
                            ),
                            *post_action_blocks,
                        ],
                        status=WorkflowStatus.COMPLETED,
                        current_task='completed',
                        extracted_entities=mark_task_status(
                            {
                                **completed_entities,
                                'lastToolName': tool_name,
                            },
                            'completed',
                            clear_post_actions=True,
                        ),
                    )

            return RuntimeOutcome(
                blocks=render_failure('The AI runtime reached its planning limit before completing the task.'),
                status=WorkflowStatus.FAILED,
                current_task='iteration_limit_reached',
                extracted_entities=current_entities,
            )
        except Exception:
            logger.exception('AI runtime failed for conversation %s workflow %s', conversation_id, workflow_id)
            return RuntimeOutcome(
                blocks=render_failure('The AI runtime could not complete this request.'),
                status=WorkflowStatus.FAILED,
                current_task='runtime_error',
                extracted_entities=extracted_entities,
            )
        finally:
            if trace_tasks:
                await asyncio.gather(*trace_tasks, return_exceptions=True)
            if usage_entries:
                try:
                    await self._backend_client.record_ai_usage(
                        access_token=auth.access_token or '',
                        tenant_id=auth.tenant_id,
                        entries=usage_entries,
                    )
                except Exception:
                    logger.exception(
                        'failed to record exact ai usage for conversation %s workflow %s',
                        conversation_id,
                        workflow_id,
                    )

    async def _run_state_update(
        self,
        *,
        user_message: str,
        extracted_entities: dict[str, object],
        recent_messages: list[dict[str, object]],
        conversation_id: UUID,
        workflow_id: UUID,
        emit: EventSink,
    ) -> RuntimeStateUpdate:
        emit(
            'phase.started',
            self._event_payload(
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                phase='state_update',
            ),
        )
        started = perf_counter()
        state_update = await resolve_state_update(
            user_message=user_message,
            extracted_entities=extracted_entities,
            recent_messages=recent_messages,
            retrieval_service=self._retrieval_service,
            state_updater=self._state_updater,
        )
        emit(
            'phase.completed',
            self._event_payload(
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                phase='state_update',
                route=state_update.primary_route,
                intent=state_update.primary_intent,
                confidence=state_update.confidence,
                rationale=state_update.rationale,
                latency_ms=(perf_counter() - started) * 1000,
            ),
        )
        emit(
            'route.resolved',
            self._event_payload(
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                phase='state_update',
                route=state_update.primary_route,
                intent=state_update.primary_intent,
                confidence=state_update.confidence,
                rationale=state_update.rationale,
                status='resolved',
                extra={
                    'primaryRoute': state_update.primary_route,
                    'primaryIntent': state_update.primary_intent,
                    'usedMemory': state_update.used_memory,
                    'isWorkflowEdit': state_update.is_workflow_edit,
                },
            ),
        )
        return state_update

    async def _handle_confirmation_edit(
        self,
        *,
        auth: AuthContext,
        workflow_status: WorkflowStatus | None,
        workflow_id: UUID,
        conversation_id: UUID,
        current_entities: dict[str, object],
        state_update: RuntimeStateUpdate,
        emit: EventSink,
    ) -> RuntimeOutcome | None:
        if workflow_status != WorkflowStatus.AWAITING_CONFIRMATION:
            return None
        tool_name = str(current_entities.get('toolName') or '')
        execution_payload = current_entities.get('executionPayload')
        if not tool_name or not isinstance(execution_payload, dict):
            return None
        if not state_update.is_workflow_edit and not state_update.new_post_actions:
            return None

        preview = current_entities.get('preview')
        preview_arguments = preview.get('arguments') if isinstance(preview, dict) else None
        if isinstance(preview_arguments, dict):
            updated_payload = dict(preview_arguments)
            if 'locationId' not in updated_payload and execution_payload.get('locationId') is not None:
                updated_payload['locationId'] = execution_payload['locationId']
            if 'fromLocationId' not in updated_payload and execution_payload.get('fromLocationId') is not None:
                updated_payload['fromLocationId'] = execution_payload['fromLocationId']
            if 'toLocationId' not in updated_payload and execution_payload.get('toLocationId') is not None:
                updated_payload['toLocationId'] = execution_payload['toLocationId']
        else:
            updated_payload = dict(execution_payload)
        task_entities = state_update.task_context.get('entities')
        if isinstance(task_entities, dict):
            for key, value in task_entities.items():
                if key in {
                    'allColors',
                    'allSizes',
                    'colorNames',
                    'quantity',
                    'fromLocationId',
                    'toLocationId',
                    'lines',
                    'locationId',
                    'productName',
                    'colorName',
                    'sizeLabel',
                    'sizeLabels',
                    'sku',
                    'reason',
                } and value is not None:
                    updated_payload[key] = value

        planner_text = state_update.planner_message.lower()
        if tool_name == 'inventory.receive_stock':
            if 'all sizes' in planner_text or 'every size' in planner_text:
                updated_payload['allSizes'] = True
                updated_payload.pop('sizeLabel', None)
                updated_payload.pop('sizeId', None)
            if 'all colors' in planner_text or 'every color' in planner_text:
                updated_payload['allColors'] = True
                updated_payload.pop('colorName', None)
                updated_payload.pop('sizeId', None)

        summary_suffix = ''
        if state_update.new_post_actions:
            route = state_update.new_post_actions[0].get('route')
            if isinstance(route, dict):
                summary_suffix = f' After success, I will open {route.get("label") or route.get("href")}.'

        emit(
            'clarification.resolved',
            self._event_payload(
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                route=state_update.primary_route,
                intent=state_update.primary_intent,
                status='updated',
            ),
        )
        return await self._prepare_confirmation(
            auth=auth,
            catalog=SemanticToolCatalog(backend=self._backend_client, auth=auth),
            conversation_id=conversation_id,
            workflow_id=workflow_id,
            state_update=state_update,
            current_entities=current_entities,
            tool_name=tool_name,
            tool_arguments=updated_payload,
            message_hint=f'Updated the draft with your latest changes.{summary_suffix}'.strip(),
            emit=emit,
        )

    async def _handle_clarification_reply(
        self,
        *,
        auth: AuthContext,
        workflow_status: WorkflowStatus | None,
        workflow_id: UUID,
        conversation_id: UUID,
        current_entities: dict[str, object],
        state_update: RuntimeStateUpdate,
        emit: EventSink,
    ) -> RuntimeOutcome | None:
        if workflow_status != WorkflowStatus.NEEDS_INPUT:
            return None
        tool_name = str(current_entities.get('toolName') or '')
        execution_payload = current_entities.get('executionPayload')
        if not tool_name or not isinstance(execution_payload, dict):
            return None
        if not state_update.is_workflow_edit and not state_update.new_post_actions:
            return None

        updated_payload = dict(execution_payload)
        task_entities = state_update.task_context.get('entities')
        if isinstance(task_entities, dict):
            for key, value in task_entities.items():
                if value is not None:
                    updated_payload[key] = value

        summary_suffix = ''
        if state_update.new_post_actions:
            route = state_update.new_post_actions[0].get('route')
            if isinstance(route, dict):
                summary_suffix = f' After success, I will open {route.get("label") or route.get("href")}.'

        emit(
            'clarification.resolved',
            self._event_payload(
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                route=state_update.primary_route,
                intent=state_update.primary_intent,
                status='updated',
            ),
        )
        return await self._prepare_confirmation(
            auth=auth,
            catalog=SemanticToolCatalog(backend=self._backend_client, auth=auth),
            conversation_id=conversation_id,
            workflow_id=workflow_id,
            state_update=state_update,
            current_entities=current_entities,
            tool_name=tool_name,
            tool_arguments=updated_payload,
            message_hint=f'Updated the draft with your latest details.{summary_suffix}'.strip(),
            emit=emit,
        )

    async def _prepare_confirmation(
        self,
        *,
        auth: AuthContext,
        catalog: SemanticToolCatalog,
        conversation_id: UUID,
        workflow_id: UUID,
        state_update: RuntimeStateUpdate,
        current_entities: dict[str, object],
        tool_name: str,
        tool_arguments: dict[str, object],
        message_hint: str,
        emit: EventSink,
    ) -> RuntimeOutcome:
        active_approval_id = current_entities.get('activeApprovalId')
        has_pending_approval = (
            isinstance(active_approval_id, str)
            and bool(active_approval_id)
            and current_entities.get('activeApprovalStatus') == 'pending'
        )
        try:
            prepared_arguments = await catalog.prepare(tool_name, tool_arguments)
        except ToolSchemaValidationError as exc:
            return self._clarification_outcome_from_schema_error(
                current_entities={
                    **current_entities,
                    'toolName': tool_name,
                    'executionPayload': tool_arguments,
                },
                required=exc.required_fields,
                prompt=exc.prompt,
            )
        except ToolPreparationError as exc:
            required = [str(item) for item in exc.missing_fields]
            emit(
                'clarification.requested',
                self._event_payload(
                    conversation_id=conversation_id,
                    workflow_id=workflow_id,
                    route=state_update.primary_route,
                    intent=state_update.primary_intent,
                    tool_name=tool_name,
                    missing_fields=required,
                    status='needs_input',
                ),
            )
            draft_entities = {
                **current_entities,
                'toolName': tool_name,
                'executionPayload': tool_arguments,
            }
            next_entities = mark_task_status(
                apply_task_context(draft_entities, increment_clarification_count(task_context_from_entities(draft_entities))),
                'drafting',
            )
            return RuntimeOutcome(
                blocks=render_clarification(exc.prompt, required),
                status=WorkflowStatus.NEEDS_INPUT,
                current_task='clarification_requested',
                extracted_entities=next_entities,
                missing_fields=required,
            )

        quantity = prepared_arguments.get('quantity')
        evaluation = await self._backend_client.evaluate_approval(
            access_token=auth.access_token or '',
            tenant_id=auth.tenant_id,
            action_type=tool_name,
            quantity=int(quantity) if isinstance(quantity, int) else None,
        )
        if evaluation.requires_approval and has_pending_approval:
            confirmation_prompt = 'Review these updated details and confirm. The pending approval request will be updated.'
        elif evaluation.requires_approval:
            confirmation_prompt = 'Review these details and confirm. The request will then be submitted for approval.'
        else:
            confirmation_prompt = 'Review these details and confirm to continue.'

        enriched_task_context = task_context_from_entities(state_update.extracted_entities)
        enriched_entities = dict(enriched_task_context.get('entities') or {})
        enriched_entities.update(
            self._derived_context_entities(
                tool_name=tool_name,
                tool_arguments=prepared_arguments,
            )
        )
        enriched_task_context['entities'] = enriched_entities
        enriched_state_entities = apply_task_context(dict(state_update.extracted_entities), enriched_task_context)

        next_entities = {
            **enriched_state_entities,
            '_workflowEngine': 'runtime',
            '_pendingActions': [
                PendingActionType.CONFIRM.value,
                PendingActionType.CANCEL.value,
                PendingActionType.EDIT.value,
            ],
            '_pendingPrompt': confirmation_prompt,
            'toolName': tool_name,
            'executionPayload': prepared_arguments,
            'preview': {
                'tool': tool_name,
                'arguments': tool_arguments,
                'taskContext': enriched_task_context,
            },
            'approvalRequired': evaluation.requires_approval,
            'approvalReason': evaluation.reason,
            'summary': str(current_entities.get('summary') or state_update.primary_intent or tool_name),
            'activeApprovalId': active_approval_id if has_pending_approval else None,
            'activeApprovalStatus': 'pending' if has_pending_approval else None,
            '_approvalOperation': 'update_existing' if has_pending_approval else 'create_new',
        }
        next_entities = mark_task_status(next_entities, 'awaiting_confirmation')

        emit(
            'approval.presented',
            self._event_payload(
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                route=state_update.primary_route,
                intent=state_update.primary_intent,
                tool_name=tool_name,
                approval_required=evaluation.requires_approval,
                status='awaiting_confirmation',
            ),
        )

        return RuntimeOutcome(
            blocks=render_confirmation_required(
                message=message_hint,
                tool_name=tool_name,
                tool_arguments=tool_arguments,
                approval_required=evaluation.requires_approval,
                confirmation_prompt=confirmation_prompt,
                actor=auth.email,
            ),
            status=WorkflowStatus.AWAITING_CONFIRMATION,
            current_task='awaiting_confirmation',
            extracted_entities=next_entities,
        )

    def _clarification_outcome_from_schema_error(
        self,
        *,
        current_entities: dict[str, object],
        required: list[str],
        prompt: str,
    ) -> RuntimeOutcome:
        next_entities = mark_task_status(
            apply_task_context(
                current_entities,
                increment_clarification_count(task_context_from_entities(current_entities)),
            ),
            'drafting',
        )
        return RuntimeOutcome(
            blocks=render_clarification(prompt, required),
            status=WorkflowStatus.NEEDS_INPUT,
            current_task='clarification_requested',
            extracted_entities=next_entities,
            missing_fields=required,
        )

    async def _run_phase(
        self,
        *,
        emit: EventSink,
        conversation_id: UUID,
        workflow_id: UUID,
        phase: str,
        route: str,
        intent: str,
        action,
        tool_name: str | None = None,
    ):
        emit(
            'phase.started',
            self._event_payload(
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                phase=phase,
                route=route,
                intent=intent,
                tool_name=tool_name,
            ),
        )
        started = perf_counter()
        result = await action()
        emit(
            'phase.completed',
            self._event_payload(
                conversation_id=conversation_id,
                workflow_id=workflow_id,
                phase=phase,
                route=route,
                intent=intent,
                tool_name=tool_name,
                latency_ms=(perf_counter() - started) * 1000,
                status='completed',
            ),
        )
        return result

    def _schema_catalog_for_state(
        self,
        catalog: SemanticToolCatalog,
        state_update: RuntimeStateUpdate,
    ) -> list[dict[str, object]]:
        schema_catalog = catalog.schema_catalog()
        if state_update.primary_route == ROUTE_NAVIGATION:
            return [entry for entry in schema_catalog if entry['name'] == 'navigation.find_screen']
        return [entry for entry in schema_catalog if entry['name'] != 'navigation.find_screen']

    @staticmethod
    def _sanitize_tool_arguments(
        *,
        tool_name: str,
        tool_arguments: dict[str, object],
        current_entities: dict[str, object],
    ) -> dict[str, object]:
        if tool_name != 'master.create_location':
            return tool_arguments

        task_context = task_context_from_entities(current_entities)
        entities = task_context.get('entities')
        if not isinstance(entities, dict):
            return {}

        sanitized = {
            key: entities[key]
            for key in ('name', 'code', 'type', 'address', 'status')
            if entities.get(key) is not None
        }
        return sanitized

    @staticmethod
    def _should_bypass_tool_planning_for_ambiguous_message(
        *,
        user_message: str,
        state_update: RuntimeStateUpdate,
    ) -> bool:
        if state_update.is_workflow_edit:
            return False
        if state_update.primary_route != 'read':
            return False
        if state_update.primary_intent != 'inventory.stock_on_hand':
            return False
        if state_update.confidence >= 0.5:
            return False

        task_entities = state_update.task_context.get('entities')
        if isinstance(task_entities, dict) and any(value is not None for value in task_entities.values()):
            return False

        normalized = ' '.join(user_message.strip().split())
        if not normalized:
            return True

        tokens = re.findall(r"[A-Za-z0-9']+", normalized)
        if len(tokens) > 4:
            return False
        if any(char.isdigit() for char in normalized):
            return False
        if any(sep in normalized for sep in ('/', '@', ':')):
            return False
        return True

    @staticmethod
    def _conversational_response_directive(user_message: str) -> str:
        normalized = ' '.join(user_message.strip().split())
        if not normalized:
            return 'Send a short, natural reply that invites the user to continue.'
        return (
            'Reply to the user in one short sentence that matches their tone, '
            'acknowledges their message, and invites them to continue.'
        )

    @staticmethod
    def _tool_result_has_no_matches(tool_result: dict[str, object]) -> bool:
        rows = tool_result.get('rows')
        return isinstance(rows, list) and len(rows) == 0

    @staticmethod
    def _fallback_clarification_for_intent(primary_intent: str) -> tuple[str, list[str]]:
        if primary_intent == 'sales.create_invoice':
            return (
                'Reply with the customer plus product, color, size, and quantity for each sales order line.',
                ['customer_id', 'lines'],
            )
        if primary_intent == 'products.create_product':
            return (
                'Reply with the product name, style code, base price, color, and size details.',
                ['style_code', 'name', 'base_price', 'color_name', 'size_labels'],
            )
        return ('Please restate the action with the key details I should use.', [])

    @staticmethod
    def _derived_context_entities(
        *,
        tool_name: str,
        tool_arguments: dict[str, object],
        tool_result: dict[str, object] | None = None,
        resolved_entities: object = None,
    ) -> dict[str, object]:
        entities: dict[str, object] = {}

        if tool_name == 'inventory.stock_on_hand':
            if isinstance(tool_arguments.get('productName'), str) and tool_arguments.get('productName'):
                entities['productName'] = str(tool_arguments['productName'])
            rows = tool_result.get('rows') if isinstance(tool_result, dict) else None
            if isinstance(rows, list):
                product_names = sorted(
                    {
                        str(row.get('product_name')).strip()
                        for row in rows
                        if isinstance(row, dict) and row.get('product_name')
                    }
                )
                color_names = sorted(
                    {
                        str(row.get('color_name')).strip()
                        for row in rows
                        if isinstance(row, dict) and row.get('color_name')
                    }
                )
                size_labels = sorted(
                    {
                        str(row.get('size_label')).strip()
                        for row in rows
                        if isinstance(row, dict) and row.get('size_label')
                    }
                )
                if len(product_names) == 1:
                    entities['productName'] = product_names[0]
                if color_names:
                    entities['colorNames'] = color_names
                    entities['colorName'] = color_names[0]
                if size_labels:
                    entities['sizeLabels'] = size_labels
                    entities['sizeLabel'] = size_labels[0]

        if tool_name == 'products.create_product':
            product_payload = tool_arguments.get('product')
            product = product_payload if isinstance(product_payload, dict) else tool_arguments
            product_name = str(product.get('name') or '').strip()
            style_code = str(product.get('styleCode') or '').strip()
            base_price = product.get('basePrice')
            if product_name:
                entities['productName'] = product_name
            if style_code:
                entities['styleCode'] = style_code
            if isinstance(base_price, int):
                entities['basePrice'] = base_price

            color_names: list[str] = []
            size_labels: list[str] = []
            raw_variants = tool_arguments.get('variants')
            if isinstance(raw_variants, list):
                for variant in raw_variants:
                    if not isinstance(variant, dict):
                        continue
                    color_name = str(variant.get('colorName') or variant.get('color') or '').strip()
                    if color_name and color_name not in color_names:
                        color_names.append(color_name)
                    raw_sizes = variant.get('sizes')
                    if isinstance(raw_sizes, list):
                        for raw_size in raw_sizes:
                            if not isinstance(raw_size, dict):
                                continue
                            size_label = str(raw_size.get('sizeLabel') or raw_size.get('size') or '').strip()
                            if size_label and size_label not in size_labels:
                                size_labels.append(size_label)
                    else:
                        size_label = str(variant.get('sizeLabel') or variant.get('size') or '').strip()
                        if size_label and size_label not in size_labels:
                            size_labels.append(size_label)
            if color_names:
                entities['colorNames'] = color_names
                if len(color_names) == 1:
                    entities['colorName'] = color_names[0]
            if size_labels:
                entities['sizeLabels'] = size_labels
                if len(size_labels) == 1:
                    entities['sizeLabel'] = size_labels[0]

        if isinstance(resolved_entities, dict):
            for key, value in resolved_entities.items():
                if isinstance(key, str) and value is not None:
                    entities[key] = value

        return entities

    @staticmethod
    def _merge_context_from_tool_interaction(
        *,
        current_entities: dict[str, object],
        tool_name: str,
        tool_arguments: dict[str, object],
        tool_result: dict[str, object],
        resolved_entities: object = None,
    ) -> dict[str, object]:
        merged = dict(current_entities)
        task_context = task_context_from_entities(merged)
        entities = dict(task_context.get('entities') or {})
        entities.update(
            AgentRuntimeService._derived_context_entities(
                tool_name=tool_name,
                tool_arguments=tool_arguments,
                tool_result=tool_result,
                resolved_entities=resolved_entities,
            )
        )
        task_context['entities'] = entities
        merged.update(entities)
        merged['taskContext'] = task_context
        return apply_task_context(merged, task_context)

    @staticmethod
    def _event_payload(
        *,
        conversation_id: UUID,
        workflow_id: UUID,
        phase: str | None = None,
        tool_name: str | None = None,
        latency_ms: float | None = None,
        status: str | None = None,
        route: str | None = None,
        intent: str | None = None,
        confidence: float | None = None,
        rationale: str | None = None,
        missing_fields: list[str] | None = None,
        approval_required: bool | None = None,
        extra: dict[str, object] | None = None,
    ) -> dict[str, object]:
        payload: dict[str, object] = {
            'conversationId': str(conversation_id),
            'workflowId': str(workflow_id),
        }
        if phase is not None:
            payload['phase'] = phase
        if tool_name is not None:
            payload['toolName'] = tool_name
        if latency_ms is not None:
            payload['latencyMs'] = round(latency_ms, 2)
        if status is not None:
            payload['status'] = status
        if route is not None:
            payload['route'] = route
        if intent is not None:
            payload['intent'] = intent
        if confidence is not None:
            payload['confidence'] = confidence
        if rationale is not None:
            payload['rationale'] = rationale
        if missing_fields:
            payload['missingFields'] = missing_fields
        if approval_required is not None:
            payload['approvalRequired'] = approval_required
        if extra:
            payload.update(extra)
        return payload
