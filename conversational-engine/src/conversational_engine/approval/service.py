from __future__ import annotations


class ApprovalService:
    """Placeholder approval service until backend integration lands."""

    async def evaluate(self, action_type: str) -> dict[str, object]:
        return {
            'actionType': action_type,
            'requiresApproval': False,
            'reason': 'Approval integration not implemented yet.',
        }
