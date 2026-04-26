from __future__ import annotations

import re
from typing import Any

_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE,
)


def is_uuid(value: str) -> bool:
    return bool(_UUID_RE.match(value))


def best_match(
    items: list[dict[str, object]], query: str, *fields: str
) -> dict[str, object] | None:
    """Return the first item whose any of the given fields matches query (exact then partial)."""
    ql = query.lower().strip()
    for item in items:
        for field in fields:
            if str(item.get(field) or '').lower() == ql:
                return item
    for item in items:
        for field in fields:
            if ql in str(item.get(field) or '').lower():
                return item
    return None


def search_rows(
    items: list[dict[str, object]],
    query: str,
    *fields: str,
    limit: int = 10,
) -> list[dict[str, object]]:
    ql = query.lower().strip()
    exact_matches: list[dict[str, object]] = []
    partial_matches: list[dict[str, object]] = []

    for item in items:
        values = [str(item.get(field) or '') for field in fields]
        lowered = [value.lower() for value in values]
        if any(value == ql for value in lowered):
            exact_matches.append(item)
            continue
        if any(ql in value for value in lowered):
            partial_matches.append(item)

    return (exact_matches + partial_matches)[:limit]


def object_schema(properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {
        'type': 'object',
        'additionalProperties': False,
        'properties': properties,
        'required': required or [],
    }
