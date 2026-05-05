from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from conversational_engine.clients.backend import BackendClient
from conversational_engine.contracts.auth import AuthContext

from .utils import is_uuid


@dataclass(frozen=True, slots=True)
class ResolutionCandidate:
    id: str
    label: str


@dataclass(frozen=True, slots=True)
class ResolutionResult:
    status: str
    value: str | None = None
    message: str = ''
    candidates: tuple[ResolutionCandidate, ...] = ()


class ResolutionError(ValueError):
    def __init__(self, result: ResolutionResult) -> None:
        super().__init__(result.message)
        self.result = result


class EntityResolver:
    """Resolves human-readable names (locations, suppliers, products…) to backend UUIDs."""

    def __init__(self, backend: BackendClient, auth: AuthContext) -> None:
        self._backend = backend
        self._auth = auth
        self._cache: dict[str, object] = {}

    @property
    def _token(self) -> str:
        return self._auth.access_token or ''

    @property
    def _tenant(self) -> str:
        return self._auth.tenant_id

    async def location(self, name_or_id: str) -> str:
        if is_uuid(name_or_id):
            return name_or_id
        items = await self._cached_rows('locations', lambda: self._backend.list_locations(self._token, self._tenant))
        return self._require_resolved(
            self._resolve_named_entity(
                items,
                name_or_id,
                match_fields=('id', 'name', 'code'),
                label_fields=('name', 'code'),
                singular='location',
                plural='locations',
            )
        )

    async def supplier(self, name_or_id: str) -> str:
        if is_uuid(name_or_id):
            return name_or_id
        items = await self._cached_rows('suppliers', lambda: self._backend.list_suppliers(self._token, self._tenant))
        return self._require_resolved(
            self._resolve_named_entity(
                items,
                name_or_id,
                match_fields=('id', 'name', 'code'),
                label_fields=('name', 'code'),
                singular='supplier',
                plural='suppliers',
            )
        )

    async def customer(self, name_or_id: str) -> str:
        if is_uuid(name_or_id):
            return name_or_id
        items = await self._cached_rows('customers', lambda: self._backend.list_customers(self._token, self._tenant))
        return self._require_resolved(
            self._resolve_named_entity(
                items,
                name_or_id,
                match_fields=('id', 'name', 'email', 'code'),
                label_fields=('name', 'email', 'code'),
                singular='customer',
                plural='customers',
            )
        )

    async def category(self, name_or_id: str) -> str:
        if is_uuid(name_or_id):
            return name_or_id
        items = await self._cached_rows('categories', lambda: self._backend.list_categories(self._token, self._tenant))
        return self._require_resolved(
            self._resolve_named_entity(
                items,
                name_or_id,
                match_fields=('id', 'name'),
                label_fields=('name',),
                singular='category',
                plural='categories',
            )
        )

    async def purchase_order(self, number_or_id: str) -> str:
        if is_uuid(number_or_id):
            return number_or_id
        payload = await self._cached_value('purchase_orders', lambda: self._backend.list_pos(self._token, self._tenant))
        items = payload.get('items') if isinstance(payload, dict) else None
        rows = items if isinstance(items, list) else []
        return self._require_resolved(
            self._resolve_named_entity(
                rows,
                number_or_id,
                match_fields=('number', 'id', 'supplierName', 'supplier_name'),
                label_fields=('number', 'supplierName', 'supplier_name'),
                singular='purchase order',
                plural='purchase orders',
            )
        )

    async def invoice(self, number_or_id: str) -> str:
        if is_uuid(number_or_id):
            return number_or_id
        payload = await self._cached_value('invoices', lambda: self._backend.list_invoices(self._token, self._tenant))
        items = payload.get('items') if isinstance(payload, dict) else None
        rows = items if isinstance(items, list) else []
        return self._require_resolved(
            self._resolve_named_entity(
                rows,
                number_or_id,
                match_fields=('number', 'id', 'customerName', 'customer_name'),
                label_fields=('number', 'customerName', 'customer_name'),
                singular='sales order',
                plural='sales orders',
            )
        )

    async def sku_size(
        self,
        product_name: str,
        size_label: str,
        color_name: str | None = None,
    ) -> str:
        """Resolve product name + size label (+ optional colour) to a sku_size UUID."""
        products = self._product_rows(await self._backend.search_products(self._token, self._tenant, q=product_name))
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
        *,
        sku_code: str | None = None,
    ) -> dict[str, int | str]:
        """Resolve a sales-order line to a sku_size UUID and effective unit price."""
        product_label = sku_code or product_name
        full = await self._product_detail(product_name=product_name, sku_code=sku_code)
        product = full.get('product') or {}
        skus: list[dict[str, Any]] = full.get('skus') or []  # type: ignore[assignment]
        sizes: list[dict[str, Any]] = full.get('sizes') or []  # type: ignore[assignment]

        requested_sku_code = str(sku_code or '').strip().upper()
        if requested_sku_code:
            sku_matches = [
                sku for sku in skus if str(sku.get('sku_code') or '').strip().upper() == requested_sku_code
            ]
            if not sku_matches:
                raise ValueError(f'SKU "{requested_sku_code}" was not found for "{product_label}".')
            candidate_skus = sku_matches
        else:
            candidate_skus = skus

        available_colors = sorted(
            {
                str(sku.get('color_name')).strip()
                for sku in candidate_skus
                if isinstance(sku.get('color_name'), str) and str(sku.get('color_name')).strip()
            }
        )

        if color_name and not requested_sku_code:
            cnl = color_name.lower()
            colour_skus = [s for s in candidate_skus if cnl in str(s.get('color_name') or '').lower()]
            if not colour_skus:
                available = ', '.join(available_colors[:10]) or 'none'
                raise ValueError(f'Color "{color_name}" not found for "{product_label}". Available: {available}')
            candidate_skus = colour_skus
        elif not requested_sku_code:
            if len(available_colors) > 1:
                raise ValueError(self._variant_prompt(product_label, skus, sizes))

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
                    f'Unit price is not configured for "{product_label}" {color_name or ""} {size_label}'.strip()
                )
            return int(raw_price)

        base_price = product.get('base_price')
        if base_price is None:
            raise ValueError(
                f'Base price is not configured for "{product_label}". Provide unit cost explicitly or set the product base price.'
            )

        def resolved_unit_cost() -> int:
            return int(base_price)

        if not sl:
            if len(available_sizes) > 1 or len(candidate_sizes) > 1:
                raise ValueError(self._variant_prompt(product_label, candidate_skus, candidate_sizes))
            if len(candidate_sizes) == 1:
                size = candidate_sizes[0]
                return {
                    'sizeId': str(size['id']),
                    'unitPrice': effective_unit_price(size),
                    'unitCost': resolved_unit_cost(),
                }
            raise ValueError(f'Size is required for "{product_label}" {color_name or ""}.'.strip())

        exact_matches = [
            size
            for size in candidate_sizes
            if str(size.get('size_label') or '').upper().strip() == sl
        ]
        if len(exact_matches) == 1:
            size = exact_matches[0]
            return {
                'sizeId': str(size['id']),
                'unitPrice': effective_unit_price(size),
                'unitCost': resolved_unit_cost(),
            }

        partial_matches = [
            size
            for size in candidate_sizes
            if sl in str(size.get('size_label') or '').upper()
        ]
        if len(partial_matches) == 1:
            size = partial_matches[0]
            return {
                'sizeId': str(size['id']),
                'unitPrice': effective_unit_price(size),
                'unitCost': resolved_unit_cost(),
            }

        available = ', '.join(available_sizes[:10])
        raise ValueError(
            f'Size "{size_label}" not found for "{product_label}". Available: {available or "none"}'
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

    async def _cached_rows(
        self,
        key: str,
        loader,
    ) -> list[dict[str, object]]:
        cached = self._cache.get(key)
        if isinstance(cached, list):
            return cached
        rows = await loader()
        self._cache[key] = rows
        return rows

    async def _cached_value(self, key: str, loader):
        if key in self._cache:
            return self._cache[key]
        value = await loader()
        self._cache[key] = value
        return value

    async def size_lines_from_product(
        self,
        product_name: str,
        *,
        color_name: str | None = None,
        size_labels: list[str] | None = None,
    ) -> list[dict[str, str]]:
        """Expand a product reference into concrete size rows for matching colours/sizes."""
        products = self._product_rows(await self._backend.search_products(self._token, self._tenant, q=product_name))
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

    @staticmethod
    def _product_rows(payload: object) -> list[dict[str, Any]]:
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        if isinstance(payload, dict):
            items = payload.get('items')
            if isinstance(items, list):
                return [item for item in items if isinstance(item, dict)]
        return []

    async def _product_detail(
        self,
        *,
        product_name: str,
        sku_code: str | None = None,
    ) -> dict[str, Any]:
        requested_sku_code = str(sku_code or '').strip().upper()
        if requested_sku_code:
            sku_matches = await self._backend.search_skus(self._token, self._tenant, requested_sku_code)
            exact = None
            for candidate in sku_matches:
                code = str(candidate.get('sku_code') or '').strip().upper()
                if code == requested_sku_code:
                    exact = candidate
                    break
            candidate = exact or (sku_matches[0] if sku_matches else None)
            if isinstance(candidate, dict) and candidate.get('product_id'):
                return await self._backend.get_product(self._token, self._tenant, str(candidate['product_id']))

        products = self._product_rows(await self._backend.search_products(self._token, self._tenant, q=product_name))
        if not products:
            label = requested_sku_code or product_name
            raise ValueError(f'Product "{label}" not found.')
        return await self._backend.get_product(self._token, self._tenant, str(products[0]['id']))

    @staticmethod
    def _variant_prompt(
        product_label: str,
        skus: list[dict[str, Any]],
        sizes: list[dict[str, Any]],
    ) -> str:
        color_by_sku_id = {
            str(sku.get('id')): str(sku.get('color_name') or '').strip()
            for sku in skus
            if str(sku.get('id') or '').strip()
        }
        options = sorted(
            {
                ' / '.join(
                    part
                    for part in (
                        color_by_sku_id.get(str(size.get('sku_id')), ''),
                        str(size.get('size_label') or '').strip().upper(),
                    )
                    if part
                )
                for size in sizes
                if str(size.get('id') or '').strip()
            }
        )
        available = ', '.join(option for option in options[:12] if option) or 'none'
        return (
            f'Multiple variants are available for "{product_label}". '
            f'Which variant should I use? Available variants: {available}.'
        )

    @staticmethod
    def _require_resolved(result: ResolutionResult) -> str:
        if result.status == 'resolved' and result.value:
            return result.value
        raise ResolutionError(result)

    def _resolve_named_entity(
        self,
        rows: list[dict[str, object]],
        query: str,
        *,
        match_fields: tuple[str, ...],
        label_fields: tuple[str, ...],
        singular: str,
        plural: str,
    ) -> ResolutionResult:
        normalized_query = query.strip().lower()
        if not normalized_query:
            return ResolutionResult(
                status='not_found',
                message=f'{singular.title()} reference is required.',
            )

        exact_matches = self._matching_rows(rows, normalized_query, match_fields, exact=True)
        if len(exact_matches) == 1:
            return ResolutionResult(status='resolved', value=str(exact_matches[0]['id']))
        if len(exact_matches) > 1:
            return self._ambiguous_result(query, exact_matches, label_fields=label_fields, singular=singular, plural=plural)

        partial_matches = self._matching_rows(rows, normalized_query, match_fields, exact=False)
        if len(partial_matches) == 1:
            return ResolutionResult(status='resolved', value=str(partial_matches[0]['id']))
        if len(partial_matches) > 1:
            return self._ambiguous_result(query, partial_matches, label_fields=label_fields, singular=singular, plural=plural)

        return ResolutionResult(
            status='not_found',
            message=f'{singular.title()} "{query}" not found. Search to see available {plural}.',
        )

    def _ambiguous_result(
        self,
        query: str,
        rows: list[dict[str, object]],
        *,
        label_fields: tuple[str, ...],
        singular: str,
        plural: str,
    ) -> ResolutionResult:
        candidates = tuple(
            ResolutionCandidate(
                id=str(row.get('id') or ''),
                label=self._candidate_label(row, label_fields),
            )
            for row in rows[:5]
            if str(row.get('id') or '').strip()
        )
        options = ', '.join(candidate.label for candidate in candidates) or 'none'
        return ResolutionResult(
            status='ambiguous',
            message=(
                f'I found multiple {plural} matching "{query}". '
                f'Which {singular} should I use? Options: {options}.'
            ),
            candidates=candidates,
        )

    @staticmethod
    def _matching_rows(
        rows: list[dict[str, object]],
        normalized_query: str,
        fields: tuple[str, ...],
        *,
        exact: bool,
    ) -> list[dict[str, object]]:
        matches: list[dict[str, object]] = []
        seen_ids: set[str] = set()
        for row in rows:
            row_id = str(row.get('id') or '').strip()
            if not row_id or row_id in seen_ids:
                continue
            for field in fields:
                value = str(row.get(field) or '').strip().lower()
                if not value:
                    continue
                if exact and value == normalized_query:
                    matches.append(row)
                    seen_ids.add(row_id)
                    break
                if not exact and normalized_query in value:
                    matches.append(row)
                    seen_ids.add(row_id)
                    break
        return matches

    @staticmethod
    def _candidate_label(row: dict[str, object], label_fields: tuple[str, ...]) -> str:
        values = [str(row.get(field) or '').strip() for field in label_fields]
        values = [value for value in values if value]
        if not values:
            return str(row.get('id') or '').strip()
        primary = values[0]
        extras: list[str] = []
        for value in values[1:]:
            if value != primary and value not in extras:
                extras.append(value)
        if not extras:
            return primary
        return f'{primary} ({", ".join(extras[:2])})'
