from __future__ import annotations

import re
from typing import Any

EMAIL_RE = re.compile(r'[\w.+-]+@[\w.-]+\.\w+')
UUID_RE = re.compile(r'\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b', re.IGNORECASE)
TOKEN_RE = re.compile(r'Bearer\s+[A-Za-z0-9._-]+', re.IGNORECASE)


def redact_text(value: str) -> str:
    value = EMAIL_RE.sub('[redacted-email]', value)
    value = UUID_RE.sub('[redacted-uuid]', value)
    value = TOKEN_RE.sub('Bearer [redacted-token]', value)
    return value


def redact_payload(value: Any) -> Any:
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, list):
        return [redact_payload(item) for item in value]
    if isinstance(value, dict):
        return {str(key): redact_payload(item) for key, item in value.items()}
    return value
