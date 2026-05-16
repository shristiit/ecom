from __future__ import annotations

from datetime import UTC, datetime, timedelta

from conversational_engine.contracts.common import PendingActionType
from conversational_engine.keyword_sets import (
    ANALYTICS_DOWNLOAD_PHRASES,
    ANALYTICS_MORE_PHRASES,
    ANALYTICS_QUERY_PHRASES,
    NAVIGATION_HELP_PHRASES,
    ORCHESTRATOR_DOMAIN_KEYWORDS,
    PURCHASE_ORDER_REPORTING_PHRASES,
    REPORTING_PHRASES,
    STOCK_ADJUSTMENT_PHRASES,
    STOCK_QUERY_PHRASES,
    STOCK_RECEIPT_PHRASES,
)

from .parsing import matches_intent_pattern, normalize_text

READ_ONLY_INTENTS = {'stock_query', 'reporting_query', 'navigation_help', 'analytics_query', 'analytics_download'}
WRITE_PENDING_ACTIONS = [
    PendingActionType.CONFIRM.value,
    PendingActionType.CANCEL.value,
    PendingActionType.EDIT.value,
    PendingActionType.SUBMIT_FOR_APPROVAL.value,
]
PENDING_TASK_TTL = timedelta(minutes=30)


def classify_intent(message: str, memory: dict[str, object]) -> str:
    normalized = normalize_text(message)
    pending_task = _active_pending_task(memory)

    if pending_task and _looks_like_pending_follow_up(normalized):
        return str(pending_task['intent'])

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
        r'\blow\s+stock\b',
        r'\bout\s+of\s+stock\b',
        r'\btop[- ]sell(?:ing)?\b',
        r'\bbest[- ]sell(?:ing)?\b',
        r'\bslow[- ]mov(?:ing)?\b',
        r'\bnot\s+sold\b',
        r'\bno\s+(?:recent\s+)?sales\b',
        r'\bstock\s+value\b',
        r'\breorder\s+(?:soon|needed|first|level)\b',
        r'\bnegative\s+stock\b',
        r'\bduplicate\s+sku\b',
        r'\bdata\s+quality\b',
        r'\bstock\s+mismatch\b',
        r'\banomal(?:ous|ies|y)\b',
        r'\bexpired?\s+(?:products?|stock|items?)\b',
        r'\bunapproved\s+adjust',
        r'\bmissing\s+(?:price|cost|sku|size|color|category|fields?)\b',
        r'\bactive\s+(?:products?\s+)?(?:with\s+)?zero\s+price\b',
        r'\breserved\s+(?:stock\s+)?(?:greater|more)\b',
        r'\bpending\s+po.*overstock',
        r'\btransfer.*not\s+received\b',
        r'\bstock.*no\s+(?:location|warehouse)\b',
        r'\brecently\s+added\b',
        r'\bhigh\s+(?:sales|demand).*low\s+stock\b',
        r'\bbelow\s+\d+\s+units?\b',
    ):
        return 'analytics_query'
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
    if any(phrase in normalized for phrase in STOCK_ADJUSTMENT_PHRASES):
        return 'stock_adjustment'
    if any(phrase in normalized for phrase in STOCK_RECEIPT_PHRASES):
        return 'stock_receipt'
    if any(phrase in normalized for phrase in ANALYTICS_QUERY_PHRASES):
        return 'analytics_query'
    if any(phrase in normalized for phrase in ANALYTICS_MORE_PHRASES):
        return memory.get('lastAnalyticsIntent') or 'analytics_query'
    if any(phrase in normalized for phrase in ANALYTICS_DOWNLOAD_PHRASES):
        return 'analytics_download'
    if any(phrase in normalized for phrase in REPORTING_PHRASES):
        return 'reporting_query'
    if any(phrase in normalized for phrase in NAVIGATION_HELP_PHRASES):
        return 'navigation_help'
    if any(phrase in normalized for phrase in STOCK_QUERY_PHRASES):
        return 'stock_query'
    if any(phrase in normalized for phrase in PURCHASE_ORDER_REPORTING_PHRASES):
        return 'reporting_query'
    if pending_task:
        return str(pending_task['intent'])
    if _is_off_topic(normalized):
        return 'off_topic'
    return str(memory.get('intent') or 'navigation_help')


def _is_off_topic(normalized: str) -> bool:
    if any(keyword in normalized for keyword in ORCHESTRATOR_DOMAIN_KEYWORDS):
        return False
    tokens = normalized.split()
    return len(tokens) > 3


def _active_pending_task(memory: dict[str, object]) -> dict[str, object] | None:
    raw = memory.get('pendingTask')
    if not isinstance(raw, dict):
        raw = memory.get('pending_task')
    if not isinstance(raw, dict):
        return None
    updated_at = raw.get('updatedAt')
    if not isinstance(updated_at, str):
        return None
    try:
        parsed = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    if datetime.now(UTC) - parsed > PENDING_TASK_TTL:
        return None
    if not raw.get('intent'):
        return None
    return raw


def _looks_like_pending_follow_up(normalized: str) -> bool:
    if not normalized or normalized.endswith('?'):
        return False
    tokens = normalized.split()
    if len(tokens) <= 4:
        return True
    return ':' in normalized
