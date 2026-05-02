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
            }),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=stock_on_hand,
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
    }
