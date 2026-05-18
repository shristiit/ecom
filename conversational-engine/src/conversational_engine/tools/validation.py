from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    path: tuple[str, ...]
    message: str

    def render(self) -> str:
        if not self.path:
            return self.message
        return f'{".".join(self.path)}: {self.message}'


class ToolSchemaValidationError(ValueError):
    def __init__(self, issues: list[ValidationIssue]) -> None:
        self.issues = issues
        message = '; '.join(issue.render() for issue in issues) or 'Tool payload is invalid.'
        super().__init__(message)

    @property
    def required_fields(self) -> list[str]:
        fields: list[str] = []
        for issue in self.issues:
            if issue.path and issue.message == 'required':
                rendered = '.'.join(issue.path)
                if rendered not in fields:
                    fields.append(rendered)
        return fields

    @property
    def prompt(self) -> str:
        rendered = [issue.render() for issue in self.issues[:4]]
        summary = '; '.join(rendered) if rendered else 'The tool payload is invalid.'
        return f'I need to correct the request before I can continue: {summary}.'


def validate_payload(schema: dict[str, Any], payload: Any) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    _validate(schema, payload, (), issues)
    return issues


def _validate(
    schema: dict[str, Any],
    value: Any,
    path: tuple[str, ...],
    issues: list[ValidationIssue],
) -> None:
    expected_types = _type_list(schema.get('type'))
    if expected_types and not any(_matches_type(expected_type, value) for expected_type in expected_types):
        issues.append(ValidationIssue(path, f'expected {"/".join(expected_types)}'))
        return

    if isinstance(value, dict):
        _validate_object(schema, value, path, issues)
        return

    if isinstance(value, list):
        _validate_array(schema, value, path, issues)
        return

    enum_values = schema.get('enum')
    if isinstance(enum_values, list) and value not in enum_values:
        issues.append(ValidationIssue(path, f'expected one of {", ".join(str(item) for item in enum_values)}'))


def _validate_object(
    schema: dict[str, Any],
    value: dict[str, Any],
    path: tuple[str, ...],
    issues: list[ValidationIssue],
) -> None:
    properties = schema.get('properties')
    required = schema.get('required')
    additional_properties = schema.get('additionalProperties', True)

    if isinstance(required, list):
        for key in required:
            if isinstance(key, str) and key not in value:
                issues.append(ValidationIssue((*path, key), 'required'))

    if isinstance(properties, dict):
        for key, property_schema in properties.items():
            if key not in value or not isinstance(property_schema, dict):
                continue
            _validate(property_schema, value[key], (*path, key), issues)

    if additional_properties is False and isinstance(properties, dict):
        allowed = set(properties.keys())
        for key in value:
            if key not in allowed:
                issues.append(ValidationIssue((*path, str(key)), 'unexpected property'))


def _validate_array(
    schema: dict[str, Any],
    value: list[Any],
    path: tuple[str, ...],
    issues: list[ValidationIssue],
) -> None:
    min_items = schema.get('minItems')
    if isinstance(min_items, int) and len(value) < min_items:
        issues.append(ValidationIssue(path, f'expected at least {min_items} item(s)'))

    items_schema = schema.get('items')
    if isinstance(items_schema, dict):
        for index, item in enumerate(value):
            _validate(items_schema, item, (*path, str(index)), issues)


def _type_list(raw_type: Any) -> list[str]:
    if isinstance(raw_type, str):
        return [raw_type]
    if isinstance(raw_type, list):
        return [item for item in raw_type if isinstance(item, str)]
    return []


def _matches_type(expected_type: str, value: Any) -> bool:
    if expected_type == 'object':
        return isinstance(value, dict)
    if expected_type == 'array':
        return isinstance(value, list)
    if expected_type == 'string':
        return isinstance(value, str)
    if expected_type == 'integer':
        return isinstance(value, int) and not isinstance(value, bool)
    if expected_type == 'number':
        return (isinstance(value, int) or isinstance(value, float)) and not isinstance(value, bool)
    if expected_type == 'boolean':
        return isinstance(value, bool)
    if expected_type == 'null':
        return value is None
    return True
