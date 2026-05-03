from __future__ import annotations

import json
from typing import Any


def strip_markdown_fences(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith('```'):
        lines = cleaned.splitlines()
        if lines:
            lines = lines[1:]
        while lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        cleaned = '\n'.join(lines).strip()
    return cleaned


def parse_json_value(raw: str, *, source: str) -> Any:
    cleaned = strip_markdown_fences(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f'{source} returned invalid JSON: {exc.msg}') from exc


def parse_json_object(raw: str, *, source: str) -> dict[str, Any]:
    parsed = parse_json_value(raw, source=source)
    if not isinstance(parsed, dict):
        raise RuntimeError(f'{source} returned a non-object JSON payload')
    return parsed
