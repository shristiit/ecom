from __future__ import annotations

import hashlib
import json
import re

from conversational_engine.agents.base import Agent
from conversational_engine.agents.parsing import extract_color_names, json_safe_row, normalize
from conversational_engine.agents.types import AgentTurnResult
from conversational_engine.clients.backend import BackendClient
from conversational_engine.config.model_routing import ModelRouting
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import (
    ConversationDetail,
    ErrorBlock,
    MessageBlock,
    TableColumn,
    TableResultBlock,
    TextBlock,
    WorkflowState,
)
from conversational_engine.keyword_sets import ANALYTICS_DOWNLOAD_PHRASES, ANALYTICS_MORE_PHRASES

ANALYTICS_SUB_TYPES: dict[str, tuple[str, str, list[str]]] = {
    'low_stock': (
        'analytics_low_stock',
        'Low Stock Products',
        ['product_name', 'sku_code', 'size_label', 'color_name', 'location_name', 'on_hand', 'reorder_level'],
    ),
    'out_of_stock': (
        'analytics_out_of_stock',
        'Out of Stock Products',
        ['product_name', 'sku_code', 'size_label', 'color_name', 'category'],
    ),
    'top_selling': (
        'analytics_top_selling',
        'Top Selling Products',
        ['product_name', 'sku_code', 'color_name', 'size_label', 'category', 'units_sold', 'revenue'],
    ),
    'slow_moving': (
        'analytics_slow_moving',
        'Slow Moving Products',
        ['product_name', 'sku_code', 'color_name', 'size_label', 'last_sold_date', 'on_hand'],
    ),
    'no_recent_sales': (
        'analytics_no_recent_sales',
        'Products with No Recent Sales',
        ['product_name', 'sku_code', 'color_name', 'size_label', 'last_sold_date', 'on_hand'],
    ),
    'reorder_needed': (
        'analytics_reorder_needed',
        'Products Needing Reorder',
        ['product_name', 'sku_code', 'size_label', 'on_hand', 'reorder_level', 'suggested_order_qty'],
    ),
    'stock_value': (
        'analytics_stock_value',
        'Stock Value',
        ['product_name', 'sku_code', 'size_label', 'on_hand', 'unit_cost', 'total_value'],
    ),
    'high_demand_low_stock': (
        'analytics_high_demand_low_stock',
        'High Demand, Low Stock Products',
        ['product_name', 'sku_code', 'size_label', 'units_sold', 'on_hand', 'days_of_stock_left'],
    ),
    'recently_added': (
        'analytics_recently_added',
        'Recently Added Products',
        ['product_name', 'style_code', 'category', 'brand', 'base_price', 'status', 'created_at'],
    ),
    'negative_stock': (
        'analytics_data_quality',
        'Negative Stock',
        ['product_name', 'sku_code', 'size_label', 'location_name', 'on_hand'],
    ),
    'stock_mismatch': (
        'analytics_data_quality',
        'Stock Count Mismatch',
        ['product_name', 'sku_code', 'size_label', 'system_qty', 'warehouse_qty', 'variance'],
    ),
    'duplicate_sku': ('analytics_data_quality', 'Duplicate SKUs', ['sku_code', 'product_name', 'count']),
    'same_barcode_diff_name': (
        'analytics_data_quality',
        'Same Barcode, Different Names',
        ['barcode', 'product_names', 'count'],
    ),
    'inactive_with_stock': (
        'analytics_data_quality',
        'Inactive Products with Stock',
        ['product_name', 'sku_code', 'status', 'on_hand'],
    ),
    'active_zero_price': (
        'analytics_data_quality',
        'Active Products with Zero/Missing Price',
        ['product_name', 'style_code', 'base_price', 'status'],
    ),
    'missing_fields': (
        'analytics_data_quality',
        'Products with Missing Fields',
        ['product_name', 'style_code', 'missing_fields'],
    ),
    'sales_no_movement': (
        'analytics_data_quality',
        'Sales Without Movement History',
        ['product_name', 'sku_code', 'sales_count', 'movement_count'],
    ),
    'reorder_exceeds_max': (
        'analytics_data_quality',
        'Reorder Level > Max Stock',
        ['product_name', 'sku_code', 'reorder_level', 'max_stock'],
    ),
    'expired_active': (
        'analytics_data_quality',
        'Expired Products Still Active',
        ['product_name', 'sku_code', 'expiry_date', 'status'],
    ),
    'returns_not_restocked': (
        'analytics_data_quality',
        'Returns Not Restocked',
        ['product_name', 'sku_code', 'return_qty', 'restocked_qty'],
    ),
    'stock_no_location': (
        'analytics_data_quality',
        'Stock Without Warehouse Location',
        ['product_name', 'sku_code', 'on_hand'],
    ),
    'abnormal_sales_spike': (
        'analytics_data_quality',
        'Abnormal Sales Spikes',
        ['product_name', 'sku_code', 'spike_date', 'spike_qty', 'avg_daily_sales'],
    ),
    'sold_before_added': (
        'analytics_data_quality',
        'Sold Before Added to Inventory',
        ['product_name', 'sku_code', 'first_sale_date', 'inventory_created_at'],
    ),
    'multiple_cost_prices': (
        'analytics_data_quality',
        'Multiple Cost Prices per SKU',
        ['sku_code', 'product_name', 'supplier_name', 'cost_price'],
    ),
    'pending_po_overstocked': (
        'analytics_data_quality',
        'Pending POs but Overstocked',
        ['product_name', 'sku_code', 'on_hand', 'max_stock', 'pending_po_qty'],
    ),
    'transfer_not_received': (
        'analytics_data_quality',
        'Transfers Not Received',
        ['product_name', 'sku_code', 'from_location', 'to_location', 'qty', 'transfer_date'],
    ),
    'reserved_exceeds_available': (
        'analytics_data_quality',
        'Reserved > Available Stock',
        ['product_name', 'sku_code', 'available', 'reserved'],
    ),
    'incorrect_pricing_rules': (
        'analytics_data_quality',
        'Incorrect Pricing Rules',
        ['product_name', 'sku_code', 'issue_type', 'details'],
    ),
    'unapproved_adjustments': (
        'analytics_data_quality',
        'Unapproved Manual Adjustments',
        ['product_name', 'sku_code', 'adjusted_by', 'qty_change', 'adjustment_date'],
    ),
}

