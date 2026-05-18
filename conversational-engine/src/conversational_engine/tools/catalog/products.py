from __future__ import annotations

from typing import Any

from conversational_engine.clients.backend import BackendClient
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.tools.definitions import SemanticTool

from .normalizers import normalize_product_create_payload
from .resolvers import EntityResolver
from .utils import ToolPreparationError, is_uuid, object_schema

PRODUCT_SIZE_SCHEMA = object_schema(
    {
        'sizeLabel': {'type': ['string', 'null']},
        'size': {'type': ['string', 'null']},
        'barcode': {'type': ['string', 'null']},
        'locationId': {'type': ['string', 'null']},
        'quantity': {'type': ['integer', 'null']},
        'stockByLocation': {
            'type': ['array', 'null'],
            'items': object_schema(
                {
                    'locationId': {'type': 'string'},
                    'quantity': {'type': 'integer'},
                }
            ),
        },
    }
)
PRODUCT_VARIANT_SCHEMA = object_schema(
    {
        'colorName': {'type': ['string', 'null']},
        'color': {'type': ['string', 'null']},
        'skuCode': {'type': ['string', 'null']},
        'sizes': {'type': ['array', 'null'], 'items': PRODUCT_SIZE_SCHEMA},
        'sizeLabel': {'type': ['string', 'null']},
        'size': {'type': ['string', 'null']},
        'locationId': {'type': ['string', 'null']},
        'quantity': {'type': ['integer', 'null']},
    }
)


def build_product_tools(
    backend: BackendClient, auth: AuthContext, resolver: EntityResolver
) -> dict[str, SemanticTool]:
    token = auth.access_token or ''
    tenant = auth.tenant_id

    async def search_products(payload: dict[str, Any]) -> dict[str, Any]:
        raw = await backend.search_products(
            token, tenant,
            q=payload.get('query') or None,
            color=payload.get('color') or None,
            category=payload.get('category') or None,
            brand=payload.get('brand') or None,
        )
        display_fields = ('name', 'style_code', 'category', 'brand', 'base_price', 'status')
        rows = [
            {k: row[k] for k in display_fields if k in row}
            for row in (raw if isinstance(raw, list) else [])
            if isinstance(row, dict)
        ]
        return {'rows': rows}

    async def prepare_create_product(payload: dict[str, Any]) -> dict[str, Any]:
        resolved = dict(payload)
        product_payload = dict(resolved['product']) if isinstance(resolved.get('product'), dict) else None
        category_ref = str(payload.get('categoryId') or '').strip()
        if not category_ref and isinstance(product_payload, dict):
            category_ref = str(product_payload.get('categoryId') or '').strip()
        if category_ref and not is_uuid(category_ref):
            resolved_category_id = await resolver.category(category_ref)
            if isinstance(product_payload, dict):
                product_payload['categoryId'] = resolved_category_id
                resolved['product'] = product_payload
            else:
                resolved['categoryId'] = resolved_category_id

        raw_variants = payload.get('variants')
        if isinstance(raw_variants, list):
            for variant in raw_variants:
                if not isinstance(variant, dict):
                    continue
                size_candidates = variant.get('sizes') if isinstance(variant.get('sizes'), list) else [variant]
                for raw_size in size_candidates:
                    if not isinstance(raw_size, dict):
                        continue
                    has_location = bool(raw_size.get('locationId'))
                    has_quantity = isinstance(raw_size.get('quantity'), int)
                    if has_location ^ has_quantity:
                        raise ToolPreparationError(
                            'If you want initial stock, provide both location and quantity. Otherwise omit both.',
                            ['location_and_quantity'],
                        )

        normalized = normalize_product_create_payload(resolved)
        product = normalized.get('product') if isinstance(normalized.get('product'), dict) else {}
        if not product.get('styleCode'):
            raise ToolPreparationError('What style code should this product use?', ['style_code'])
        if not product.get('name'):
            raise ToolPreparationError('What product name should I use?', ['name'])
        if product.get('basePrice') is None:
            raise ToolPreparationError('What base price should I set?', ['base_price'])
        variants = normalized.get('variants')
        if not isinstance(variants, list) or not variants:
            raise ToolPreparationError('What color variants and sizes should I create?', ['color_name', 'size_labels'])
        if not any(isinstance(variant, dict) and variant.get('sizes') for variant in variants):
            raise ToolPreparationError('Which sizes should I create? Reply like `S, M, L`.', ['size_labels'])
        return normalized

    async def find_product(payload: dict[str, Any]) -> dict[str, Any]:
        query = str(payload.get('query') or '').strip()
        sku_code = str(payload.get('skuCode') or payload.get('sku') or '').strip()
        rows: list[dict[str, Any]] = []
        if sku_code:
            sku_matches = await backend.search_skus(token, tenant, sku_code)
            display_fields = ('sku_code', 'product_name', 'color_name', 'size_label', 'product_id')
            rows = [
                {k: row[k] for k in display_fields if k in row}
                for row in (sku_matches if isinstance(sku_matches, list) else [])
                if isinstance(row, dict)
            ]
        if not rows and query:
            raw = await backend.search_products(token, tenant, q=query)
            display_fields_p = ('name', 'style_code', 'category', 'brand', 'base_price', 'status')
            rows = [
                {k: row[k] for k in display_fields_p if k in row}
                for row in (raw if isinstance(raw, list) else [])
                if isinstance(row, dict)
            ]
        return {'rows': rows}

    async def create_product(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.create_product(token, tenant, payload)}

    return {
        'products.search_products': SemanticTool(
            name='products.search_products',
            description=(
                'Search existing products by name, colour, category, or brand. '
                'Use this when the user wants to find similar products — for example after '
                'analysing an image to extract colour, style type, or category.'
            ),
            input_schema=object_schema({
                'query': {'type': ['string', 'null'], 'description': 'Search by product name or style code'},
                'color': {'type': ['string', 'null'], 'description': 'Filter by colour name (e.g. "blue", "red")'},
                'category': {'type': ['string', 'null'], 'description': 'Filter by product category'},
                'brand': {'type': ['string', 'null'], 'description': 'Filter by brand name'},
            }),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=search_products,
        ),
        'products.find_product': SemanticTool(
            name='products.find_product',
            description=(
                'Find a product by name OR by SKU code / style code. '
                'Use this when the user references a product by a SKU code like "NAR243-RED-01" '
                'or a style code. Returns matching product and variant rows.'
            ),
            input_schema=object_schema({
                'query': {'type': ['string', 'null'], 'description': 'Product name or partial name to search'},
                'skuCode': {'type': ['string', 'null'], 'description': 'SKU code or style code (e.g. "NAR243-RED-01")'},
                'sku': {'type': ['string', 'null'], 'description': 'Alias for skuCode'},
            }),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=find_product,
        ),
        'products.create_product': SemanticTool(
            name='products.create_product',
            description=(
                'Create a product with style, variants, and optional stock setup. '
                'Category accepts a name or UUID.'
            ),
            input_schema=object_schema(
                {
                    'styleCode': {'type': 'string'},
                    'name': {'type': 'string'},
                    'categoryId': {'type': ['string', 'null'], 'description': 'Category name or UUID'},
                    'basePrice': {'type': 'integer'},
                    'pickupEnabled': {'type': ['boolean', 'null']},
                    'variants': {'type': 'array', 'items': PRODUCT_VARIANT_SCHEMA},
                },
                ['styleCode', 'name', 'basePrice', 'variants'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=create_product,
            preparer=prepare_create_product,
        ),
    }
