from __future__ import annotations

import logging
from uuid import UUID

from conversational_engine.clients.backend import BackendClient
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import (
    ClarificationBlock,
    ErrorBlock,
    WorkflowStatus,
)
from conversational_engine.orchestrator.service import OrchestratorOutcome
from conversational_engine.runtime.renderer import render_approval_pending, render_tool_result
from conversational_engine.tools.catalog import SemanticToolCatalog

logger = logging.getLogger(__name__)


class RuntimeDecisionHandler:
    def __init__(self, backend_client: BackendClient) -> None:
        self._backend_client = backend_client

    @staticmethod
    def _restore_pending_approval_state(memory: dict[str, object]) -> tuple[str, dict[str, object]]:
        original = memory.get('_pendingApprovalUpdateOriginal')
        tool_name = str(memory.get('toolName') or '')
        execution_payload = memory.get('executionPayload')

        if isinstance(original, dict):
            original_tool_name = original.get('toolName')
            original_execution_payload = original.get('executionPayload')
            original_preview = original.get('preview')
            original_summary = original.get('summary')
            if isinstance(original_tool_name, str) and original_tool_name:
                tool_name = original_tool_name
                memory['toolName'] = original_tool_name
            if isinstance(original_execution_payload, dict):
                execution_payload = original_execution_payload
                memory['executionPayload'] = original_execution_payload
            if isinstance(original_preview, dict):
                memory['preview'] = original_preview
            if original_summary is not None:
                memory['summary'] = str(original_summary)

        memory['activeApprovalStatus'] = 'pending'
        memory.pop('_pendingApprovalUpdateOriginal', None)
        memory.pop('_approvalOperation', None)
        return tool_name, execution_payload if isinstance(execution_payload, dict) else {}

    async def apply(
        self,
        *,
        auth: AuthContext,
        conversation_id,
        workflow_id,
        workflow,
        decision: str,
    ) -> OrchestratorOutcome:
        memory = dict(workflow.extracted_entities or {})
        tool_name = str(memory.get('toolName') or '')
        execution_payload = memory.get('executionPayload')
        active_approval_id = memory.get('activeApprovalId')
        approval_operation = str(memory.get('_approvalOperation') or 'create_new')
        is_pending_approval_update = (
            approval_operation == 'update_existing'
            and isinstance(active_approval_id, str)
            and bool(active_approval_id)
            and memory.get('activeApprovalStatus') == 'pending'
        )

        if decision == 'cancel':
            memory.pop('_pendingActions', None)
            memory.pop('_pendingPrompt', None)
            if is_pending_approval_update:
                restored_tool_name, restored_payload = self._restore_pending_approval_state(memory)
                approval_id = UUID(str(active_approval_id))
                return OrchestratorOutcome(
                    blocks=render_approval_pending(
                        message='Update canceled. The original approval request is still pending.',
                        approval_id=approval_id,
                        tool_name=restored_tool_name,
                        tool_arguments=restored_payload,
                    ),
                    status=WorkflowStatus.AWAITING_APPROVAL,
                    current_task='awaiting_approval',
                    extracted_entities=memory,
                    missing_fields=[],
                    active_approval_id=approval_id,
                )
            return OrchestratorOutcome(
                blocks=[
                    ErrorBlock(
                        title='Workflow canceled',
                        message='No changes were made.',
                    )
                ],
                status=WorkflowStatus.FAILED,
                current_task='runtime_confirmation_canceled',
                extracted_entities=memory,
                missing_fields=[],
            )

        if decision == 'edit':
            memory.pop('_pendingActions', None)
            memory.pop('_pendingPrompt', None)
            return OrchestratorOutcome(
                blocks=[
                    ClarificationBlock(
                        prompt='Reply with the corrections or additional details and I will update this draft.',
                        required_fields=[],
                    )
                ],
                status=WorkflowStatus.NEEDS_INPUT,
                current_task='runtime_confirmation_editing',
                extracted_entities=memory,
                missing_fields=[],
            )

        if decision not in {'confirm', 'submit_for_approval'}:
            return OrchestratorOutcome(
                blocks=[
                    ErrorBlock(
                        title='Unsupported decision',
                        message=f'Unhandled workflow decision: {decision}',
                    )
                ],
                status=WorkflowStatus.FAILED,
                current_task='runtime_confirmation_invalid',
                extracted_entities=memory,
                missing_fields=[],
            )

        if not tool_name or not isinstance(execution_payload, dict):
            return OrchestratorOutcome(
                blocks=[
                    ErrorBlock(
                        title='Missing execution payload',
                        message='The runtime could not continue because the prepared tool payload is incomplete.',
                    )
                ],
                status=WorkflowStatus.FAILED,
                current_task='runtime_confirmation_missing_payload',
                extracted_entities=memory,
                missing_fields=[],
            )

        memory.pop('_pendingActions', None)
        memory.pop('_pendingPrompt', None)

        if bool(memory.get('approvalRequired')):
            payload = {
                'actionType': tool_name,
                'toolName': tool_name,
                'conversationId': str(conversation_id),
                'workflowId': str(workflow_id),
                'summary': str(memory.get('summary') or tool_name),
                'reason': str(memory.get('approvalReason') or 'Approval required by policy.'),
                'preview': memory.get('preview') if isinstance(memory.get('preview'), dict) else {},
                'executionPayload': execution_payload,
            }
            try:
                if is_pending_approval_update:
                    approval = await self._backend_client.update_approval_request(
                        access_token=auth.access_token or '',
                        tenant_id=auth.tenant_id,
                        approval_id=str(active_approval_id),
                        payload=payload,
                    )
                    approval_message = 'Confirmation recorded. The pending approval request has been updated.'
                else:
                    approval = await self._backend_client.create_approval_request(
                        access_token=auth.access_token or '',
                        tenant_id=auth.tenant_id,
                        payload=payload,
                    )
                    approval_message = 'Confirmation recorded. The request has been submitted for approval.'
            except Exception:
                logger.exception('Failed to persist approval request for workflow %s', workflow_id)
                return OrchestratorOutcome(
                    blocks=[
                        ErrorBlock(
                            title='Approval update failed',
                            message='The approval request could not be saved. Please try again.',
                        )
                    ],
                    status=WorkflowStatus.FAILED,
                    current_task='approval_request_failed',
                    extracted_entities=memory,
                    missing_fields=[],
                )
            memory['activeApprovalId'] = str(approval.id)
            memory['activeApprovalStatus'] = approval.status
            memory.pop('_pendingApprovalUpdateOriginal', None)
            memory.pop('_approvalOperation', None)
            return OrchestratorOutcome(
                blocks=render_approval_pending(
                    message=approval_message,
                    approval_id=approval.id,
                    tool_name=tool_name,
                    tool_arguments=execution_payload,
                ),
                status=WorkflowStatus.AWAITING_APPROVAL,
                current_task='awaiting_approval',
                extracted_entities=memory,
                missing_fields=[],
                active_approval_id=approval.id,
            )

        catalog = SemanticToolCatalog(backend=self._backend_client, auth=auth)
        try:
            result = await catalog.invoke(tool_name, execution_payload)
        except Exception:
            logger.exception('Failed to execute runtime confirmation tool %s', tool_name)
            return OrchestratorOutcome(
                blocks=[
                    ErrorBlock(
                        title='Execution failed',
                        message='The action could not be completed after confirmation.',
                    )
                ],
                status=WorkflowStatus.FAILED,
                current_task='runtime_confirmation_execution_failed',
                extracted_entities=memory,
                missing_fields=[],
            )
        memory['lastToolName'] = tool_name
        memory.pop('activeApprovalId', None)
        memory.pop('activeApprovalStatus', None)
        memory.pop('_pendingApprovalUpdateOriginal', None)
        memory.pop('_approvalOperation', None)
        return OrchestratorOutcome(
            blocks=render_tool_result(
                'Confirmation recorded and the requested action has been executed.',
                tool_name,
                result,
            ),
            status=WorkflowStatus.COMPLETED,
            current_task='completed',
            extracted_entities=memory,
            missing_fields=[],
        )
