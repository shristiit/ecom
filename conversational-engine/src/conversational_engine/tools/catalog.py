from __future__ import annotations

from typing import Any

from conversational_engine.clients.backend import BackendClient
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.retrieval.navigation_targets import NAVIGATION_TARGETS
from conversational_engine.tools.definitions import SemanticTool


def _object_schema(properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {
        'type': 'object',
        'additionalProperties': False,
        'properties': properties,
        'required': required or [],
    }


def _normalize_product_size(raw_size: dict[str, Any]) -> dict[str, Any] | None:
    size_label = raw_size.get('sizeLabel') or raw_size.get('size')
    if not isinstance(size_label, str) or not size_label.strip():
        return None

    normalized: dict[str, Any] = {'sizeLabel': size_label.strip().upper()}

    if isinstance(raw_size.get('barcode'), str) and raw_size['barcode'].strip():
        normalized['barcode'] = raw_size['barcode'].strip()
    if isinstance(raw_size.get('unitOfMeasure'), str) and raw_size['unitOfMeasure'].strip():
        normalized['unitOfMeasure'] = raw_size['unitOfMeasure'].strip()
    if isinstance(raw_size.get('packSize'), int):
        normalized['packSize'] = raw_size['packSize']
    if isinstance(raw_size.get('priceOverride'), int):
        normalized['priceOverride'] = raw_size['priceOverride']

    stock_by_location = raw_size.get('stockByLocation')
    if isinstance(stock_by_location, list):
        normalized['stockByLocation'] = [item for item in stock_by_location if isinstance(item, dict)]
    elif isinstance(raw_size.get('locationId'), str) and isinstance(raw_size.get('quantity'), int):
        normalized['stockByLocation'] = [
            {'locationId': raw_size['locationId'], 'quantity': raw_size['quantity']},
        ]

    return normalized


def _normalize_product_create_payload(payload: dict[str, Any]) -> dict[str, Any]:
    product = payload.get('product')
    variants = payload.get('variants')

    # Pass through the backend-native shape unchanged.
    if (
        isinstance(product, dict)
        and isinstance(variants, list)
        and all(isinstance(variant, dict) and isinstance(variant.get('sizes'), list) for variant in variants)
    ):
        return payload

    grouped_variants: dict[tuple[str, str | None, str | None], dict[str, Any]] = {}
    flat_variants = variants if isinstance(variants, list) else []

    for raw_variant in flat_variants:
        if not isinstance(raw_variant, dict):
            continue

        color_name = raw_variant.get('colorName') or raw_variant.get('color') or 'Default'
        if not isinstance(color_name, str) or not color_name.strip():
            color_name = 'Default'
        normalized_color = color_name.strip().title()

        color_code = raw_variant.get('colorCode')
        sku_code = raw_variant.get('skuCode')
        key = (
            normalized_color,
            str(color_code).strip() if isinstance(color_code, str) and color_code.strip() else None,
            str(sku_code).strip().upper() if isinstance(sku_code, str) and sku_code.strip() else None,
        )

        variant_entry = grouped_variants.setdefault(
            key,
            {
                'colorName': normalized_color,
                'sizes': [],
            },
        )
        if key[1]:
            variant_entry['colorCode'] = key[1]
        if key[2]:
            variant_entry['skuCode'] = key[2]
        if isinstance(raw_variant.get('priceOverride'), int):
            variant_entry['priceOverride'] = raw_variant['priceOverride']
        if isinstance(raw_variant.get('media'), list):
            variant_entry['media'] = [item for item in raw_variant['media'] if isinstance(item, dict)]

        nested_sizes = raw_variant.get('sizes')
        if isinstance(nested_sizes, list):
            size_candidates = nested_sizes
        else:
            size_candidates = [raw_variant]

        for raw_size in size_candidates:
            if not isinstance(raw_size, dict):
                continue
            normalized_size = _normalize_product_size(raw_size)
            if normalized_size:
                variant_entry['sizes'].append(normalized_size)

    normalized_variants = [variant for variant in grouped_variants.values() if variant.get('sizes')]

    return {
        'product': {
            'styleCode': payload.get('styleCode'),
            'name': payload.get('name'),
            'category': payload.get('category', ''),
            'brand': payload.get('brand', ''),
            'basePrice': payload.get('basePrice'),
            'categoryId': payload.get('categoryId'),
            'status': payload.get('status', 'active'),
        },
        'styleMedia': [item for item in payload.get('styleMedia', []) if isinstance(item, dict)]
        if isinstance(payload.get('styleMedia'), list)
        else [],
        'variants': normalized_variants,
    }


class SemanticToolCatalog:
    def __init__(self, *, backend: BackendClient, auth: AuthContext) -> None:
        self._backend = backend
        self._auth = auth
        self._tools = self._build_tools()

    def definitions(self) -> list[SemanticTool]:
        return list(self._tools.values())

    def schema_catalog(self) -> list[dict[str, Any]]:
        return [
            {
                'name': tool.name,
                'description': tool.description,
                'inputSchema': tool.input_schema,
                'riskLevel': tool.risk_level,
                'sideEffect': tool.side_effect,
            }
            for tool in self.definitions()
        ]

    def get(self, name: str) -> SemanticTool | None:
        return self._tools.get(name)

    async def invoke(self, name: str, payload: dict[str, Any]) -> dict[str, Any]:
        tool = self.get(name)
        if tool is None:
            raise RuntimeError(f'Unknown semantic tool: {name}')
        return await tool.executor(payload)

    def _build_tools(self) -> dict[str, SemanticTool]:
        auth = self._auth
        backend = self._backend

        async def navigation_find(payload: dict[str, Any]) -> dict[str, Any]:
            query = str(payload.get('query') or '')
            normalized = query.lower()
            rows = [
                target
                for target in NAVIGATION_TARGETS
                if normalized in target['label'].lower()
                or normalized in target['description'].lower()
                or any(normalized in keyword.lower() for keyword in target.get('keywords', []))
            ][:5]
            return {'rows': rows}

        async def inventory_stock_on_hand(payload: dict[str, Any]) -> dict[str, Any]:
            params = {
                key: value
                for key, value in {
                    'sku': payload.get('sku'),
                    'locationId': payload.get('locationId'),
                }.items()
                if value
            }
            result = await backend.stock_on_hand(auth.access_token or '', auth.tenant_id, params)
            rows = result if isinstance(result, list) else [result]
            return {'rows': [row for row in rows if isinstance(row, dict)]}

        async def inventory_transfer(payload: dict[str, Any]) -> dict[str, Any]:
            result = await backend.transfer_stock(auth.access_token or '', auth.tenant_id, payload)
            return {'result': result}

        async def inventory_adjust(payload: dict[str, Any]) -> dict[str, Any]:
            result = await backend.adjust_stock(auth.access_token or '', auth.tenant_id, payload)
            return {'result': result}

        async def inventory_receive(payload: dict[str, Any]) -> dict[str, Any]:
            result = await backend.receive_stock(auth.access_token or '', auth.tenant_id, payload)
            return {'result': result}

        async def reporting_stock(payload: dict[str, Any]) -> dict[str, Any]:
            rows = await backend.reporting_stock_summary(auth.access_token or '', auth.tenant_id, payload)
            return {'rows': rows}

        async def purchasing_create_po(payload: dict[str, Any]) -> dict[str, Any]:
            result = await backend.create_po(auth.access_token or '', auth.tenant_id, payload)
            return {'result': result}

        async def sales_create_invoice(payload: dict[str, Any]) -> dict[str, Any]:
            result = await backend.create_invoice(auth.access_token or '', auth.tenant_id, payload)
            return {'result': result}

        async def products_create(payload: dict[str, Any]) -> dict[str, Any]:
            normalized_payload = _normalize_product_create_payload(payload)
            result = await backend.create_product(auth.access_token or '', auth.tenant_id, normalized_payload)
            return {'result': result}

        return {
            'navigation.find_screen': SemanticTool(
                name='navigation.find_screen',
                description='Find the most relevant internal screen for a user workflow request.',
                input_schema=_object_schema({'query': {'type': 'string'}}, ['query']),
                risk_level='low',
                side_effect=False,
                output_mode='navigation',
                executor=navigation_find,
            ),
            'inventory.stock_on_hand': SemanticTool(
                name='inventory.stock_on_hand',
                description='Read stock on hand rows filtered by SKU or location.',
                input_schema=_object_schema(
                    {
                        'sku': {'type': ['string', 'null']},
                        'locationId': {'type': ['string', 'null']},
                    }
                ),
                risk_level='low',
                side_effect=False,
                output_mode='table',
                executor=inventory_stock_on_hand,
            ),
            'inventory.transfer_stock': SemanticTool(
                name='inventory.transfer_stock',
                description='Transfer stock between locations.',
                input_schema=_object_schema(
                    {
                        'fromLocationId': {'type': 'string'},
                        'toLocationId': {'type': 'string'},
                        'sizeId': {'type': 'string'},
                        'quantity': {'type': 'integer'},
                        'reason': {'type': 'string'},
                    },
                    ['fromLocationId', 'toLocationId', 'sizeId', 'quantity', 'reason'],
                ),
                risk_level='high',
                side_effect=True,
                output_mode='mutation',
                executor=inventory_transfer,
            ),
            'inventory.adjust_stock': SemanticTool(
                name='inventory.adjust_stock',
                description='Adjust stock at a location for a specific SKU size.',
                input_schema=_object_schema(
                    {
                        'locationId': {'type': 'string'},
                        'sizeId': {'type': 'string'},
                        'quantity': {'type': 'integer'},
                        'reason': {'type': 'string'},
                    },
                    ['locationId', 'sizeId', 'quantity', 'reason'],
                ),
                risk_level='high',
                side_effect=True,
                output_mode='mutation',
                executor=inventory_adjust,
            ),
            'inventory.receive_stock': SemanticTool(
                name='inventory.receive_stock',
                description='Receive stock into a location for a specific SKU size.',
                input_schema=_object_schema(
                    {
                        'locationId': {'type': 'string'},
                        'sizeId': {'type': 'string'},
                        'quantity': {'type': 'integer'},
                        'reason': {'type': 'string'},
                    },
                    ['locationId', 'sizeId', 'quantity', 'reason'],
                ),
                risk_level='medium',
                side_effect=True,
                output_mode='mutation',
                executor=inventory_receive,
            ),
            'reporting.stock_summary': SemanticTool(
                name='reporting.stock_summary',
                description='Read stock reporting summaries for internal operators.',
                input_schema=_object_schema(
                    {
                        'locationId': {'type': ['string', 'null']},
                        'status': {'type': ['string', 'null']},
                        'from': {'type': ['string', 'null']},
                    }
                ),
                risk_level='low',
                side_effect=False,
                output_mode='table',
                executor=reporting_stock,
            ),
            'purchasing.create_po': SemanticTool(
                name='purchasing.create_po',
                description='Create a purchase order draft.',
                input_schema=_object_schema(
                    {
                        'supplierId': {'type': 'string'},
                        'expectedDate': {'type': ['string', 'null']},
                        'lines': {'type': 'array', 'items': {'type': 'object'}},
                    },
                    ['supplierId', 'lines'],
                ),
                risk_level='high',
                side_effect=True,
                output_mode='mutation',
                executor=purchasing_create_po,
            ),
            'sales.create_invoice': SemanticTool(
                name='sales.create_invoice',
                description='Create a sales order or invoice.',
                input_schema=_object_schema(
                    {
                        'customerId': {'type': 'string'},
                        'lines': {'type': 'array', 'items': {'type': 'object'}},
                    },
                    ['customerId', 'lines'],
                ),
                risk_level='high',
                side_effect=True,
                output_mode='mutation',
                executor=sales_create_invoice,
            ),
            'products.create_product': SemanticTool(
                name='products.create_product',
                description='Create a product with style, variants, and optional stock setup.',
                input_schema=_object_schema(
                    {
                        'styleCode': {'type': 'string'},
                        'name': {'type': 'string'},
                        'categoryId': {'type': ['string', 'null']},
                        'basePrice': {'type': 'integer'},
                        'variants': {'type': 'array', 'items': {'type': 'object'}},
                    },
                    ['styleCode', 'name', 'basePrice', 'variants'],
                ),
                risk_level='high',
                side_effect=True,
                output_mode='mutation',
                executor=products_create,
            ),
        }
