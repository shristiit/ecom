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
        available = ', '.join(str(l.get('name') or l.get('code')) for l in items[:10])
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
        return await self.sku_size(product_name, size_label, color_name)
