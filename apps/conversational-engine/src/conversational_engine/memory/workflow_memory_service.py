from __future__ import annotations


class WorkflowMemoryService:
    """Placeholder for structured short-term memory persistence."""

    async def hydrate(self, workflow_id: str) -> dict[str, object]:
        return {
            'workflowId': workflow_id,
            'currentTask': None,
            'extractedEntities': {},
            'missingFields': [],
            'activePreviewId': None,
            'activeApprovalId': None,
        }
