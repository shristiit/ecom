from __future__ import annotations


class AuditService:
    """Placeholder audit sink until backend audit integration lands."""

    async def record(self, event_type: str, payload: dict[str, object]) -> dict[str, object]:
        return {
            'eventType': event_type,
            'recorded': False,
            'payload': payload,
        }