_SUB_TYPE_PATTERNS: list[tuple[str, list[str]]] = [
    ('negative_stock', [r'\bnegative\s+stock\b']),
    ('stock_mismatch', [r'\bstock.*mismatch\b', r'\bcount.*(?:not\s+match|mismatch)\b', r'\bwarehouse\s+records?\b']),
    ('duplicate_sku', [r'\bduplicate\s+sku\b', r'\bsame\s+sku\b']),
    ('same_barcode_diff_name', [r'\bsame\s+barcode\b', r'\bduplicate\s+barcode\b']),
    ('inactive_with_stock', [r'\binactive.*stock\b', r'\bstock.*inactive\b', r'\bmarked\s+inactive\b']),
    ('active_zero_price', [r'\bzero\s+price\b', r'\bmissing\s+price\b', r'\bno\s+price\b', r'\bactive.*zero\s+price\b']),
    ('missing_fields', [r'\bmissing\s+(?:size|color|category|sku|fields?|info)\b', r'\bincomplete\s+(?:product|data)\b']),
    ('sales_no_movement', [r'\bsales.*no\s+(?:movement|history)\b', r'\bsold.*no\s+(?:movement|history)\b']),
    (
        'reorder_exceeds_max',
        [r'\breorder\s+(?:level|point).*(?:higher|greater|more)\s+than.*max\b', r'\breorder.*exceeds?\s+max\b'],
    ),
    ('expired_active', [r'\bexpir(?:ed?|y)\b']),
    ('returns_not_restocked', [r'\breturns?\s+not\s+(?:restocked|added back)\b', r'\bcustomer\s+returns?\b']),
    ('stock_no_location', [r'\bstock.*no\s+(?:location|warehouse)\b', r'\bno\s+(?:location|warehouse).*assigned\b']),
    ('abnormal_sales_spike', [r'\babnormal\b', r'\bsales?\s+spike\b', r'\bunusual\s+sales?\b']),
    ('sold_before_added', [r'\bsold\s+before\b', r'\bbefore.*added\s+to\s+inventory\b']),
    ('multiple_cost_prices', [r'\bmultiple\s+cost\b', r'\bdifferent\s+cost\s+price\b', r'\bcost.*supplier\b']),
    ('pending_po_overstocked', [r'\bpending\s+po.*overstock\b', r'\boverstocked.*pending\s+po\b']),
    ('transfer_not_received', [r'\btransfer.*not\s+received\b', r'\bnot\s+received.*destination\b']),
    (
        'reserved_exceeds_available',
        [r'\breserved.*(?:greater|more)\s+than.*available\b', r'\breserved\s+stock.*exceed\b'],
    ),
    ('incorrect_pricing_rules', [r'\bincorrect.*(?:tax|pricing|discount)\b', r'\bpricing\s+rules?\s+(?:wrong|incorrect|applied)\b']),
    ('unapproved_adjustments', [r'\bunapproved\b', r'\bwithout\s+approval\b', r'\bmanual\s+adjust.*no\s+approv\b']),
    ('out_of_stock', [r'\bout\s+of\s+stock\b', r'\bzero\s+stock\b', r'\bno\s+stock\b']),
    ('top_selling', [r'\btop[- ]sell(?:ing)?\b', r'\bbest[- ]sell(?:ing)?\b', r'\bselling\s+most\b', r'\bhighest\s+sales\b']),
    ('slow_moving', [r'\bslow[- ]mov(?:ing)?\b', r'\bpoor(?:ly)?\s+sell(?:ing)?\b']),
    ('no_recent_sales', [r'\bnot\s+sold\b', r'\bno\s+(?:recent\s+)?sales\b', r'\b(?:last|past)\s+\d+\s+days?\b.*\bnot\s+sold\b']),
    ('reorder_needed', [r'\breorder\s+(?:soon|needed|first)\b', r'\bshould\s+i\s+restock\b', r'\brestock\s+first\b']),
    ('high_demand_low_stock', [r'\bhigh\s+(?:sales|demand).*low\s+stock\b', r'\bhigh\s+sales\b.*\blow\s+stock\b']),
    ('stock_value', [r'\bstock\s+value\b', r'\bhighest\s+stock\s+value\b', r'\blowest\s+stock\s+value\b']),
    ('recently_added', [r'\brecently\s+added\b', r'\bnew(?:ly)?\s+added\b', r'\blatest\s+products?\b']),
    ('low_stock', [r'\blow\s+(?:stock|inventory)\b', r'\bbelow\s+\d+\s+units?\b', r'\bbelow\s+threshold\b', r'\brun(?:ning)?\s+low\b']),
]


