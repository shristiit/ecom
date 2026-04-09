from __future__ import annotations

from typing import Any
from uuid import UUID

from conversational_engine.contracts.common import (
    ApprovalPendingBlock,
    ClarificationBlock,
    ConfirmationRequiredBlock,
    ErrorBlock,
    MessageBlock,
    NavigationBlock,
    PendingActionType,
    PreviewBlock,
    PreviewEntity,
    SuccessBlock,
    TableColumn,
    TableResultBlock,
    TextBlock,
)


def render_clarification(message: str, required_inputs: list[str]) -> list[MessageBlock]:
    return [
        TextBlock(content=message),
        ClarificationBlock(prompt=message, required_fields=required_inputs),
    ]


def render_tool_result(message: str, tool_name: str, tool_result: dict[str, Any]) -> list[MessageBlock]:
    blocks: list[MessageBlock] = [TextBlock(content=message)]

    rows = tool_result.get('rows')
    if isinstance(rows, list) and rows and all(isinstance(row, dict) for row in rows):
        first = rows[0]
        columns = [TableColumn(key=key, label=key.replace('_', ' ').title()) for key in first.keys()]
        blocks.append(TableResultBlock(title=tool_name.replace('.', ' ').title(), columns=columns[:12], rows=rows[:25]))

    if tool_name == 'navigation.find_screen':
        for row in rows or []:
            if isinstance(row, dict):
                blocks.append(
                    NavigationBlock(
                        label=str(row.get('label') or 'Open screen'),
                        href=str(row.get('href') or '/'),
                        description=str(row.get('description') or ''),
                    )
                )

    if not rows and isinstance(tool_result.get('result'), dict):
        blocks.append(
            SuccessBlock(
                title='Action executed',
                message=message,
            )
        )

    return blocks


def render_approval_pending(
    *,
    message: str,
    approval_id: UUID,
    tool_name: str,
    tool_arguments: dict[str, Any],
) -> list[MessageBlock]:
    entities = [
        PreviewEntity(label=key, value=str(value))
        for key, value in tool_arguments.items()
        if value is not None
    ][:8]
    return [
        TextBlock(content=message),
        PreviewBlock(
            action_type=tool_name.replace('.', ' ').title(),
            actor='AI runtime',
            entities=entities,
            warnings=[],
            approval_required=True,
            next_step='Approval is required before execution continues.',
        ),
        ApprovalPendingBlock(
            approval_id=approval_id,
            status='pending',
            message='Approval request created and waiting for review.',
        ),
    ]


def render_confirmation_required(
    *,
    message: str,
    tool_name: str,
    tool_arguments: dict[str, Any],
    approval_required: bool,
    confirmation_prompt: str,
) -> list[MessageBlock]:
    entities = [
        PreviewEntity(label=key, value=str(value))
        for key, value in tool_arguments.items()
        if value is not None
    ][:8]
    return [
        TextBlock(content=message),
        PreviewBlock(
            action_type=tool_name.replace('.', ' ').title(),
            actor='AI runtime',
            entities=entities,
            warnings=[],
            approval_required=approval_required,
            next_step=confirmation_prompt,
        ),
        ConfirmationRequiredBlock(
            prompt=confirmation_prompt,
            allowed_actions=[
                PendingActionType.CONFIRM,
                PendingActionType.CANCEL,
                PendingActionType.EDIT,
            ],
        ),
    ]


def render_failure(message: str) -> list[MessageBlock]:
    return [
        ErrorBlock(
            title='Run failed',
            message=message,
        )
    ]
