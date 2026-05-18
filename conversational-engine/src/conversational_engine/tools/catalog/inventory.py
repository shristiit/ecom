from __future__ import annotations

from typing import Any

from conversational_engine.clients.backend import BackendClient
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.tools.definitions import SemanticTool

from .resolvers import EntityResolver
from .utils import ToolPreparationError, object_schema

_SIZE_FIELDS = ('productName', 'colorName', 'sizeLabel')

_STOCK_DISPLAY_FIELDS = (
    'product_name',
    'color_name',
    'size_label',
    'sku_code',
    'location_name',
    'location_code',
    'on_hand',
    'reserved',
    'available',
)

_ITEM_SCHEMA = {
    'sizeId': {
        'type': ['string', 'null'],
        'description': 'SKU size UUID (use instead of productName/sizeLabel if known)',
    },
    'productName': {'type': ['string', 'null'], 'description': 'Product name when sizeId is not known'},
    'colorName': {'type': ['string', 'null'], 'description': 'Colour/variant name to narrow the SKU'},
    'sizeLabel': {
        'type': ['string', 'null'],
        'description': 'Size label (e.g. "M", "L", "XL") when sizeId is not known',
    },
}


def build_inventory_tools(
    backend: BackendClient, auth: AuthContext, resolver: EntityResolver
) -> dict[str, SemanticTool]:
    token = auth.access_token or ''
    tenant = auth.tenant_id

    async def stock_on_hand(payload: dict[str, Any]) -> dict[str, Any]:
        params = {
            k: v for k, v in {
                'sku': payload.get('sku'),
                'locationId': payload.get('locationId'),
                'productName': payload.get('productName'),
                'colorName': payload.get('colorName') or payload.get('color'),
                'sizeLabel': payload.get('sizeLabel') or payload.get('size'),
            }.items() if v
        }
        result = await backend.stock_on_hand(token, tenant, params)
        raw_rows = result if isinstance(result, list) else [result]
        rows = [
            {k: row[k] for k in _STOCK_DISPLAY_FIELDS if k in row}
            for row in raw_rows
            if isinstance(row, dict)
        ]
        return {'rows': rows}

    async def prepare_transfer_stock(payload: dict[str, Any]) -> dict[str, Any]:
        if not payload.get('fromLocationId'):
            raise ToolPreparationError('Which source location should stock move from?', ['from_location_id'])
        if not payload.get('toLocationId'):
            raise ToolPreparationError('Which destination location should stock move to?', ['to_location_id'])
        if payload.get('quantity') is None:
            raise ToolPreparationError('How many units should move?', ['quantity'])

        resolved = dict(payload)
        if from_loc := str(payload.get('fromLocationId') or '').strip():
            resolved['fromLocationId'] = await resolver.location(from_loc)
        if to_loc := str(payload.get('toLocationId') or '').strip():
            resolved['toLocationId'] = await resolver.location(to_loc)
        try:
            resolved['sizeId'] = await resolver.size_from_payload(payload)
        except ValueError as exc:
            raise ToolPreparationError(str(exc), ['sku_and_size']) from exc
        for key in _SIZE_FIELDS:
            resolved.pop(key, None)
        resolved['confirm'] = True
        return resolved

    async def transfer_stock(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.transfer_stock(token, tenant, payload)}

    async def prepare_adjust_stock(payload: dict[str, Any]) -> dict[str, Any]:
        if not payload.get('locationId'):
            raise ToolPreparationError('Which location is affected?', ['location_id'])
        if payload.get('quantity') is None:
            raise ToolPreparationError('How many units should be changed?', ['quantity'])

        resolved = dict(payload)
        if loc := str(payload.get('locationId') or '').strip():
            resolved['locationId'] = await resolver.location(loc)
        try:
            resolved['sizeId'] = await resolver.size_from_payload(payload)
        except ValueError as exc:
            raise ToolPreparationError(str(exc), ['sku_and_size']) from exc
        for key in _SIZE_FIELDS:
            resolved.pop(key, None)
        resolved['confirm'] = True
        return resolved

    async def adjust_stock(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.adjust_stock(token, tenant, payload)}

    async def prepare_write_off_stock(payload: dict[str, Any]) -> dict[str, Any]:
        if not payload.get('locationId'):
            raise ToolPreparationError('Which location is affected?', ['location_id'])
        if payload.get('quantity') is None:
            raise ToolPreparationError('How many units should be written off?', ['quantity'])

        resolved = dict(payload)
        if loc := str(payload.get('locationId') or '').strip():
            resolved['locationId'] = await resolver.location(loc)
        try:
            resolved['sizeId'] = await resolver.size_from_payload(payload)
        except ValueError as exc:
            raise ToolPreparationError(str(exc), ['sku_and_size']) from exc
        for key in _SIZE_FIELDS:
            resolved.pop(key, None)
        resolved['confirm'] = True
        return resolved

    async def write_off_stock(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.write_off_stock(token, tenant, payload)}

    async def prepare_receive_stock(payload: dict[str, Any]) -> dict[str, Any]:
        if not payload.get('locationId'):
            raise ToolPreparationError('Which location is affected?', ['location_id'])

        resolved = dict(payload)
        if loc := str(payload.get('locationId') or '').strip():
            resolved['locationId'] = await resolver.location(loc)

        raw_lines = payload.get('lines')
        if isinstance(raw_lines, list) and raw_lines:
            resolved_lines: list[dict[str, Any]] = []
            for raw_line in raw_lines:
                if not isinstance(raw_line, dict):
                    raise ToolPreparationError('Each inventory receipt line must be an object.', ['lines'])
                qty = raw_line.get('quantity', payload.get('quantity'))
                if qty is None:
                    raise ToolPreparationError('How many units should be received?', ['quantity'])
                try:
                    size_id = await resolver.size_from_payload(raw_line)
                except ValueError as exc:
                    raise ToolPreparationError(str(exc), ['sku_and_size']) from exc
                resolved_lines.append(
                    {
                        'sizeId': size_id,
                        'quantity': int(qty),
                        'reason': str(raw_line.get('reason') or payload.get('reason') or ''),
                    }
                )
            resolved['lines'] = resolved_lines
            resolved['quantity'] = sum(int(line['quantity']) for line in resolved_lines)
            for key in _SIZE_FIELDS:
                resolved.pop(key, None)
            resolved['confirm'] = True
            return resolved

        expand_all_sizes = bool(payload.get('allSizes'))
        expand_all_colors = bool(payload.get('allColors'))
        size_labels = payload.get('sizeLabels')
        if expand_all_sizes or expand_all_colors or isinstance(size_labels, list):
            product_name = str(payload.get('productName') or '').strip()
            if not product_name:
                raise ToolPreparationError('Which product should be received?', ['product_name'])
            quantity = payload.get('quantity')
            if quantity is None:
                raise ToolPreparationError('How many units should be received?', ['quantity'])
            color_name = str(payload.get('colorName') or '').strip() or None
            if expand_all_colors:
                color_name = None
            try:
                matching_lines = await resolver.size_lines_from_product(
                    product_name,
                    color_name=color_name,
                    size_labels=size_labels if isinstance(size_labels, list) else None,
                )
            except ValueError as exc:
                raise ToolPreparationError(str(exc), ['sku_and_size']) from exc
            if not matching_lines:
                raise ToolPreparationError(f'No sizes found for "{product_name}".', ['sku_and_size'])
            resolved['lines'] = [
                {
                    'sizeId': line['sizeId'],
                    'quantity': int(quantity),
                    'reason': str(payload.get('reason') or ''),
                }
                for line in matching_lines
            ]
            resolved['quantity'] = int(quantity) * len(matching_lines)
            resolved.pop('sizeId', None)
            for key in _SIZE_FIELDS:
                resolved.pop(key, None)
            resolved['confirm'] = True
            return resolved

        if payload.get('quantity') is None:
            raise ToolPreparationError('How many units should be received?', ['quantity'])
        try:
            resolved['sizeId'] = await resolver.size_from_payload(payload)
        except ValueError as exc:
            raise ToolPreparationError(str(exc), ['sku_and_size']) from exc
        for key in _SIZE_FIELDS:
            resolved.pop(key, None)
        resolved['confirm'] = True
        return resolved

    async def receive_stock(payload: dict[str, Any]) -> dict[str, Any]:
        if isinstance(payload.get('lines'), list):
            results: list[dict[str, Any]] = []
            for line in payload['lines']:
                if not isinstance(line, dict):
                    continue
                line_payload = {
                    'locationId': payload['locationId'],
                    'sizeId': line['sizeId'],
                    'quantity': line['quantity'],
                    'reason': line.get('reason', payload.get('reason', '')),
                    'confirm': bool(payload.get('confirm')),
                }
                results.append(await backend.receive_stock(token, tenant, line_payload))
            return {'result': {'lines': results, 'lineCount': len(results)}}
        return {'result': await backend.receive_stock(token, tenant, payload)}

    async def stock_summary(payload: dict[str, Any]) -> dict[str, Any]:
        resolved = dict(payload)
        if loc := str(payload.get('locationId') or '').strip():
            resolved['locationId'] = await resolver.location(loc)
        rows = await backend.reporting_stock_summary(token, tenant, resolved)
        return {'rows': rows}

    _PERIOD_TO_DAYS: dict[str, int] = {
        'today': 1,
        'yesterday': 1,
        'this week': 7,
        'last week': 7,
        'this month': 30,
        'last month': 30,
        'this quarter': 90,
        'last quarter': 90,
        'this year': 365,
        'last year': 365,
        '7 days': 7,
        '14 days': 14,
        '30 days': 30,
        '60 days': 60,
        '90 days': 90,
        '180 days': 180,
        '365 days': 365,
    }

    async def prepare_analytics(payload: dict[str, Any]) -> dict[str, Any]:
        resolved = {key: value for key, value in payload.items() if value is not None}
        if resolved.pop('allLocations', False):
            resolved.pop('locationId', None)
        if loc := str(resolved.get('locationId') or '').strip():
            if loc.lower() in {'table', 'tables', 'grid', 'list', 'results', 'csv', 'excel', 'file'}:
                resolved.pop('locationId', None)
            else:
                resolved['locationId'] = await resolver.location(loc)
        else:
            resolved.pop('locationId', None)
        # Convert natural-language period to days when the API uses days
        period = str(resolved.pop('period', None) or '').strip().lower()
        if period and 'days' not in resolved:
            days = _PERIOD_TO_DAYS.get(period)
            if days is None:
                import re as _re
                m = _re.match(r'(\d+)\s*days?', period)
                if m:
                    days = int(m.group(1))
            if days is not None:
                resolved['days'] = days
        return resolved

    async def prepare_low_stock(payload: dict[str, Any]) -> dict[str, Any]:
        resolved = await prepare_analytics(payload)
        if resolved.get('threshold') is None:
            raise ToolPreparationError('What stock quantity threshold should I use for low stock?', ['threshold'])
        return resolved

    async def prepare_no_recent_sales(payload: dict[str, Any]) -> dict[str, Any]:
        resolved = await prepare_analytics(payload)
        resolved.setdefault('days', 30)
        return resolved

    async def prepare_reorder_needed(payload: dict[str, Any]) -> dict[str, Any]:
        return await prepare_analytics(payload)

    async def prepare_variant_availability(payload: dict[str, Any]) -> dict[str, Any]:
        resolved = await prepare_analytics(payload)
        if not resolved.get('color') and isinstance(resolved.get('colorName'), str):
            resolved['color'] = str(resolved['colorName']).strip() or None
        if not resolved.get('size') and isinstance(resolved.get('sizeLabel'), str):
            resolved['size'] = str(resolved['sizeLabel']).strip().upper() or None
        if not resolved.get('sizes') and isinstance(resolved.get('sizeLabels'), list):
            size_labels = [str(label).strip().upper() for label in resolved['sizeLabels'] if str(label).strip()]
            if size_labels:
                resolved['sizes'] = size_labels
        if resolved.get('size') and not resolved.get('sizes'):
            resolved['size'] = str(resolved['size']).strip().upper()
        if isinstance(resolved.get('sizes'), list):
            resolved['sizes'] = [str(label).strip().upper() for label in resolved['sizes'] if str(label).strip()]
            if len(resolved['sizes']) == 1 and not resolved.get('size'):
                resolved['size'] = resolved['sizes'][0]
        meaningful = (
            resolved.get('productName'),
            resolved.get('sku'),
            resolved.get('color'),
            resolved.get('size'),
            resolved.get('sizes'),
            resolved.get('availability'),
            resolved.get('excludeSize'),
            resolved.get('minColorCount'),
            resolved.get('maxColorCount'),
            resolved.get('maxInStockSizeCount'),
        )
        if not any(value not in (None, '', [], False) for value in meaningful):
            raise ToolPreparationError(
                'Which product, size, color, or stock condition should I search for?',
                ['productName'],
            )
        return resolved

    async def analytics_low_stock(payload: dict[str, Any]) -> dict[str, Any]:
        rows = await backend.analytics_low_stock(token, tenant, payload)
        return {'rows': rows}

    async def analytics_out_of_stock(payload: dict[str, Any]) -> dict[str, Any]:
        rows = await backend.analytics_out_of_stock(token, tenant, payload)
        return {'rows': rows}

    async def analytics_top_selling(payload: dict[str, Any]) -> dict[str, Any]:
        rows = await backend.analytics_top_selling(token, tenant, payload)
        return {'rows': rows}

    async def analytics_slow_moving(payload: dict[str, Any]) -> dict[str, Any]:
        rows = await backend.analytics_slow_moving(token, tenant, payload)
        return {'rows': rows}

    async def analytics_no_recent_sales(payload: dict[str, Any]) -> dict[str, Any]:
        rows = await backend.analytics_no_recent_sales(token, tenant, payload)
        return {'rows': rows}

    async def analytics_reorder_needed(payload: dict[str, Any]) -> dict[str, Any]:
        rows = await backend.analytics_reorder_needed(token, tenant, payload)
        return {'rows': rows}

    async def analytics_stock_value(payload: dict[str, Any]) -> dict[str, Any]:
        rows = await backend.analytics_stock_value(token, tenant, payload)
        return {'rows': rows}

    async def analytics_high_demand_low_stock(payload: dict[str, Any]) -> dict[str, Any]:
        rows = await backend.analytics_high_demand_low_stock(token, tenant, payload)
        return {'rows': rows}

    async def analytics_recently_added(payload: dict[str, Any]) -> dict[str, Any]:
        rows = await backend.analytics_recently_added(token, tenant, payload)
        return {'rows': rows}

    async def analytics_data_quality(payload: dict[str, Any]) -> dict[str, Any]:
        rows = await backend.analytics_data_quality(token, tenant, payload)
        return {'rows': rows}

    async def analytics_variant_availability(payload: dict[str, Any]) -> dict[str, Any]:
        rows = await backend.analytics_variant_availability(token, tenant, payload)
        return {'rows': rows}

    async def movement_summary(payload: dict[str, Any]) -> dict[str, Any]:
        resolved = dict(payload)
        if loc := str(payload.get('locationId') or '').strip():
            resolved['locationId'] = await resolver.location(loc)
        rows = await backend.reporting_movement_summary(token, tenant, resolved)
        return {'rows': rows}

    async def po_summary(payload: dict[str, Any]) -> dict[str, Any]:
        resolved = dict(payload)
        if supplier := str(payload.get('supplierId') or '').strip():
            resolved['supplierId'] = await resolver.supplier(supplier)
        rows = await backend.reporting_po_summary(token, tenant, resolved)
        return {'rows': rows}

    async def receipt_summary(payload: dict[str, Any]) -> dict[str, Any]:
        resolved = dict(payload)
        if loc := str(payload.get('locationId') or '').strip():
            resolved['locationId'] = await resolver.location(loc)
        rows = await backend.reporting_receipt_summary(token, tenant, resolved)
        return {'rows': rows}

    return {
        'inventory.stock_on_hand': SemanticTool(
            name='inventory.stock_on_hand',
            description=(
                'Read stock on hand rows. Filter by product name (partial matches supported), '
                'SKU code, or location. At least one filter should be provided.'
            ),
            input_schema=object_schema({
                'productName': {
                    'type': ['string', 'null'],
                    'description': 'Product name or partial name. Case-insensitive partial match.',
                },
                'sku': {
                    'type': ['string', 'null'],
                    'description': 'SKU code to filter by (e.g. "STK-0006").',
                },
                'locationId': {
                    'type': ['string', 'null'],
                    'description': 'Location name, code, or UUID.',
                },
                'colorName': {
                    'type': ['string', 'null'],
                    'description': 'Colour/variant name to narrow results.',
                },
                'color': {
                    'type': ['string', 'null'],
                    'description': 'Alias for colorName.',
                },
                'sizeLabel': {
                    'type': ['string', 'null'],
                    'description': 'Size label to narrow results (e.g. "M", "XL").',
                },
                'size': {
                    'type': ['string', 'null'],
                    'description': 'Alias for sizeLabel.',
                },
                'groupBy': {
                    'type': ['string', 'null'],
                    'description': 'Ignored — grouping is handled server-side.',
                },
                'availability': {
                    'type': ['string', 'null'],
                    'description': 'Ignored — use inventory.variant_availability for availability queries.',
                },
            }),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=stock_on_hand,
        ),
        'inventory.variant_availability': SemanticTool(
            name='inventory.variant_availability',
            description=(
                'Read product variant availability across the catalog. '
                'Use this for questions about sizes, colors, products with a given size/color, '
                'variant availability, low stock by size/color, out-of-stock sizes/colors, '
                'or products that have or do not have specific size combinations.'
            ),
            input_schema=object_schema(
                {
                    'productName': {'type': ['string', 'null'], 'description': 'Optional product or style reference.'},
                    'sku': {'type': ['string', 'null'], 'description': 'Optional SKU code filter.'},
                    'locationId': {'type': ['string', 'null'], 'description': 'Optional location name, code, or UUID.'},
                    'size': {'type': ['string', 'null'], 'description': 'Single size filter such as M, XL, 10.'},
                    'sizes': {'type': ['array', 'null'], 'items': {'type': 'string'}},
                    'color': {'type': ['string', 'null'], 'description': 'Single color filter such as Red or Black.'},
                    'availability': {
                        'type': ['string', 'null'],
                        'description': 'Use one of any, in_stock, low_stock, out_of_stock.',
                    },
                    'threshold': {'type': ['integer', 'null'], 'description': 'Threshold used for low_stock queries.'},
                    'groupBy': {
                        'type': ['string', 'null'],
                        'description': 'Use product, size, color, or variant depending on the user question.',
                    },
                    'matchAllSizes': {'type': ['boolean', 'null']},
                    'excludeSize': {'type': ['string', 'null']},
                    'minColorCount': {'type': ['integer', 'null']},
                    'maxColorCount': {'type': ['integer', 'null']},
                    'maxInStockSizeCount': {'type': ['integer', 'null']},
                    'limit': {'type': ['integer', 'null']},
                },
            ),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=analytics_variant_availability,
            preparer=prepare_variant_availability,
        ),
        'inventory.transfer_stock': SemanticTool(
            name='inventory.transfer_stock',
            description=(
                'Transfer stock between locations. '
                'Locations accept a name, code, or UUID. '
                'Item identified by sizeId (UUID) or productName + sizeLabel (+ optional colorName).'
            ),
            input_schema=object_schema(
                {
                    'fromLocationId': {'type': 'string', 'description': 'Source location name, code, or UUID'},
                    'toLocationId': {'type': 'string', 'description': 'Destination location name, code, or UUID'},
                    **_ITEM_SCHEMA,
                    'quantity': {'type': 'integer'},
                    'reason': {'type': 'string'},
                },
                ['fromLocationId', 'toLocationId', 'quantity'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=transfer_stock,
            preparer=prepare_transfer_stock,
        ),
        'inventory.adjust_stock': SemanticTool(
            name='inventory.adjust_stock',
            description=(
                'Adjust stock at a location. '
                'Location accepts a name, code, or UUID. '
                'Item identified by sizeId (UUID) or productName + sizeLabel (+ optional colorName).'
            ),
            input_schema=object_schema(
                {
                    'locationId': {'type': 'string', 'description': 'Location name, code, or UUID'},
                    **_ITEM_SCHEMA,
                    'sizeLabels': {'type': ['array', 'null'], 'items': {'type': 'string'}},
                    'allSizes': {'type': 'boolean'},
                    'allColors': {'type': 'boolean'},
                    'lines': {'type': 'array', 'items': {'type': 'object'}},
                    'quantity': {'type': 'integer'},
                    'reason': {'type': 'string'},
                },
                ['locationId', 'quantity'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=adjust_stock,
            preparer=prepare_adjust_stock,
        ),
        'inventory.write_off_stock': SemanticTool(
            name='inventory.write_off_stock',
            description=(
                'Write off stock at a location. '
                'Location accepts a name, code, or UUID. '
                'Item identified by sizeId (UUID) or productName + sizeLabel (+ optional colorName).'
            ),
            input_schema=object_schema(
                {
                    'locationId': {'type': 'string', 'description': 'Location name, code, or UUID'},
                    **_ITEM_SCHEMA,
                    'quantity': {'type': 'integer'},
                    'reason': {'type': 'string'},
                },
                ['locationId', 'quantity'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=write_off_stock,
            preparer=prepare_write_off_stock,
        ),
        'inventory.receive_stock': SemanticTool(
            name='inventory.receive_stock',
            description=(
                'Receive stock into a location. '
                'Location accepts a name, code, or UUID. '
                'Item identified by sizeId (UUID) or productName + sizeLabel (+ optional colorName).'
            ),
            input_schema=object_schema(
                {
                    'locationId': {'type': 'string', 'description': 'Location name, code, or UUID'},
                    **_ITEM_SCHEMA,
                    'quantity': {'type': 'integer'},
                    'reason': {'type': 'string'},
                },
                ['locationId', 'quantity'],
            ),
            risk_level='medium',
            side_effect=True,
            output_mode='mutation',
            executor=receive_stock,
            preparer=prepare_receive_stock,
        ),
        'reporting.stock_summary': SemanticTool(
            name='reporting.stock_summary',
            description='Read stock reporting summaries. Location accepts a name, code, or UUID.',
            input_schema=object_schema({
                'locationId': {'type': ['string', 'null'], 'description': 'Location name, code, or UUID'},
                'status': {'type': ['string', 'null']},
                'from': {'type': ['string', 'null']},
            }),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=stock_summary,
        ),
        'analytics.low_stock': SemanticTool(
            name='analytics.low_stock',
            description='Read low-stock products across all products, optionally filtered by location or product attributes.',
            input_schema=object_schema(
                {
                    'threshold': {'type': ['integer', 'null'], 'description': 'Maximum on-hand quantity to treat as low stock.'},
                    'locationId': {'type': ['string', 'null'], 'description': 'Optional location name, code, or UUID.'},
                    'productName': {'type': ['string', 'null']},
                    'sku': {'type': ['string', 'null']},
                    'category': {'type': ['string', 'null']},
                    'color': {'type': ['string', 'null']},
                    'size': {'type': ['string', 'null']},
                    'sort': {'type': ['string', 'null']},
                    'limit': {'type': ['integer', 'null']},
                },
                ['threshold'],
            ),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=analytics_low_stock,
            preparer=prepare_low_stock,
        ),
        'analytics.out_of_stock': SemanticTool(
            name='analytics.out_of_stock',
            description='Read out-of-stock products across all products, optionally filtered by location or product attributes.',
            input_schema=object_schema({
                'locationId': {'type': ['string', 'null'], 'description': 'Optional location name, code, or UUID.'},
                'productName': {'type': ['string', 'null']},
                'sku': {'type': ['string', 'null']},
                'category': {'type': ['string', 'null']},
                'color': {'type': ['string', 'null']},
                'size': {'type': ['string', 'null']},
                'limit': {'type': ['integer', 'null']},
            }),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=analytics_out_of_stock,
            preparer=prepare_analytics,
        ),
        'analytics.top_selling': SemanticTool(
            name='analytics.top_selling',
            description='Read top-selling products across all products, with optional time period or location filters.',
            input_schema=object_schema({
                'locationId': {'type': ['string', 'null'], 'description': 'Optional location name, code, or UUID.'},
                'days': {'type': ['integer', 'null']},
                'period': {'type': ['string', 'null']},
                'limit': {'type': ['integer', 'null']},
                'category': {'type': ['string', 'null']},
                'color': {'type': ['string', 'null']},
                'size': {'type': ['string', 'null']},
                'sort': {'type': ['string', 'null']},
            }),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=analytics_top_selling,
            preparer=prepare_analytics,
        ),
        'analytics.slow_moving': SemanticTool(
            name='analytics.slow_moving',
            description='Read slow-moving products across all products, optionally filtered by timeframe or location.',
            input_schema=object_schema({
                'locationId': {'type': ['string', 'null'], 'description': 'Optional location name, code, or UUID.'},
                'days': {'type': ['integer', 'null']},
                'period': {'type': ['string', 'null'], 'description': 'Natural-language period e.g. "last month", "last 30 days".'},
                'from': {'type': ['string', 'null'], 'description': 'Start date YYYY-MM-DD'},
                'to': {'type': ['string', 'null'], 'description': 'End date YYYY-MM-DD'},
                'category': {'type': ['string', 'null']},
                'color': {'type': ['string', 'null']},
                'size': {'type': ['string', 'null']},
                'limit': {'type': ['integer', 'null']},
            }),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=analytics_slow_moving,
            preparer=prepare_analytics,
        ),
        'analytics.no_recent_sales': SemanticTool(
            name='analytics.no_recent_sales',
            description='Read products with no recent sales across all products. Defaults to the last 30 days.',
            input_schema=object_schema({
                'locationId': {'type': ['string', 'null'], 'description': 'Optional location name, code, or UUID.'},
                'days': {'type': ['integer', 'null']},
                'period': {'type': ['string', 'null'], 'description': 'Natural-language period e.g. "last month".'},
                'from': {'type': ['string', 'null'], 'description': 'Start date YYYY-MM-DD'},
                'to': {'type': ['string', 'null'], 'description': 'End date YYYY-MM-DD'},
                'category': {'type': ['string', 'null']},
                'color': {'type': ['string', 'null']},
                'size': {'type': ['string', 'null']},
                'limit': {'type': ['integer', 'null']},
            }),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=analytics_no_recent_sales,
            preparer=prepare_no_recent_sales,
        ),
        'analytics.reorder_needed': SemanticTool(
            name='analytics.reorder_needed',
            description='Read products that need to be reordered soon across all products, optionally filtered by location.',
            input_schema=object_schema({
                'locationId': {'type': ['string', 'null'], 'description': 'Optional location name, code, or UUID.'},
                'threshold': {'type': ['integer', 'null'], 'description': 'Optional reorder threshold override.'},
                'days': {'type': ['integer', 'null']},
                'period': {'type': ['string', 'null'], 'description': 'Natural-language period e.g. "last month".'},
                'category': {'type': ['string', 'null']},
                'color': {'type': ['string', 'null']},
                'size': {'type': ['string', 'null']},
                'limit': {'type': ['integer', 'null']},
            }),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=analytics_reorder_needed,
            preparer=prepare_reorder_needed,
        ),
        'analytics.stock_value': SemanticTool(
            name='analytics.stock_value',
            description='Read stock value analytics across all products, optionally filtered by location or sorted by value.',
            input_schema=object_schema({
                'locationId': {'type': ['string', 'null'], 'description': 'Optional location name, code, or UUID.'},
                'sort': {'type': ['string', 'null']},
                'limit': {'type': ['integer', 'null']},
                'category': {'type': ['string', 'null']},
            }),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=analytics_stock_value,
            preparer=prepare_analytics,
        ),
        'analytics.high_demand_low_stock': SemanticTool(
            name='analytics.high_demand_low_stock',
            description='Read high-demand products with low stock across all products, optionally filtered by location.',
            input_schema=object_schema({
                'locationId': {'type': ['string', 'null'], 'description': 'Optional location name, code, or UUID.'},
                'threshold': {'type': ['integer', 'null']},
                'days': {'type': ['integer', 'null']},
                'period': {'type': ['string', 'null'], 'description': 'Natural-language period e.g. "last month".'},
                'limit': {'type': ['integer', 'null']},
            }),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=analytics_high_demand_low_stock,
            preparer=prepare_analytics,
        ),
        'analytics.recently_added': SemanticTool(
            name='analytics.recently_added',
            description='Read recently added products across all products, optionally filtered by location or timeframe.',
            input_schema=object_schema({
                'locationId': {'type': ['string', 'null'], 'description': 'Optional location name, code, or UUID.'},
                'days': {'type': ['integer', 'null']},
                'period': {'type': ['string', 'null'], 'description': 'Natural-language period e.g. "last month".'},
                'limit': {'type': ['integer', 'null']},
                'category': {'type': ['string', 'null']},
            }),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=analytics_recently_added,
            preparer=prepare_analytics,
        ),
        'analytics.data_quality': SemanticTool(
            name='analytics.data_quality',
            description='Read data-quality issues across all products. A check type is required.',
            input_schema=object_schema(
                {
                    'check': {'type': ['string', 'null']},
                    'locationId': {'type': ['string', 'null'], 'description': 'Optional location name, code, or UUID.'},
                    'limit': {'type': ['integer', 'null']},
                },
                ['check'],
            ),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=analytics_data_quality,
            preparer=prepare_analytics,
        ),
        'reporting.movement_summary': SemanticTool(
            name='reporting.movement_summary',
            description=(
                'Read stock movement summary report — receipts, transfers, adjustments, and write-offs '
                'across products and locations. Use this when the user asks about movements, transfers, '
                'or stock history over a time period.'
            ),
            input_schema=object_schema({
                'locationId': {'type': ['string', 'null'], 'description': 'Location name, code, or UUID'},
                'from': {'type': ['string', 'null'], 'description': 'Start date (YYYY-MM-DD)'},
                'to': {'type': ['string', 'null'], 'description': 'End date (YYYY-MM-DD)'},
                'type': {'type': ['string', 'null'], 'description': 'Movement type filter (e.g. receipt, transfer, adjust)'},
                'limit': {'type': ['integer', 'null']},
            }),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=movement_summary,
        ),
        'reporting.po_summary': SemanticTool(
            name='reporting.po_summary',
            description=(
                'Read purchase order summary report — open, received, and closed POs with totals. '
                'Use this when the user asks for a PO report, purchase summary, or supplier orders overview.'
            ),
            input_schema=object_schema({
                'supplierId': {'type': ['string', 'null'], 'description': 'Supplier name or UUID'},
                'status': {'type': ['string', 'null'], 'description': 'PO status filter (open, received, closed)'},
                'from': {'type': ['string', 'null'], 'description': 'Start date (YYYY-MM-DD)'},
                'to': {'type': ['string', 'null'], 'description': 'End date (YYYY-MM-DD)'},
                'limit': {'type': ['integer', 'null']},
            }),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=po_summary,
        ),
        'reporting.receipt_summary': SemanticTool(
            name='reporting.receipt_summary',
            description=(
                'Read stock receipt summary report — what stock was received, when, and into which location. '
                'Use this when the user asks about receipt history, what was booked in, or inbound stock.'
            ),
            input_schema=object_schema({
                'locationId': {'type': ['string', 'null'], 'description': 'Location name, code, or UUID'},
                'from': {'type': ['string', 'null'], 'description': 'Start date (YYYY-MM-DD)'},
                'to': {'type': ['string', 'null'], 'description': 'End date (YYYY-MM-DD)'},
                'limit': {'type': ['integer', 'null']},
            }),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=receipt_summary,
        ),
    }