class AnalyticsAgent(Agent):
    name = 'analytics'
    PAGE_SIZE = 10
    DOWNLOAD_THRESHOLD = 50

    def __init__(
        self,
        *,
        backend: BackendClient,
        routing: ModelRouting,
    ) -> None:
        self._backend = backend
        self._routing = routing

    def can_handle(self, intent: str) -> bool:
        return intent in {'analytics_query', 'analytics_download'}

    async def handle_turn(
        self,
        *,
        auth: AuthContext,
        conversation: ConversationDetail,
        workflow: WorkflowState,
        intent: str,
        user_message: str,
        memory: dict[str, object],
    ) -> AgentTurnResult:
        del conversation, workflow
        message = user_message.strip()
        normalized = normalize(message)

        is_download = intent == 'analytics_download' or any(
            phrase in normalized for phrase in ANALYTICS_DOWNLOAD_PHRASES
        )
        is_more = any(phrase in normalized for phrase in ANALYTICS_MORE_PHRASES)

        if (is_more or is_download) and memory.get('analyticsSubType'):
            sub_type = str(memory['analyticsSubType'])
            params = dict(memory.get('analyticsParams') or {})
            offset = int(memory.get('analyticsOffset') or 0) if is_more else 0
        else:
            sub_type = self._classify_sub_type(message)
            params = self._extract_params(message, sub_type)
            offset = 0

        if sub_type not in ANALYTICS_SUB_TYPES:
            return AgentTurnResult(
                next_action='return_read_result',
                blocks=[
                    ErrorBlock(
                        title='Analytics query not recognised',
                        message='Try asking something like "show me low stock products" or "which products are top selling".',
                    )
                ],
            )

        method_name, title, default_columns = ANALYTICS_SUB_TYPES[sub_type]
        fetch_params = {**params, 'offset': offset, 'limit': self.PAGE_SIZE + 1}
        if method_name == 'analytics_data_quality':
            fetch_params['check'] = sub_type

        try:
            method = getattr(self._backend, method_name)
            raw_rows = await method(auth.access_token or '', auth.tenant_id, fetch_params)
        except Exception as exc:
            return AgentTurnResult(
                next_action='return_read_result',
                blocks=[ErrorBlock(title='Analytics query failed', message=str(exc))],
            )

        if not isinstance(raw_rows, list):
            raw_rows = []

        normalized_rows = [json_safe_row(row) for row in raw_rows if isinstance(row, dict)]
        has_more = len(normalized_rows) > self.PAGE_SIZE
        page_rows = normalized_rows[: self.PAGE_SIZE]

        if page_rows:
            keys = [key for key in page_rows[0].keys() if key in default_columns or not default_columns]
            if not keys:
                keys = list(page_rows[0].keys())[:8]
        else:
            keys = default_columns[:8]

        columns = [TableColumn(key=key, label=key.replace('_', ' ').title()) for key in keys]

        new_offset = offset + len(page_rows)
        total_hint = int(memory.get('analyticsTotal') or 0)
        if has_more:
            total_hint = max(total_hint, new_offset + 1)
        else:
            total_hint = new_offset

        download_token: str | None = None
        if is_download or total_hint > self.DOWNLOAD_THRESHOLD:
            token_source = json.dumps({'sub': sub_type, 'params': params, 'tenant': auth.tenant_id}, sort_keys=True)
            download_token = hashlib.sha256(token_source.encode()).hexdigest()[:32]

        blocks: list[MessageBlock] = []
        table_block = TableResultBlock(
            title=f'{title} (rows {offset + 1}-{offset + len(page_rows)})',
            columns=columns,
            rows=page_rows,
            total_count=total_hint if total_hint > 0 else None,
            download_token=download_token if is_download else None,
        )

        if not page_rows:
            blocks.append(TextBlock(content=f'No results found for "{title}".'))
        else:
            if offset == 0:
                blocks.append(TextBlock(content=f'Found results for **{title}**.'))
            blocks.append(table_block)

        if has_more:
            remaining = total_hint - new_offset
            next_count = min(self.PAGE_SIZE, remaining) if remaining > 0 else self.PAGE_SIZE
            blocks.append(
                TextBlock(
                    content=(
                        f'Showing rows {offset + 1}-{offset + len(page_rows)}. '
                        f'Say **"show more"** to see the next {next_count} results.'
                    )
                )
            )
        elif page_rows and offset > 0:
            blocks.append(TextBlock(content="That's all the results."))

        if total_hint > self.DOWNLOAD_THRESHOLD and not is_download:
            blocks.append(
                TextBlock(
                    content=(
                        f'There are {total_hint}+ results. '
                        f'Say **"download"** or **"export as CSV"** to get the full list as a file.'
                    )
                )
            )

        if is_download and download_token:
            blocks.append(TextBlock(content='Your export is ready. The download link has been attached above.'))

        memory_updates: dict[str, object] = {
            'analyticsSubType': sub_type,
            'analyticsParams': params,
            'analyticsOffset': new_offset,
            'analyticsTotal': total_hint,
            'lastAnalyticsIntent': 'analytics_query',
        }

        return AgentTurnResult(
            next_action='return_read_result',
            memory_updates=memory_updates,
            blocks=blocks,
        )

    @staticmethod
    def _classify_sub_type(message: str) -> str:
        for sub_type, patterns in _SUB_TYPE_PATTERNS:
            for pattern in patterns:
                if re.search(pattern, message, re.IGNORECASE):
                    return sub_type
        return 'low_stock'

    @staticmethod
    def _extract_params(message: str, sub_type: str) -> dict[str, object]:
        params: dict[str, object] = {}

        days_match = re.search(r'(?:last|past)\s+(\d+)\s+days?', message, re.IGNORECASE)
        if days_match:
            params['days'] = int(days_match.group(1))
        elif sub_type in {'no_recent_sales', 'slow_moving'}:
            params['days'] = 30

        threshold_match = re.search(
            r'(?:below|less than|under|fewer than)\s+(\d+)\s*(?:units?)?',
            message,
            re.IGNORECASE,
        )
        if threshold_match:
            params['threshold'] = int(threshold_match.group(1))

        if re.search(r'\bhighest\b', message, re.IGNORECASE):
            params['sort'] = 'desc'
        elif re.search(r'\blowest\b', message, re.IGNORECASE):
            params['sort'] = 'asc'

        cat_match = re.search(r'\bcategory\s+([a-zA-Z0-9 -]+)', message, re.IGNORECASE)
        if cat_match:
            params['category'] = cat_match.group(1).strip()

        limit_match = re.search(r'\btop\s+(\d+)\b', message, re.IGNORECASE)
        if limit_match:
            params['limit'] = int(limit_match.group(1))

        size_match = re.search(r'\bsize\s+([A-Za-z0-9]+)\b', message, re.IGNORECASE)
        if size_match:
            params['size'] = size_match.group(1).upper()

        colors = extract_color_names(message)
        if colors:
            params['color'] = colors[0]

        return params
