from __future__ import annotations

from conversational_engine.contracts.common import PendingActionType

from .parsing import matches_intent_pattern, normalize_text

READ_ONLY_INTENTS = {'stock_query', 'reporting_query', 'navigation_help'}
WRITE_PENDING_ACTIONS = [
    PendingActionType.CONFIRM.value,
    PendingActionType.CANCEL.value,
    PendingActionType.EDIT.value,
    PendingActionType.SUBMIT_FOR_APPROVAL.value,
]


def classify_intent(message: str, memory: dict[str, object]) -> str:
    normalized = normalize_text(message)

    if memory.get('intent') and any(
        word in normalized for word in ['yes', 'update', 'change', 'it', 'that', 'for', 'with', 'at']
    ):
        return str(memory['intent'])

    if matches_intent_pattern(
        message,
        r'\bcreate\s+(?:a\s+|an\s+)?po\b',
        r'\bcreate\s+(?:a\s+|an\s+)?purchase\s+order\b',
        r'\bpo\s+draft\b',
        r'\bnew\s+po\b',
        r'\bnew\s+purchase\s+order\b',
    ):
        return 'po_create'
    if matches_intent_pattern(message, r'\breceive\s+(?:a\s+|the\s+)?po\b', r'\breceive\s+purchase\s+order\b'):
        return 'po_receive'
    if matches_intent_pattern(message, r'\bclose\s+(?:a\s+|the\s+)?po\b', r'\bclose\s+purchase\s+order\b'):
        return 'po_close'
    if matches_intent_pattern(
        message,
        r'\bupdate\s+(?:a\s+|the\s+)?po\b',
        r'\bedit\s+(?:a\s+|the\s+)?po\b',
        r'\bupdate\s+purchase\s+order\b',
        r'\bedit\s+purchase\s+order\b',
    ):
        return 'po_update'
    if matches_intent_pattern(
        message,
        r'\bcreate\s+(?:a\s+|an\s+)?sales\s+order\b',
        r'\bnew\s+sales\s+order\b',
        r'\bcreate\s+(?:a\s+|an\s+)?so\b',
        r'\bnew\s+so\b',
        r'\bcreate\s+(?:an\s+)?invoice\b',
        r'\bnew\s+invoice\b',
    ):
        return 'so_create'
    if matches_intent_pattern(
        message,
        r'\bupdate\s+(?:a\s+|the\s+)?sales\s+order\b',
        r'\bedit\s+(?:a\s+|the\s+)?sales\s+order\b',
        r'\bupdate\s+(?:a\s+|the\s+)?so\b',
        r'\bedit\s+(?:a\s+|the\s+)?so\b',
        r'\bupdate\s+(?:an\s+|the\s+)?invoice\b',
        r'\bedit\s+(?:an\s+|the\s+)?invoice\b',
    ):
        return 'so_update'
    if matches_intent_pattern(
        message,
        r'\bdispatch\s+(?:a\s+|the\s+)?sales\s+order\b',
        r'\bship\s+(?:a\s+|the\s+)?sales\s+order\b',
        r'\bdispatch\s+(?:an\s+|the\s+)?invoice\b',
        r'\bship\s+(?:an\s+|the\s+)?invoice\b',
    ):
        return 'so_dispatch'
    if matches_intent_pattern(
        message,
        r'\bcancel\s+(?:a\s+|the\s+)?sales\s+order\b',
        r'\bcancel\s+(?:a\s+|the\s+)?so\b',
        r'\bcancel\s+(?:an\s+|the\s+)?invoice\b',
    ):
        return 'so_cancel'
    if matches_intent_pattern(
        message,
        r'\bcreate\s+(?:a\s+|an\s+)?product\b',
        r'\bnew\s+product\b',
        r'\badd\s+(?:a\s+|new\s+)?product\b',
    ):
        return 'product_create'
    if matches_intent_pattern(
        message,
        r'\bupdate\s+(?:a\s+|the\s+)?product\b',
        r'\bedit\s+(?:a\s+|the\s+)?product\b',
        r'\badd\s+(?:a\s+|the\s+)?sku\b',
        r'\badd\s+(?:a\s+|the\s+)?size\b',
    ):
        return 'product_update'
    if 'transfer' in normalized:
        return 'stock_transfer'
    if any(phrase in normalized for phrase in ['write off', 'damaged', 'adjust', 'cycle count']):
        return 'stock_adjustment'
    if 'receive stock' in normalized or 'stock receipt' in normalized:
        return 'stock_receipt'
    if any(phrase in normalized for phrase in ['report', 'summary', 'movement', 'receipts', 'receipt summary']):
        return 'reporting_query'
    if any(phrase in normalized for phrase in ['help', 'where is', 'how do i', 'how to', 'screen', 'navigate']):
        return 'navigation_help'
    if any(phrase in normalized for phrase in ['stock', 'inventory', 'sku']):
        return 'stock_query'
    if any(phrase in normalized for phrase in ['purchase order', 'po ']):
        return 'reporting_query'
    return str(memory.get('intent') or 'navigation_help')
