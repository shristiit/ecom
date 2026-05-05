from __future__ import annotations

import logging

from conversational_engine.audit.service import AuditService
from conversational_engine.clients.backend import BackendClient, idempotency_scope
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import ErrorBlock, WorkflowStatus
from conversational_engine.orchestrator.service import OrchestratorOutcome
from conversational_engine.runtime.renderer import render_navigation_blocks, render_tool_result
from conversational_engine.runtime.state_update import build_post_action_blocks, mark_task_status
from conversational_engine.tools.catalog import SemanticToolCatalog
from conversational_engine.tools.catalog.utils import ToolPreparationError

logger = logging.getLogger(__name__)


class RuntimeApprovalExecutor:
    def __init__(self, backend_client: BackendClient, *, audit_service: AuditService | None = None) -> None:
        self._backend_client = backend_client
        self._audit_service = audit_service

    async def execute(self, *, auth: AuthContext, approval) -> OrchestratorOutcome:
        if approval.status not in {'approved', 'auto_approved', 'rejected'}:
            return OrchestratorOutcome(
                blocks=[
                    ErrorBlock(
                        title='Approval execution blocked',
                        message='This approval request is not ready for execution.',
                    )
                ],
                status=WorkflowStatus.FAILED,
                current_task='approval_not_ready',
                extracted_entities={
                    'lastApprovalId': str(approval.id),
                    'lastApprovalStatus': approval.status,
                },
                missing_fields=[],
                active_approval_id=None,
            )

        if approval.status == 'rejected':
            rejected_entities = mark_task_status(
                {
                    'lastApprovalId': str(approval.id),
                    'lastApprovalStatus': approval.status,
                },
                'completed',
                clear_post_actions=True,
            )
            return OrchestratorOutcome(
                blocks=[
                    ErrorBlock(
                        title='Approval rejected',
                        message='The approval request was rejected and no action was executed.',
                    )
                ],
                status=WorkflowStatus.FAILED,
                current_task='approval_rejected',
                extracted_entities=rejected_entities,
                missing_fields=[],
                active_approval_id=None,
            )

        catalog = SemanticToolCatalog(backend=self._backend_client, auth=auth)
        tool = catalog.get(approval.tool_name)
        if tool is None:
            return OrchestratorOutcome(
                blocks=[
                    ErrorBlock(
                        title='Approval execution failed',
                        message=f'Unknown tool: {approval.tool_name}',
                    )
                ],
                status=WorkflowStatus.FAILED,
                current_task='approval_tool_missing',
                extracted_entities={
                    'lastApprovalId': str(approval.id),
                    'lastApprovalStatus': approval.status,
                },
                missing_fields=[],
                active_approval_id=None,
            )

        # NOTE: We intentionally skip catalog.validate() here.
        # The execution_payload stored during confirmation is the *prepared* (normalised)
        # output, whose shape may differ from the raw input_schema (e.g. products.create_product
        # normalises to {product: {...}, variants: [...]} while the input_schema expects flat
        # {styleCode, name, basePrice, variants}).  Calling catalog.invoke() already runs the
        # preparer again (idempotent), so any structural issues will surface as ToolPreparationError.
        try:
            with idempotency_scope(f'approval:{approval.id}'):
                result = await catalog.invoke(approval.tool_name, approval.execution_payload)
        except ToolPreparationError as exc:
            logger.warning(
                'Approval preparation error for approval %s: %s', approval.id, exc.prompt
            )
            return OrchestratorOutcome(
                blocks=[
                    ErrorBlock(
                        title='Approval execution failed',
                        message=exc.prompt,
                    )
                ],
                status=WorkflowStatus.FAILED,
                current_task='approval_preparation_failed',
                extracted_entities={
                    'lastApprovalId': str(approval.id),
                    'lastApprovalStatus': approval.status,
                },
                missing_fields=exc.missing_fields,
                active_approval_id=None,
            )
        except Exception as exc:
            logger.exception('Approval execution failed for approval %s', approval.id)
            return OrchestratorOutcome(
                blocks=[
                    ErrorBlock(
                        title='Approval execution failed',
                        message='The approved action could not be completed.',
                    )
                ],
                status=WorkflowStatus.FAILED,
                current_task='approval_execution_failed',
                extracted_entities={
                    'lastApprovalId': str(approval.id),
                    'lastApprovalStatus': approval.status,
                },
                missing_fields=[],
                active_approval_id=None,
            )

        task_context = approval.preview.get('taskContext') if isinstance(approval.preview, dict) else None
        await self._record_audit_event(
            auth=auth,
            approval=approval,
            event_type='approval_executed',
            payload={
                'status': 'success',
                'toolName': approval.tool_name,
                'actionType': approval.action_type,
                'summary': approval.summary,
                'executionPayload': approval.execution_payload,
                'result': result,
            },
        )
        next_entities = mark_task_status(
            {
                'lastApprovalId': str(approval.id),
                'lastApprovalStatus': approval.status,
                'lastToolName': approval.tool_name,
                'taskContext': task_context if isinstance(task_context, dict) else {},
            },
            'completed',
            clear_post_actions=True,
        )
        post_actions = []
        if isinstance(task_context, dict):
            raw_post_actions = task_context.get('postActions')
            if isinstance(raw_post_actions, list):
                post_actions = [action for action in raw_post_actions if isinstance(action, dict)]

        return OrchestratorOutcome(
            blocks=[
                *render_tool_result(
                    'Approval granted and the requested action has been executed.',
                    approval.tool_name,
                    result,
                ),
                *render_navigation_blocks(build_post_action_blocks(post_actions)),
            ],
            status=WorkflowStatus.COMPLETED,
            current_task='approval_execution_completed',
            extracted_entities=next_entities,
            missing_fields=[],
            active_approval_id=None,
        )

    async def _record_audit_event(
        self,
        *,
        auth: AuthContext,
        approval,
        event_type: str,
        payload: dict[str, object],
    ) -> None:
        if self._audit_service is None:
            return
        try:
            await self._audit_service.record(
                tenant_id=auth.tenant_id,
                user_id=auth.id,
                actor_email=auth.email,
                event_type=event_type,
                conversation_id=str(approval.conversation_id) if approval.conversation_id else None,
                workflow_id=str(approval.workflow_id) if approval.workflow_id else None,
                approval_id=str(approval.id),
                tool_name=approval.tool_name,
                payload=payload,
            )
        except Exception:
            logger.exception('Failed to persist approval audit event %s', event_type)
