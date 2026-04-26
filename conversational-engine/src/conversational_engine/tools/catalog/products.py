from __future__ import annotations

from typing import Any

from conversational_engine.clients.backend import BackendClient
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.tools.definitions import SemanticTool
from .normalizers import normalize_product_create_payload
from .resolvers import EntityResolver
from .utils import is_uuid, object_schema


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

    async def create_product(payload: dict[str, Any]) -> dict[str, Any]:
        resolved = dict(payload)
        if cat := str(payload.get('categoryId') or '').strip():
            if not is_uuid(cat):
                resolved['categoryId'] = await resolver.category(cat)
        normalized = normalize_product_create_payload(resolved)
        return {'result': await backend.create_product(token, tenant, normalized)}

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
        'products.create_product': SemanticTool(
            name='products.create_product',
            description='Create a product with style, variants, and optional stock setup. Category accepts a name or UUID.',
            input_schema=object_schema(
                {
                    'styleCode': {'type': 'string'},
                    'name': {'type': 'string'},
                    'categoryId': {'type': ['string', 'null'], 'description': 'Category name or UUID'},
                    'basePrice': {'type': 'integer'},
                    'variants': {'type': 'array', 'items': {'type': 'object'}},
                },
                ['styleCode', 'name', 'basePrice', 'variants'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=create_product,
        ),
    }
