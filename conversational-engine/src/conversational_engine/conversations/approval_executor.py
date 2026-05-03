from __future__ import annotations

import logging

from conversational_engine.clients.backend import BackendClient, idempotency_scope
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import ErrorBlock, WorkflowStatus
from conversational_engine.orchestrator.service import OrchestratorOutcome
from conversational_engine.runtime.renderer import render_navigation_blocks, render_tool_result
from conversational_engine.runtime.state_update import build_post_action_blocks, mark_task_status
from conversational_engine.tools.catalog import SemanticToolCatalog
from conversational_engine.tools.validation import ToolSchemaValidationError

logger = logging.getLogger(__name__)


class RuntimeApprovalExecutor:
    def __init__(self, backend_client: BackendClient) -> None:
        self._backend_client = backend_client

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

        try:
            catalog.validate(approval.tool_name, approval.execution_payload)
        except ToolSchemaValidationError:
            return OrchestratorOutcome(
                blocks=[
                    ErrorBlock(
                        title='Approval execution failed',
                        message='The saved approval payload is no longer valid.',
                    )
                ],
                status=WorkflowStatus.FAILED,
                current_task='approval_payload_invalid',
                extracted_entities={
                    'lastApprovalId': str(approval.id),
                    'lastApprovalStatus': approval.status,
                },
                missing_fields=[],
                active_approval_id=None,
            )

        try:
            with idempotency_scope(f'approval:{approval.id}'):
                result = await catalog.invoke(approval.tool_name, approval.execution_payload)
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
        try:
            await self._backend_client.record_audit_event(
                access_token=auth.access_token or '',
                tenant_id=auth.tenant_id,
                payload={
                    'conversationId': str(approval.conversation_id) if approval.conversation_id else None,
                    'workflowId': str(approval.workflow_id) if approval.workflow_id else None,
                    'approvalRequestId': str(approval.id),
                    'eventType': 'execution_result',
                    'payload': {
                        'status': 'success',
                        'toolName': approval.tool_name,
                        'actionType': approval.action_type,
                        'summary': approval.summary,
                        'executionPayload': approval.execution_payload,
                        'result': result,
                    },
                },
            )
        except Exception:
            pass
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
