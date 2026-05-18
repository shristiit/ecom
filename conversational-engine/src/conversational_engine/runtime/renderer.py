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


def _format_entity_value(value: Any) -> str | None:
    """Convert a tool argument value to a human-readable string."""
    if value is None or value == '' or value == [] or value == {}:
        return None
    if isinstance(value, list):
        if not value:
            return None
        if all(isinstance(item, dict) for item in value):
            if any('sizes' in item or 'colorName' in item or 'color' in item for item in value):
                variants: list[str] = []
                for item in value:
                    color_name = str(item.get('colorName') or item.get('color') or 'Default').strip()
                    raw_sizes = item.get('sizes') if isinstance(item.get('sizes'), list) else [item]
                    size_values = [
                        formatted
                        for raw_size in raw_sizes
                        if isinstance(raw_size, dict)
                        if (formatted := _format_entity_value(raw_size))
                    ]
                    if size_values:
                        variants.append(f'{color_name} [{", ".join(size_values)}]')
                    elif color_name:
                        variants.append(color_name)
                if variants:
                    return '; '.join(variants)
            _name_keys = ('colorName', 'name', 'label', 'title', 'id')
            names = []
            for item in value:
                for k in _name_keys:
                    if item.get(k):
                        names.append(str(item[k]))
                        break
            if names:
                return ', '.join(names)
            return f'{len(value)} item(s)'
        return ', '.join(str(item) for item in value)
    if isinstance(value, dict):
        size_label = value.get('sizeLabel') or value.get('size')
        if isinstance(size_label, str) and size_label.strip():
            stock_by_location = value.get('stockByLocation')
            if isinstance(stock_by_location, list) and stock_by_location:
                stock_parts = []
                for stock in stock_by_location:
                    if not isinstance(stock, dict):
                        continue
                    quantity = stock.get('quantity')
                    location_id = str(stock.get('locationId') or '').strip()
                    if quantity is None:
                        continue
                    stock_parts.append(f'{quantity} @ {location_id}' if location_id else str(quantity))
                if stock_parts:
                    return f'{size_label.strip().upper()} ({", ".join(stock_parts)})'
            return size_label.strip().upper()
        parts = []
        for k, v in value.items():
            formatted = _format_entity_value(v)
            if formatted is None:
                continue
            parts.append(f'{k.replace("_", " ")}: {formatted}')
        return ', '.join(parts) if parts else None
    return str(value)


def render_clarification(message: str, required_inputs: list[str]) -> list[MessageBlock]:
    return [
        ClarificationBlock(prompt=message, required_fields=required_inputs),
    ]


def render_tool_result(
    message: str,
    tool_name: str,
    tool_result: dict[str, Any],
    *,
    include_table: bool = True,
) -> list[MessageBlock]:
    blocks: list[MessageBlock] = [TextBlock(content=message)]

    rows = tool_result.get('rows')
    if include_table and isinstance(rows, list) and rows and all(isinstance(row, dict) for row in rows):
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
    actor: str,
) -> list[MessageBlock]:
    entities = [
        PreviewEntity(label=key.replace('_', ' ').capitalize(), value=formatted)
        for key, value in tool_arguments.items()
        if (formatted := _format_entity_value(value)) is not None
    ][:8]
    return [
        TextBlock(content=message),
        PreviewBlock(
            action_type=tool_name.replace('.', ' ').title(),
            actor=actor,
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
    actor: str,
    warnings: list[str] | None = None,
) -> list[MessageBlock]:
    entities = [
        PreviewEntity(label=key.replace('_', ' ').capitalize(), value=formatted)
        for key, value in tool_arguments.items()
        if (formatted := _format_entity_value(value)) is not None
    ][:8]
    return [
        TextBlock(content=message),
        PreviewBlock(
            action_type=tool_name.replace('.', ' ').title(),
            actor=actor,
            entities=entities,
            warnings=list(warnings or []),
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


def render_navigation_blocks(routes: list[dict[str, str]]) -> list[MessageBlock]:
    blocks: list[MessageBlock] = []
    for route in routes:
        blocks.append(
            NavigationBlock(
                label=route.get('label') or 'Open screen',
                href=route.get('href') or '/',
                description=route.get('description') or '',
            )
        )
    return blocks
