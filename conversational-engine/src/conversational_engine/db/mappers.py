from __future__ import annotations

from pydantic import TypeAdapter

from conversational_engine.contracts.common import ChatMessage, ConversationDetail, MessageBlock, WorkflowState

MESSAGE_BLOCKS_ADAPTER = TypeAdapter(list[MessageBlock])


def preview_text(blocks: list[dict[str, object]]) -> str | None:
    for block in blocks:
        if isinstance(block, dict):
            if isinstance(block.get('content'), str):
                return block['content']
            if isinstance(block.get('message'), str):
                return block['message']
            if isinstance(block.get('prompt'), str):
                return block['prompt']
    return None


def message_from_row(row: dict[str, object]) -> ChatMessage:
    return ChatMessage.model_validate(
        {
            'id': row['id'],
            'role': row['role'],
            'blocks': MESSAGE_BLOCKS_ADAPTER.validate_python(row['blocks']),
            'createdAt': row['created_at'],
        }
    )


def conversation_detail_from_row(row: dict[str, object], *, id_field: str = 'id') -> ConversationDetail:
    return ConversationDetail(
        id=row[id_field],
        title=row['title'],
        created_at=row['created_at'],
        updated_at=row['updated_at'],
    )


def workflow_state_from_row(row: dict[str, object]) -> WorkflowState:
    return WorkflowState(
        id=row['id'],
        status=row['status'],
        current_task=row['current_task'],
        extracted_entities=row.get('extracted_entities') or {},
        missing_fields=row.get('missing_fields') or [],
        active_preview_id=row.get('active_preview_id'),
        active_approval_id=row.get('active_approval_id'),
    )
