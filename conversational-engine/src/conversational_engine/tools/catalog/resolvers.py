from __future__ import annotations

from typing import Any

from conversational_engine.clients.backend import BackendClient
from conversational_engine.contracts.auth import AuthContext

from .utils import best_match, is_uuid


class EntityResolver:
    """Resolves human-readable names (locations, suppliers, products…) to backend UUIDs."""

    def __init__(self, backend: BackendClient, auth: AuthContext) -> None:
        self._backend = backend
        self._auth = auth

    @property
    def _token(self) -> str:
        return self._auth.access_token or ''

    @property
    def _tenant(self) -> str:
        return self._auth.tenant_id

    async def location(self, name_or_id: str) -> str:
        if is_uuid(name_or_id):
            return name_or_id
        items = await self._backend.list_locations(self._token, self._tenant)
        match = best_match(items, name_or_id, 'name', 'code')
        if match:
            return str(match['id'])
        available = ', '.join(str(location.get('name') or location.get('code')) for location in items[:10])
        raise ValueError(f'Location "{name_or_id}" not found. Available: {available}')

    async def supplier(self, name_or_id: str) -> str:
        if is_uuid(name_or_id):
            return name_or_id
        items = await self._backend.list_suppliers(self._token, self._tenant)
        match = best_match(items, name_or_id, 'name', 'code')
        if match:
            return str(match['id'])
        available = ', '.join(str(s.get('name')) for s in items[:10])
        raise ValueError(f'Supplier "{name_or_id}" not found. Available: {available}')

    async def customer(self, name_or_id: str) -> str:
        if is_uuid(name_or_id):
            return name_or_id
        items = await self._backend.list_customers(self._token, self._tenant)
        match = best_match(items, name_or_id, 'name', 'email', 'code')
        if match:
            return str(match['id'])
        available = ', '.join(str(c.get('name')) for c in items[:10])
        raise ValueError(f'Customer "{name_or_id}" not found. Available: {available}')

    async def category(self, name_or_id: str) -> str:
        if is_uuid(name_or_id):
            return name_or_id
        items = await self._backend.list_categories(self._token, self._tenant)
        match = best_match(items, name_or_id, 'name')
        if match:
            return str(match['id'])
        available = ', '.join(str(c.get('name')) for c in items[:10])
        raise ValueError(f'Category "{name_or_id}" not found. Available: {available}')

    async def purchase_order(self, number_or_id: str) -> str:
        if is_uuid(number_or_id):
            return number_or_id
        payload = await self._backend.list_pos(self._token, self._tenant)
        items = payload.get('items') if isinstance(payload, dict) else None
        rows = items if isinstance(items, list) else []
        match = best_match(rows, number_or_id, 'number', 'id', 'supplierName', 'supplier_name')
        if match:
            return str(match['id'])
        available = ', '.join(str(row.get('number') or row.get('id')) for row in rows[:10])
        raise ValueError(f'Purchase order "{number_or_id}" not found. Available: {available or "none"}')

    async def invoice(self, number_or_id: str) -> str:
        if is_uuid(number_or_id):
            return number_or_id
        payload = await self._backend.list_invoices(self._token, self._tenant)
        items = payload.get('items') if isinstance(payload, dict) else None
        rows = items if isinstance(items, list) else []
        match = best_match(rows, number_or_id, 'number', 'id', 'customerName', 'customer_name')
        if match:
            return str(match['id'])
        available = ', '.join(str(row.get('number') or row.get('id')) for row in rows[:10])
        raise ValueError(f'Sales order "{number_or_id}" not found. Available: {available or "none"}')

    async def sku_size(
        self,
        product_name: str,
        size_label: str,
        color_name: str | None = None,
    ) -> str:
        """Resolve product name + size label (+ optional colour) to a sku_size UUID."""
        products = await self._backend.search_products(self._token, self._tenant, q=product_name)
        if not products:
            raise ValueError(f'Product "{product_name}" not found.')

        full = await self._backend.get_product(self._token, self._tenant, str(products[0]['id']))
        skus: list[dict[str, Any]] = full.get('skus') or []  # type: ignore[assignment]
        sizes: list[dict[str, Any]] = full.get('sizes') or []  # type: ignore[assignment]

        if color_name:
            cnl = color_name.lower()
            colour_skus = [s for s in skus if cnl in str(s.get('color_name') or '').lower()]
            candidate_skus = colour_skus or skus
        else:
            candidate_skus = skus

        candidate_ids = {str(s['id']) for s in candidate_skus}
        sl = size_label.upper().strip()

        for size in sizes:
            if str(size.get('sku_id')) in candidate_ids:
                if str(size.get('size_label') or '').upper().strip() == sl:
                    return str(size['id'])
        for size in sizes:
            if str(size.get('sku_id')) in candidate_ids:
                if sl in str(size.get('size_label') or '').upper():
                    return str(size['id'])

        available = ', '.join(
            str(s.get('size_label')) for s in sizes if str(s.get('sku_id')) in candidate_ids
        )
        raise ValueError(
            f'Size "{size_label}" not found for "{product_name}". Available: {available or "none"}'
        )

    async def sku_size_details(
        self,
        product_name: str,
        size_label: str,
        color_name: str | None = None,
    ) -> dict[str, int | str]:
        """Resolve a sales-order line to a sku_size UUID and effective unit price."""
        products = await self._backend.search_products(self._token, self._tenant, q=product_name)
        if not products:
            raise ValueError(f'Product "{product_name}" not found.')

        full = await self._backend.get_product(self._token, self._tenant, str(products[0]['id']))
        product = full.get('product') or {}
        skus: list[dict[str, Any]] = full.get('skus') or []  # type: ignore[assignment]
        sizes: list[dict[str, Any]] = full.get('sizes') or []  # type: ignore[assignment]

        available_colors = sorted(
            {
                str(sku.get('color_name')).strip()
                for sku in skus
                if isinstance(sku.get('color_name'), str) and str(sku.get('color_name')).strip()
            }
        )

        if color_name:
            cnl = color_name.lower()
            colour_skus = [s for s in skus if cnl in str(s.get('color_name') or '').lower()]
            if not colour_skus:
                available = ', '.join(available_colors[:10]) or 'none'
                raise ValueError(f'Color "{color_name}" not found for "{product_name}". Available: {available}')
            candidate_skus = colour_skus
        else:
            if len(available_colors) > 1:
                available = ', '.join(available_colors[:10])
                raise ValueError(f'Color is required for "{product_name}". Available: {available}')
            candidate_skus = skus

        candidate_ids = {str(s['id']) for s in candidate_skus}
        sku_by_id = {str(s['id']): s for s in candidate_skus}
        sl = size_label.upper().strip()
        candidate_sizes = [size for size in sizes if str(size.get('sku_id')) in candidate_ids]
        available_sizes = sorted(
            {
                str(size.get('size_label')).strip().upper()
                for size in candidate_sizes
                if str(size.get('size_label') or '').strip()
            }
        )

        def effective_unit_price(size: dict[str, Any]) -> int:
            sku = sku_by_id.get(str(size.get('sku_id')))
            raw_price = size.get('price_override')
            if raw_price is None and isinstance(sku, dict):
                raw_price = sku.get('price_override')
            if raw_price is None:
                raw_price = product.get('base_price')
            if raw_price is None:
                raise ValueError(
                    f'Unit price is not configured for "{product_name}" {color_name or ""} {size_label}'.strip()
                )
            return int(raw_price)

        if not sl:
            if len(available_sizes) > 1:
                available = ', '.join(available_sizes[:10]) or 'none'
                raise ValueError(
                    f'Size is required for "{product_name}" {color_name or ""}. Available: {available}'.strip()
                )
            if len(candidate_sizes) == 1:
                size = candidate_sizes[0]
                return {'sizeId': str(size['id']), 'unitPrice': effective_unit_price(size)}
            raise ValueError(f'Size is required for "{product_name}" {color_name or ""}.'.strip())

        exact_matches = [
            size
            for size in candidate_sizes
            if str(size.get('size_label') or '').upper().strip() == sl
        ]
        if len(exact_matches) == 1:
            size = exact_matches[0]
            return {'sizeId': str(size['id']), 'unitPrice': effective_unit_price(size)}

        partial_matches = [
            size
            for size in candidate_sizes
            if sl in str(size.get('size_label') or '').upper()
        ]
        if len(partial_matches) == 1:
            size = partial_matches[0]
            return {'sizeId': str(size['id']), 'unitPrice': effective_unit_price(size)}

        available = ', '.join(available_sizes[:10])
        raise ValueError(
            f'Size "{size_label}" not found for "{product_name}". Available: {available or "none"}'
        )

    async def size_from_payload(self, payload: dict[str, Any]) -> str:
        """Return a sizeId UUID from a tool payload, resolving by name if necessary."""
        size_id = str(payload.get('sizeId') or '').strip()
        if size_id and is_uuid(size_id):
            return size_id
        product_name = str(payload.get('productName') or '').strip()
        size_label = str(payload.get('sizeLabel') or size_id).strip()
        color_name = str(payload.get('colorName') or '').strip() or None
        if not product_name or not size_label:
            raise ValueError(
                'Provide either a sizeId UUID, or productName + sizeLabel (and optionally colorName).'
            )
        details = await self.sku_size_details(product_name, size_label, color_name)
        return str(details['sizeId'])

    async def size_lines_from_product(
        self,
        product_name: str,
        *,
        color_name: str | None = None,
        size_labels: list[str] | None = None,
    ) -> list[dict[str, str]]:
        """Expand a product reference into concrete size rows for matching colours/sizes."""
        products = await self._backend.search_products(self._token, self._tenant, q=product_name)
        if not products:
            raise ValueError(f'Product "{product_name}" not found.')

        full = await self._backend.get_product(self._token, self._tenant, str(products[0]['id']))
        skus: list[dict[str, Any]] = full.get('skus') or []  # type: ignore[assignment]
        sizes: list[dict[str, Any]] = full.get('sizes') or []  # type: ignore[assignment]

        available_colors = sorted(
            {
                str(sku.get('color_name')).strip()
                for sku in skus
                if isinstance(sku.get('color_name'), str) and str(sku.get('color_name')).strip()
            }
        )

        if color_name:
            cnl = color_name.lower()
            candidate_skus = [sku for sku in skus if cnl in str(sku.get('color_name') or '').lower()]
            if not candidate_skus:
                available = ', '.join(available_colors[:10]) or 'none'
                raise ValueError(f'Color "{color_name}" not found for "{product_name}". Available: {available}')
        else:
            if len(available_colors) > 1:
                available = ', '.join(available_colors[:10])
                raise ValueError(f'Color is required for "{product_name}". Available: {available}')
            candidate_skus = skus

        wanted_sizes = [label.strip().upper() for label in (size_labels or []) if label.strip()]
        candidate_ids = {str(sku['id']) for sku in candidate_skus}
        color_by_sku_id = {str(sku['id']): str(sku.get('color_name') or '').strip() for sku in candidate_skus}
        matching_sizes = [size for size in sizes if str(size.get('sku_id')) in candidate_ids]

        if wanted_sizes:
            filtered_sizes = [
                size
                for size in matching_sizes
                if str(size.get('size_label') or '').strip().upper() in wanted_sizes
            ]
            if len(filtered_sizes) != len(wanted_sizes):
                available = ', '.join(
                    sorted(
                        {
                            str(size.get('size_label') or '').strip().upper()
                            for size in matching_sizes
                            if str(size.get('size_label') or '').strip()
                        }
                    )[:10]
                )
                raise ValueError(
                    f'Not all requested sizes are available for "{product_name}". Available: {available or "none"}'
                )
            matching_sizes = filtered_sizes

        rows = [
            {
                'sizeId': str(size['id']),
                'sizeLabel': str(size.get('size_label') or '').strip().upper(),
                'colorName': color_by_sku_id.get(str(size.get('sku_id')), ''),
            }
            for size in matching_sizes
        ]
        rows.sort(key=lambda row: (row['colorName'], row['sizeLabel']))
        return rows
