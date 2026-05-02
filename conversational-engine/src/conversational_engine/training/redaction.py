from __future__ import annotations

import re
from typing import Any

EMAIL_RE = re.compile(r'[\w.+-]+@[\w.-]+\.\w+')
UUID_RE = re.compile(r'\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b', re.IGNORECASE)
TOKEN_RE = re.compile(r'Bearer\s+[A-Za-z0-9._-]+', re.IGNORECASE)
PHONE_RE = re.compile(r'\b(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,3}\d{3,4}\b')
ADDRESS_RE = re.compile(
    r'\b\d{1,6}[A-Za-z]?(?:\s+[A-Za-z][A-Za-z0-9.\-]*){1,5}\s(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|way|boulevard|blvd)\b',
    re.IGNORECASE,
)
MONGO_URI_RE = re.compile(r'mongodb(?:\+srv)?://[^\s\'"]+', re.IGNORECASE)
AWS_ACCESS_KEY_RE = re.compile(r'\bAKIA[0-9A-Z]{16}\b')
AWS_SECRET_RE = re.compile(r'(?i)(aws_secret_access_key|secret_access_key)\s*[:=]\s*[A-Za-z0-9/+=]{12,}')
API_KEY_RE = re.compile(
    r'(?i)\b(?:api[_-]?key|token|secret|password)\b\s*[:=]\s*[A-Za-z0-9._\-+/=]{8,}'
)


def redact_text(value: str) -> str:
    value = EMAIL_RE.sub('[redacted-email]', value)
    value = UUID_RE.sub('[redacted-uuid]', value)
    value = TOKEN_RE.sub('Bearer [redacted-token]', value)
    value = MONGO_URI_RE.sub('[redacted-mongo-uri]', value)
    value = AWS_ACCESS_KEY_RE.sub('[redacted-aws-access-key]', value)
    value = AWS_SECRET_RE.sub('[redacted-aws-secret]', value)
    value = API_KEY_RE.sub('[redacted-secret]', value)
    value = ADDRESS_RE.sub('[redacted-address]', value)
    value = PHONE_RE.sub('[redacted-phone]', value)
    return value


def redact_payload(value: Any) -> Any:
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, list):
        return [redact_payload(item) for item in value]
    if isinstance(value, dict):
        return {str(key): redact_payload(item) for key, item in value.items()}
    return value
