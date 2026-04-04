from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def strict_object_schema(*, properties: Mapping[str, dict[str, Any]]) -> dict[str, Any]:
    return {
        'type': 'object',
        'additionalProperties': False,
        'properties': dict(properties),
        'required': [],
    }


def nullable(schema: dict[str, Any]) -> dict[str, Any]:
    return {'anyOf': [schema, {'type': 'null'}]}


def string_schema() -> dict[str, Any]:
    return {'type': 'string'}


def int_schema() -> dict[str, Any]:
    return {'type': 'integer'}


def bool_schema() -> dict[str, Any]:
    return {'type': 'boolean'}


def string_list_schema() -> dict[str, Any]:
    return {'type': 'array', 'items': {'type': 'string'}}

