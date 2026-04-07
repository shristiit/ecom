from __future__ import annotations

import re

from conversational_engine.agents.parsing import normalize, normalized_tokens, parse_uuid
from conversational_engine.clients.backend import BackendClient
from conversational_engine.contracts.auth import AuthContext


class EntityResolver:
    def __init__(self, backend: BackendClient) -> None:
        self._backend = backend

    async def match_location(
        self,
        auth: AuthContext,
        text: str,
        *,
        qualifier: str | None = None,
    ) -> dict[str, str] | None:
        message = text
        if qualifier:
            qualifier_match = re.search(rf'{qualifier}\s+([A-Za-z0-9 \-]+)', text, re.IGNORECASE)
            if qualifier_match:
                message = qualifier_match.group(1)

        locations = await self._backend.list_locations(auth.access_token or '', auth.tenant_id)
        target = normalize(message)
        target_tokens = normalized_tokens(message)
        for location in locations:
            name = str(location.get('name') or '')
            code = str(location.get('code') or '')
            normalized_name = normalize(name)
            normalized_code = normalize(code)
            name_tokens = normalized_tokens(name)
            code_tokens = normalized_tokens(code)
            if (
                normalized_name in target
                or normalized_code in target
                or target in normalized_name
                or target in normalized_code
                or bool(target_tokens & name_tokens)
                or bool(target_tokens & code_tokens)
            ):
                return {'id': str(location['id']), 'label': f'{name} ({code})'}
        return None

    async def list_locations(self, auth: AuthContext) -> list[dict[str, object]]:
        return await self._backend.list_locations(auth.access_token or '', auth.tenant_id)

    async def match_supplier(self, auth: AuthContext, text: str) -> dict[str, str] | None:
        suppliers = await self._backend.list_suppliers(auth.access_token or '', auth.tenant_id)
        target = normalize(text)
        for supplier in suppliers:
            name = str(supplier.get('name') or '')
            if normalize(name) in target:
                return {'id': str(supplier['id']), 'label': name}
        return None

    async def match_customer(self, auth: AuthContext, text: str) -> dict[str, str] | None:
        customers = await self._backend.list_customers(auth.access_token or '', auth.tenant_id)
        target = normalize(text)
        for customer in customers:
            name = str(customer.get('name') or '')
            if normalize(name) in target:
                return {'id': str(customer['id']), 'label': name}
        return None

    async def match_category(self, auth: AuthContext, text: str) -> dict[str, str] | None:
        categories = await self._backend.list_categories(auth.access_token or '', auth.tenant_id)
        target = normalize(text)
        for category in categories:
            name = str(category.get('name') or '')
            if normalize(name) in target:
                return {'id': str(category['id']), 'label': name}
        return None

    async def match_po(self, auth: AuthContext, text: str) -> dict[str, str] | None:
        uuid_value = parse_uuid(text)
        if uuid_value:
            return {'id': uuid_value, 'number': uuid_value[:8]}

        payload = await self._backend.list_pos(auth.access_token or '', auth.tenant_id, params={'pageSize': 50})
        items = payload.get('items', []) if isinstance(payload, dict) else []
        target = normalize(text)
        for item in items:
            if not isinstance(item, dict):
                continue
            number = str(item.get('number') or '')
            supplier_name = str(item.get('supplierName') or '')
            identifier = str(item.get('id') or '')
            if normalize(number) in target or identifier[:8].lower() in target or normalize(supplier_name) in target:
                return {'id': identifier, 'number': number or identifier[:8]}
        return None

    async def match_invoice(self, auth: AuthContext, text: str) -> dict[str, str] | None:
        uuid_value = parse_uuid(text)
        if uuid_value:
            return {'id': uuid_value, 'number': f'SO-{uuid_value[:8].upper()}'}

        payload = await self._backend.list_invoices(
            auth.access_token or '',
            auth.tenant_id,
            params={'pageSize': 50},
        )
        items = payload.get('items', []) if isinstance(payload, dict) else []
        target = normalize(text)
        for item in items:
            if not isinstance(item, dict):
                continue
            number = str(item.get('number') or '')
            customer_name = str(item.get('customerName') or '')
            identifier = str(item.get('id') or '')
            if normalize(number) in target or identifier[:8].lower() in target or normalize(customer_name) in target:
                return {'id': identifier, 'number': number or f'SO-{identifier[:8].upper()}'}
        return None

    async def match_product(self, auth: AuthContext, text: str) -> dict[str, str] | None:
        uuid_value = parse_uuid(text)
        if uuid_value:
            product = await self._backend.get_product(auth.access_token or '', auth.tenant_id, uuid_value)
            product_name = str(product.get('product', {}).get('name') or uuid_value)
            return {'id': uuid_value, 'label': product_name}

        products = await self._backend.list_products(auth.access_token or '', auth.tenant_id)
        target = normalize(text)
        for product in products:
            if not isinstance(product, dict):
                continue
            name = str(product.get('name') or '')
            style_code = str(product.get('style_code') or product.get('styleCode') or '')
            if normalize(name) in target or normalize(style_code) in target:
                return {'id': str(product['id']), 'label': f'{name} ({style_code})'.strip()}
        return None

    async def resolve_size_reference(
        self,
        auth: AuthContext,
        *,
        sku_code: str,
        size_label: str,
    ) -> dict[str, str] | None:
        if not sku_code or not size_label:
            return None

        skus = await self._backend.search_skus(auth.access_token or '', auth.tenant_id, sku_code)
        if not skus:
            return {'skuCode': sku_code.upper(), 'sizeLabel': size_label.upper()}

        sku = skus[0]
        product_id = str(sku.get('product_id') or sku.get('productId') or '')
        if not product_id:
            return {'skuCode': sku_code.upper(), 'sizeLabel': size_label.upper()}

        product_detail = await self._backend.get_product(auth.access_token or '', auth.tenant_id, product_id)
        sizes = product_detail.get('sizes', [])
        skus_detail = product_detail.get('skus', [])
        existing_sku_id: str | None = None
        for sku_item in skus_detail:
            if not isinstance(sku_item, dict):
                continue
            if str(sku_item.get('sku_code') or '').upper() == sku_code.upper():
                existing_sku_id = str(sku_item['id'])
                break

        for size in sizes:
            if not isinstance(size, dict):
                continue
            if existing_sku_id and str(size.get('sku_id')) != existing_sku_id:
                continue
            if str(size.get('size_label') or '').upper() != size_label.upper():
                continue
            return {
                'sizeId': str(size['id']),
                'sizeLabel': str(size['size_label']),
                'skuCode': sku_code.upper(),
                'existingSkuId': existing_sku_id,
                'existingSizeId': str(size['id']),
            }
        return {
            'skuCode': sku_code.upper(),
            'sizeLabel': size_label.upper(),
            'existingSkuId': existing_sku_id,
        }
