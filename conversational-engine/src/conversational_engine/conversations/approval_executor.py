from __future__ import annotations

from conversational_engine.clients.backend import BackendClient
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import ErrorBlock, WorkflowStatus
from conversational_engine.orchestrator.service import OrchestratorOutcome
from conversational_engine.runtime.renderer import render_tool_result
from conversational_engine.tools.catalog import SemanticToolCatalog


class RuntimeApprovalExecutor:
    def __init__(self, backend_client: BackendClient) -> None:
        self._backend_client = backend_client

    async def execute(self, *, auth: AuthContext, approval) -> OrchestratorOutcome:
        if approval.status == 'rejected':
            return OrchestratorOutcome(
                blocks=[
                    ErrorBlock(
                        title='Approval rejected',
                        message='The approval request was rejected and no action was executed.',
                    )
                ],
                status=WorkflowStatus.FAILED,
                current_task='approval_rejected',
                extracted_entities={
                    'lastApprovalId': str(approval.id),
                    'lastApprovalStatus': approval.status,
                },
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
            result = await catalog.invoke(approval.tool_name, approval.execution_payload)
        except Exception as exc:
            return OrchestratorOutcome(
                blocks=[ErrorBlock(title='Approval execution failed', message=str(exc))],
                status=WorkflowStatus.FAILED,
                current_task='approval_execution_failed',
                extracted_entities={
                    'lastApprovalId': str(approval.id),
                    'lastApprovalStatus': approval.status,
                },
                missing_fields=[],
                active_approval_id=None,
            )

        return OrchestratorOutcome(
            blocks=render_tool_result(
                'Approval granted and the requested action has been executed.',
                approval.tool_name,
                result,
            ),
            status=WorkflowStatus.COMPLETED,
            current_task='approval_execution_completed',
            extracted_entities={
                'lastApprovalId': str(approval.id),
                'lastApprovalStatus': approval.status,
                'lastToolName': approval.tool_name,
            },
            missing_fields=[],
            active_approval_id=None,
        )
