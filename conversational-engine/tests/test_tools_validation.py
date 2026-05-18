from __future__ import annotations

from conversational_engine.tools.validation import ToolSchemaValidationError, ValidationIssue


def test_tool_schema_validation_error_required_fields_excludes_unexpected_properties():
    error = ToolSchemaValidationError(
        [
            ValidationIssue(('supplierId',), 'unexpected property'),
            ValidationIssue(('lines',), 'required'),
            ValidationIssue(('inputSchema',), 'unexpected property'),
        ]
    )

    assert error.required_fields == ['lines']
    assert 'supplierId: unexpected property' in error.prompt
    assert 'lines: required' in error.prompt
