from __future__ import annotations

from typing import Any

from conversational_engine.clients.backend import BackendClient
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.tools.definitions import SemanticTool
from .resolvers import EntityResolver
from .utils import object_schema

_SIZE_FIELDS = ('productName', 'colorName', 'sizeLabel')

_STOCK_DISPLAY_FIELDS = ('product_name', 'color_name', 'size_label', 'sku_code', 'location_name', 'location_code', 'on_hand', 'reserved', 'available')

_ITEM_SCHEMA = {
    'sizeId': {'type': ['string', 'null'], 'description': 'SKU size UUID (use instead of productName/sizeLabel if known)'},
    'productName': {'type': ['string', 'null'], 'description': 'Product name when sizeId is not known'},
    'colorName': {'type': ['string', 'null'], 'description': 'Colour/variant name to narrow the SKU'},
    'sizeLabel': {'type': ['string', 'null'], 'description': 'Size label (e.g. "M", "L", "XL") when sizeId is not known'},
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

    async def transfer_stock(payload: dict[str, Any]) -> dict[str, Any]:
        resolved = dict(payload)
        if from_loc := str(payload.get('fromLocationId') or '').strip():
            resolved['fromLocationId'] = await resolver.location(from_loc)
        if to_loc := str(payload.get('toLocationId') or '').strip():
            resolved['toLocationId'] = await resolver.location(to_loc)
        resolved['sizeId'] = await resolver.size_from_payload(payload)
        for key in _SIZE_FIELDS:
            resolved.pop(key, None)
        return {'result': await backend.transfer_stock(token, tenant, resolved)}

    async def adjust_stock(payload: dict[str, Any]) -> dict[str, Any]:
        resolved = dict(payload)
        if loc := str(payload.get('locationId') or '').strip():
            resolved['locationId'] = await resolver.location(loc)
        resolved['sizeId'] = await resolver.size_from_payload(payload)
        for key in _SIZE_FIELDS:
            resolved.pop(key, None)
        return {'result': await backend.adjust_stock(token, tenant, resolved)}

    async def receive_stock(payload: dict[str, Any]) -> dict[str, Any]:
        resolved = dict(payload)
        if loc := str(payload.get('locationId') or '').strip():
            resolved['locationId'] = await resolver.location(loc)
        resolved['sizeId'] = await resolver.size_from_payload(payload)
        for key in _SIZE_FIELDS:
            resolved.pop(key, None)
        return {'result': await backend.receive_stock(token, tenant, resolved)}

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
                ['fromLocationId', 'toLocationId', 'quantity', 'reason'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=transfer_stock,
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
                    'quantity': {'type': 'integer'},
                    'reason': {'type': 'string'},
                },
                ['locationId', 'quantity', 'reason'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=adjust_stock,
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
                ['locationId', 'quantity', 'reason'],
            ),
            risk_level='medium',
            side_effect=True,
            output_mode='mutation',
            executor=receive_stock,
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
