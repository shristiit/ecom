from __future__ import annotations

import re
from typing import Any

from conversational_engine.clients.backend import BackendClient
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.retrieval.navigation_targets import NAVIGATION_TARGETS
from conversational_engine.tools.definitions import SemanticTool

from .resolvers import EntityResolver, ResolutionError
from .utils import ToolPreparationError, best_match, object_schema, search_rows

PARTY_FIELDS = ('name', 'email', 'phone', 'address', 'status')
LOCATION_FIELDS = ('name', 'code', 'type', 'address', 'status')

_MARKDOWN_MAILTO_RE = re.compile(
    r'^\[(?P<label>[^\]]+)\]\(\s*mailto:(?P<target>[^)]+)\s*\)$',
    re.IGNORECASE,
)


def commerce_line_schema(*, price_field: str, price_aliases: tuple[str, ...]) -> dict[str, Any]:
    properties: dict[str, Any] = {
        'sizeId': {'type': ['string', 'null'], 'description': 'SKU size UUID when already known'},
        'productName': {
            'type': ['string', 'null'],
            'description': 'Product name or style code used to resolve the variant when sizeId is not known',
        },
        'skuCode': {'type': ['string', 'null'], 'description': 'Optional SKU code used to narrow the variant lookup'},
        'styleCode': {'type': ['string', 'null'], 'description': 'Optional product style code used to resolve the product'},
        'sizeLabel': {'type': ['string', 'null'], 'description': 'Size label such as S, M, L, or 32'},
        'colorName': {'type': ['string', 'null'], 'description': 'Optional colour used to resolve sizeId'},
        'qty': {'type': ['integer', 'null'], 'description': 'Canonical quantity field expected by the backend'},
        'quantity': {'type': ['integer', 'null'], 'description': 'Human-friendly quantity alias'},
        price_field: {'type': ['integer', 'null'], 'description': f'Canonical {price_field} field expected by the backend'},
    }
    for alias in price_aliases:
        properties[alias] = {'type': ['integer', 'null'], 'description': f'Alias for {price_field}'}
    return object_schema(properties)


def commerce_line_ref_schema() -> dict[str, Any]:
    return object_schema(
        {
            'lineId': {'type': ['string', 'null'], 'description': 'Existing line UUID when known'},
            'sizeId': {'type': ['string', 'null'], 'description': 'Existing sku_size UUID when known'},
            'skuCode': {'type': ['string', 'null'], 'description': 'SKU code for an exact variant reference'},
            'sizeLabel': {'type': ['string', 'null'], 'description': 'Size label paired with skuCode'},
            'productName': {'type': ['string', 'null'], 'description': 'Optional product name for resolving a sizeId'},
            'styleCode': {'type': ['string', 'null'], 'description': 'Optional style code for resolving a sizeId'},
            'colorName': {'type': ['string', 'null'], 'description': 'Optional colour used to resolve a sizeId'},
        }
    )


def commerce_line_op_schema(*, price_field: str, price_aliases: tuple[str, ...], patch_price_field: str) -> dict[str, Any]:
    properties: dict[str, Any] = {
        'op': {
            'type': 'string',
            'enum': ['add', 'replace', 'change_qty', patch_price_field, 'remove'],
        },
        'lineRef': commerce_line_ref_schema(),
        'values': commerce_line_schema(price_field=price_field, price_aliases=price_aliases),
        'qty': {'type': ['integer', 'null']},
        price_field: {'type': ['integer', 'null']},
    }
    for alias in price_aliases:
        properties[alias] = {'type': ['integer', 'null']}
    return object_schema(properties, ['op'])


def build_commerce_tools(
    backend: BackendClient, auth: AuthContext, resolver: EntityResolver
) -> dict[str, SemanticTool]:
    token = auth.access_token or ''
    tenant = auth.tenant_id

    def clean_party_fields(payload: dict[str, Any]) -> dict[str, Any]:
        normalized: dict[str, Any] = {}
        for field in PARTY_FIELDS:
            value = payload.get(field)
            if value is None:
                continue
            if isinstance(value, str):
                cleaned = value.strip()
                if field == 'email':
                    markdown_match = _MARKDOWN_MAILTO_RE.match(cleaned)
                    if markdown_match:
                        candidate = markdown_match.group('target').strip()
                        if candidate:
                            cleaned = candidate
                    cleaned = cleaned.strip('<>')
                if not cleaned:
                    continue
                normalized[field] = cleaned
            else:
                normalized[field] = value
        return normalized

    def clean_location_fields(payload: dict[str, Any]) -> dict[str, Any]:
        normalized: dict[str, Any] = {}
        for field in LOCATION_FIELDS:
            value = payload.get(field)
            if value is None and field == 'type':
                value = payload.get('locationType')
            if value is None:
                continue
            if isinstance(value, str):
                cleaned = value.strip()
                if not cleaned:
                    continue
                normalized[field] = cleaned
            else:
                normalized[field] = value
        return normalized

    def extract_patch(payload: dict[str, Any], *, identifier_keys: tuple[str, ...]) -> dict[str, Any]:
        raw_patch = payload.get('patch')
        if isinstance(raw_patch, dict):
            return clean_party_fields(raw_patch)

        patch_source = {
            key: value
            for key, value in payload.items()
            if key in PARTY_FIELDS and key not in {'email'}
        }
        if 'email' in payload and any(key in payload for key in identifier_keys):
            patch_source['email'] = payload.get('email')
        return clean_party_fields(patch_source)

    def extract_location_patch(payload: dict[str, Any], *, identifier_keys: tuple[str, ...]) -> dict[str, Any]:
        raw_patch = payload.get('patch')
        if isinstance(raw_patch, dict):
            return clean_location_fields(raw_patch)

        patch_source = {
            key: value
            for key, value in payload.items()
            if key in LOCATION_FIELDS or key == 'locationType'
        }
        if 'code' in payload and any(key in payload for key in identifier_keys):
            patch_source['code'] = payload.get('code')
        return clean_location_fields(patch_source)

    def first_reference(payload: dict[str, Any], *keys: str) -> str:
        for key in keys:
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return ''

    def as_positive_int(value: Any, *, field_name: str) -> int:
        try:
            normalized = int(value)
        except (TypeError, ValueError) as exc:
            raise ToolPreparationError(f'{field_name} must be a positive integer.', ['lines']) from exc
        if normalized <= 0:
            raise ToolPreparationError(f'{field_name} must be a positive integer.', ['lines'])
        return normalized

    def as_non_negative_int(value: Any, *, field_name: str) -> int:
        try:
            normalized = int(value)
        except (TypeError, ValueError) as exc:
            raise ToolPreparationError(f'{field_name} must be a non-negative integer.', ['lines']) from exc
        if normalized < 0:
            raise ToolPreparationError(f'{field_name} must be a non-negative integer.', ['lines'])
        return normalized

    async def resolve_commerce_line(
        raw_line: dict[str, Any],
        *,
        price_field: str,
        price_aliases: tuple[str, ...],
        allow_price_lookup: bool,
    ) -> dict[str, Any]:
        qty = raw_line.get('qty', raw_line.get('quantity'))
        if qty is None:
            raise ToolPreparationError('Each line needs a quantity.', ['lines'])

        price_value = raw_line.get(price_field)
        if price_value is None:
            for alias in price_aliases:
                candidate = raw_line.get(alias)
                if candidate is not None:
                    price_value = candidate
                    break

        size_id = str(raw_line.get('sizeId') or '').strip()
        resolved_price_value = price_value
        if not size_id or resolved_price_value is None:
            try:
                details = await resolver.sku_size_details(
                    str(raw_line.get('productName') or raw_line.get('styleCode') or '').strip(),
                    str(raw_line.get('sizeLabel') or '').strip(),
                    str(raw_line.get('colorName') or '').strip() or None,
                    sku_code=str(raw_line.get('skuCode') or '').strip() or None,
                )
            except ValueError as exc:
                raise ToolPreparationError(str(exc), ['lines']) from exc
            size_id = size_id or str(details['sizeId'])
            if allow_price_lookup and resolved_price_value is None:
                resolved_price_value = details.get(price_field)

        if not size_id:
            raise ToolPreparationError('Each line needs a sizeId or a product/size reference.', ['lines'])

        if resolved_price_value is None:
            raise ToolPreparationError(f'Each line needs {price_field}.', ['lines'])

        return {
            'sizeId': size_id,
            'qty': as_positive_int(qty, field_name='Quantity'),
            price_field: as_non_negative_int(resolved_price_value, field_name=price_field),
        }

    def product_rows(payload: object) -> list[dict[str, Any]]:
        if isinstance(payload, dict):
            items = payload.get('items')
            if isinstance(items, list):
                return [row for row in items if isinstance(row, dict)]
        if isinstance(payload, list):
            return [row for row in payload if isinstance(row, dict)]
        return []

    async def product_detail_for_reference(reference: str) -> dict[str, Any]:
        query = reference.strip()
        products = product_rows(await backend.search_products(token, tenant, q=query))
        match = best_match(products, query, 'name', 'styleCode', 'style_code', 'skuCode', 'sku_code')
        if not match:
            raise ToolPreparationError(f'Product "{reference}" not found.', ['product'])
        product_id = str(match.get('id') or '').strip()
        if not product_id:
            raise ToolPreparationError(f'Product "{reference}" is missing an id.', ['product'])
        detail = await backend.get_product(token, tenant, product_id)
        if not isinstance(detail, dict):
            raise ToolPreparationError(f'Product "{reference}" could not be loaded.', ['product'])
        return detail

    async def resolve_reference(call, missing_fields: list[str]):
        try:
            return await call
        except ResolutionError as exc:
            raise ToolPreparationError(exc.result.message, missing_fields) from exc
        except ValueError as exc:
            raise ToolPreparationError(str(exc), missing_fields) from exc

    async def resolve_line_ref(raw_line_ref: dict[str, Any]) -> dict[str, Any]:
        line_id = str(raw_line_ref.get('lineId') or '').strip()
        if line_id:
            return {'lineId': line_id}

        size_id = str(raw_line_ref.get('sizeId') or '').strip()
        if size_id:
            return {'sizeId': size_id}

        sku_code = str(raw_line_ref.get('skuCode') or '').strip()
        size_label = str(raw_line_ref.get('sizeLabel') or '').strip()
        if sku_code and size_label:
            return {'skuCode': sku_code, 'sizeLabel': size_label}

        if str(raw_line_ref.get('productName') or raw_line_ref.get('styleCode') or '').strip() and size_label:
            return {'sizeId': await resolver.size_from_payload(raw_line_ref)}

        raise ToolPreparationError(
            'Each line change needs a line reference: lineId, sizeId, or skuCode + sizeLabel.',
            ['line_ref'],
        )

    async def resolve_line_ops(
        raw_line_ops: list[dict[str, Any]],
        *,
        price_field: str,
        price_aliases: tuple[str, ...],
        patch_price_field: str,
    ) -> list[dict[str, Any]]:
        resolved_ops: list[dict[str, Any]] = []
        for raw_line_op in raw_line_ops:
            op = str(raw_line_op.get('op') or '').strip().lower()
            if op not in {'add', 'replace', 'change_qty', patch_price_field, 'remove'}:
                raise ToolPreparationError(
                    f'Unsupported line operation "{op or "unknown"}".',
                    ['line_ops'],
                )
            if op == 'add':
                values = raw_line_op.get('values')
                if not isinstance(values, dict):
                    raise ToolPreparationError('Add operations need line values.', ['line_ops'])
                resolved_ops.append(
                    {
                        'op': 'add',
                        'values': await resolve_commerce_line(
                            values,
                            price_field=price_field,
                            price_aliases=price_aliases,
                            allow_price_lookup=True,
                        ),
                    }
                )
                continue

            line_ref = raw_line_op.get('lineRef')
            if not isinstance(line_ref, dict):
                raise ToolPreparationError('Each line change needs a lineRef.', ['line_ops'])
            resolved_line_ref = await resolve_line_ref(line_ref)

            if op == 'replace':
                values = raw_line_op.get('values')
                if not isinstance(values, dict):
                    raise ToolPreparationError('Replace operations need line values.', ['line_ops'])
                resolved_ops.append(
                    {
                        'op': 'replace',
                        'lineRef': resolved_line_ref,
                        'values': await resolve_commerce_line(
                            values,
                            price_field=price_field,
                            price_aliases=price_aliases,
                            allow_price_lookup=True,
                        ),
                    }
                )
                continue

            if op == 'change_qty':
                qty = raw_line_op.get('qty', raw_line_op.get('quantity'))
                if qty is None:
                    raise ToolPreparationError('Quantity changes need qty.', ['line_ops'])
                resolved_ops.append(
                    {
                        'op': 'change_qty',
                        'lineRef': resolved_line_ref,
                        'qty': as_positive_int(qty, field_name='Quantity'),
                    }
                )
                continue

            if op == patch_price_field:
                price_value = raw_line_op.get(price_field)
                if price_value is None:
                    for alias in price_aliases:
                        candidate = raw_line_op.get(alias)
                        if candidate is not None:
                            price_value = candidate
                            break
                if price_value is None:
                    raise ToolPreparationError(f'{price_field} is required for {patch_price_field}.', ['line_ops'])
                resolved_ops.append(
                    {
                        'op': patch_price_field,
                        'lineRef': resolved_line_ref,
                        price_field: as_non_negative_int(price_value, field_name=price_field),
                    }
                )
                continue

            resolved_ops.append({'op': 'remove', 'lineRef': resolved_line_ref})
        return resolved_ops

    async def search_locations(payload: dict[str, Any]) -> dict[str, Any]:
        items = await backend.list_locations(token, tenant)
        rows = search_rows(items, str(payload.get('query') or ''), 'name', 'code')
        return {'rows': [{k: row[k] for k in ('id', 'name', 'code') if k in row} for row in rows]}

    async def prepare_create_location(payload: dict[str, Any]) -> dict[str, Any]:
        normalized = clean_location_fields(payload)
        missing_fields: list[str] = []
        if not str(normalized.get('name') or '').strip():
            missing_fields.append('name')
        if not str(normalized.get('code') or '').strip():
            missing_fields.append('code')
        if not str(normalized.get('type') or '').strip():
            missing_fields.append('type')
        if missing_fields:
            labels = {
                'name': 'location name',
                'code': 'location code',
                'type': 'location type',
            }
            missing_summary = ', '.join(labels[field] for field in missing_fields)
            raise ToolPreparationError(
                f'Please provide the {missing_summary}. Optional: address and status.',
                missing_fields,
            )
        return normalized

    async def create_location(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.create_location(token, tenant, payload)}

    async def prepare_update_location(payload: dict[str, Any]) -> dict[str, Any]:
        location = first_reference(payload, 'locationId', 'location', 'locationName', 'reference', 'id', 'code')
        if not location:
            raise ToolPreparationError('Which location should I update?', ['location_id'])
        patch = extract_location_patch(
            payload,
            identifier_keys=('locationId', 'location', 'locationName', 'reference', 'id', 'code'),
        )
        if not patch:
            raise ToolPreparationError('What location details should I change?', ['patch'])
        return {'locationId': await resolve_reference(resolver.location(location), ['location_id']), 'patch': patch}

    async def update_location(payload: dict[str, Any]) -> dict[str, Any]:
        return {
            'result': await backend.update_location(
                token,
                tenant,
                str(payload['locationId']),
                dict(payload.get('patch') or {}),
            )
        }

    async def prepare_delete_location(payload: dict[str, Any]) -> dict[str, Any]:
        location = first_reference(payload, 'locationId', 'location', 'locationName', 'reference', 'id', 'code')
        if not location:
            raise ToolPreparationError('Which location should I delete?', ['location_id'])
        return {'locationId': await resolve_reference(resolver.location(location), ['location_id'])}

    async def delete_location(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.delete_location(token, tenant, str(payload['locationId']))}

    async def search_suppliers(payload: dict[str, Any]) -> dict[str, Any]:
        items = await backend.list_suppliers(token, tenant)
        rows = search_rows(items, str(payload.get('query') or ''), 'name', 'code')
        return {'rows': [{k: row[k] for k in ('id', 'name', 'code') if k in row} for row in rows]}

    async def search_customers(payload: dict[str, Any]) -> dict[str, Any]:
        items = await backend.list_customers(token, tenant)
        rows = search_rows(items, str(payload.get('query') or ''), 'name', 'email', 'code')
        return {'rows': [{k: row[k] for k in ('id', 'name', 'email', 'code') if k in row} for row in rows]}

    async def prepare_create_supplier(payload: dict[str, Any]) -> dict[str, Any]:
        normalized = clean_party_fields(payload)
        if not str(normalized.get('name') or '').strip():
            raise ToolPreparationError('What supplier name should I create?', ['name'])
        return normalized

    async def create_supplier(payload: dict[str, Any]) -> dict[str, Any]:
        # Re-apply field cleaning as a defensive measure before hitting the backend.
        # The preparer already does this, but the approval path may replay a stored payload.
        clean = clean_party_fields(payload)
        return {'result': await backend.create_supplier(token, tenant, clean)}

    async def prepare_update_supplier(payload: dict[str, Any]) -> dict[str, Any]:
        supplier = first_reference(payload, 'supplierId', 'supplier', 'supplierName', 'reference', 'id')
        if not supplier:
            raise ToolPreparationError('Which supplier should I update?', ['supplier_id'])
        patch = extract_patch(payload, identifier_keys=('supplierId', 'supplier', 'supplierName', 'reference', 'id'))
        if not patch:
            raise ToolPreparationError('What supplier details should I change?', ['patch'])
        return {'supplierId': await resolve_reference(resolver.supplier(supplier), ['supplier_id']), 'patch': patch}

    async def update_supplier(payload: dict[str, Any]) -> dict[str, Any]:
        return {
            'result': await backend.update_supplier(
                token,
                tenant,
                str(payload['supplierId']),
                dict(payload.get('patch') or {}),
            )
        }

    async def prepare_delete_supplier(payload: dict[str, Any]) -> dict[str, Any]:
        supplier = first_reference(payload, 'supplierId', 'supplier', 'supplierName', 'reference', 'id')
        if not supplier:
            raise ToolPreparationError('Which supplier should I delete?', ['supplier_id'])
        return {'supplierId': await resolve_reference(resolver.supplier(supplier), ['supplier_id'])}

    async def delete_supplier(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.delete_supplier(token, tenant, str(payload['supplierId']))}

    async def prepare_create_customer(payload: dict[str, Any]) -> dict[str, Any]:
        normalized = clean_party_fields(payload)
        if not str(normalized.get('name') or '').strip():
            raise ToolPreparationError('What customer name should I create?', ['name'])
        return normalized

    async def create_customer(payload: dict[str, Any]) -> dict[str, Any]:
        # Re-apply field cleaning as a defensive measure before hitting the backend.
        # The preparer already does this, but the approval path may replay a stored payload.
        clean = clean_party_fields(payload)
        return {'result': await backend.create_customer(token, tenant, clean)}

    async def prepare_update_customer(payload: dict[str, Any]) -> dict[str, Any]:
        customer = first_reference(
            payload,
            'customerId',
            'customer',
            'customerName',
            'currentEmail',
            'reference',
            'id',
        )
        if not customer:
            raise ToolPreparationError('Which customer should I update?', ['customer_id'])
        patch = extract_patch(
            payload,
            identifier_keys=('customerId', 'customer', 'customerName', 'currentEmail', 'reference', 'id'),
        )
        if not patch:
            raise ToolPreparationError('What customer details should I change?', ['patch'])
        return {'customerId': await resolve_reference(resolver.customer(customer), ['customer_id']), 'patch': patch}

    async def update_customer(payload: dict[str, Any]) -> dict[str, Any]:
        return {
            'result': await backend.update_customer(
                token,
                tenant,
                str(payload['customerId']),
                dict(payload.get('patch') or {}),
            )
        }

    async def prepare_delete_customer(payload: dict[str, Any]) -> dict[str, Any]:
        customer = first_reference(
            payload,
            'customerId',
            'customer',
            'customerName',
            'currentEmail',
            'reference',
            'id',
        )
        if not customer:
            raise ToolPreparationError('Which customer should I delete?', ['customer_id'])
        return {'customerId': await resolve_reference(resolver.customer(customer), ['customer_id'])}

    async def delete_customer(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.delete_customer(token, tenant, str(payload['customerId']))}

    async def search_categories(payload: dict[str, Any]) -> dict[str, Any]:
        items = await backend.list_categories(token, tenant)
        rows = search_rows(items, str(payload.get('query') or ''), 'name')
        return {'rows': [{k: row[k] for k in ('id', 'name') if k in row} for row in rows]}

    async def find_screen(payload: dict[str, Any]) -> dict[str, Any]:
        query = str(payload.get('query') or '').lower()
        rows = [
            target for target in NAVIGATION_TARGETS
            if query in target['label'].lower()
            or query in target['description'].lower()
            or any(query in kw.lower() for kw in target.get('keywords', []))
        ][:5]
        return {'rows': rows}

    async def prepare_create_po(payload: dict[str, Any]) -> dict[str, Any]:
        resolved = dict(payload)
        supplier = str(payload.get('supplierId') or '').strip()
        if not supplier:
            raise ToolPreparationError('Which supplier should this purchase order use?', ['supplier_id'])
        resolved['supplierId'] = await resolve_reference(resolver.supplier(supplier), ['supplier_id'])

        raw_lines = payload.get('lines')
        if not isinstance(raw_lines, list) or not raw_lines:
            raise ToolPreparationError(
                'Reply with PO lines in the format `SKUCODE/SIZE xQTY @UNIT_COST`, separated by commas.',
                ['lines'],
            )

        resolved_lines: list[dict[str, Any]] = []
        for raw_line in raw_lines:
            if not isinstance(raw_line, dict):
                raise ToolPreparationError(
                    'Reply with PO lines in the format `SKUCODE/SIZE xQTY @UNIT_COST`, separated by commas.',
                    ['lines'],
                )
            resolved_lines.append(
                await resolve_commerce_line(
                    raw_line,
                    price_field='unitCost',
                    price_aliases=('cost', 'unit_price', 'price'),
                    allow_price_lookup=True,
                )
            )

        resolved['lines'] = resolved_lines
        return resolved

    async def create_po(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.create_po(token, tenant, payload)}

    async def prepare_get_po(payload: dict[str, Any]) -> dict[str, Any]:
        po_ref = first_reference(payload, 'poId', 'purchaseOrderId', 'purchaseOrder', 'reference', 'id')
        if not po_ref:
            raise ToolPreparationError('Which purchase order should I inspect?', ['po_id'])
        return {'poId': await resolve_reference(resolver.purchase_order(po_ref), ['po_id'])}

    async def get_po(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.get_po(token, tenant, str(payload['poId']))}

    async def prepare_list_pos(payload: dict[str, Any]) -> dict[str, Any]:
        params: dict[str, Any] = {}
        status = payload.get('status')
        if isinstance(status, str) and status.strip():
            params['status'] = status.strip()
        supplier = str(payload.get('supplierId') or payload.get('supplier') or payload.get('supplierName') or '').strip()
        if supplier:
            params['supplierId'] = await resolve_reference(resolver.supplier(supplier), ['supplier_id'])
        return params

    async def list_pos(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.list_pos(token, tenant, params=payload or None)}

    async def prepare_update_po(payload: dict[str, Any]) -> dict[str, Any]:
        po_ref = first_reference(payload, 'poId', 'purchaseOrderId', 'purchaseOrder', 'reference', 'id')
        if not po_ref:
            raise ToolPreparationError('Which purchase order should I update?', ['po_id'])

        resolved: dict[str, Any] = {'poId': await resolve_reference(resolver.purchase_order(po_ref), ['po_id'])}
        header_patch: dict[str, Any] = {}
        raw_header_patch = payload.get('headerPatch')
        if isinstance(raw_header_patch, dict):
            supplier = str(raw_header_patch.get('supplierId') or '').strip()
            if supplier:
                header_patch['supplierId'] = await resolve_reference(resolver.supplier(supplier), ['supplier_id'])
            if 'expectedDate' in raw_header_patch:
                header_patch['expectedDate'] = raw_header_patch.get('expectedDate')
        supplier = str(payload.get('supplierId') or '').strip()
        if supplier:
            header_patch['supplierId'] = await resolve_reference(resolver.supplier(supplier), ['supplier_id'])
        if 'expectedDate' in payload:
            header_patch['expectedDate'] = payload.get('expectedDate')
        if header_patch:
            resolved['headerPatch'] = header_patch

        raw_lines = payload.get('lines')
        if isinstance(raw_lines, list) and raw_lines:
            resolved['lines'] = [
                await resolve_commerce_line(
                    raw_line,
                    price_field='unitCost',
                    price_aliases=('cost', 'unit_price', 'price'),
                    allow_price_lookup=True,
                )
                for raw_line in raw_lines
                if isinstance(raw_line, dict)
            ]
            if len(resolved['lines']) != len(raw_lines):
                raise ToolPreparationError('Each purchase order line must be an object.', ['lines'])

        raw_line_ops = payload.get('lineOps')
        if isinstance(raw_line_ops, list) and raw_line_ops:
            if not all(isinstance(raw_line_op, dict) for raw_line_op in raw_line_ops):
                raise ToolPreparationError('Each purchase order line change must be an object.', ['line_ops'])
            resolved['lineOps'] = await resolve_line_ops(
                raw_line_ops,  # type: ignore[arg-type]
                price_field='unitCost',
                price_aliases=('cost', 'unit_price', 'price'),
                patch_price_field='change_cost',
            )

        if not any(key in resolved for key in ('headerPatch', 'lines', 'lineOps')):
            raise ToolPreparationError('What should I change on this purchase order?', ['patch'])
        return resolved

    async def update_po(payload: dict[str, Any]) -> dict[str, Any]:
        po_id = str(payload['poId'])
        request_payload = {
            key: payload[key]
            for key in ('headerPatch', 'lines', 'lineOps')
            if key in payload
        }
        return {'result': await backend.update_po(token, tenant, po_id, request_payload)}

    async def prepare_receive_po(payload: dict[str, Any]) -> dict[str, Any]:
        po_ref = first_reference(payload, 'poId', 'purchaseOrderId', 'purchaseOrder', 'reference', 'id')
        if not po_ref:
            raise ToolPreparationError('Which purchase order should I receive?', ['po_id'])

        resolved = dict(payload)
        po_id = await resolve_reference(resolver.purchase_order(po_ref), ['po_id'])
        resolved['poId'] = po_id

        location = first_reference(payload, 'locationId', 'location', 'locationCode')
        if not location:
            raise ToolPreparationError('Which location should receive this purchase order?', ['location_id'])
        resolved['locationId'] = await resolve_reference(resolver.location(location), ['location_id'])

        po_detail = await backend.get_po(token, tenant, po_id)
        detail_lines = po_detail.get('lines') if isinstance(po_detail, dict) else None
        po_lines = detail_lines if isinstance(detail_lines, list) else []
        unit_cost_by_size_id = {
            str(line.get('skuId')): int(line.get('unitCost'))
            for line in po_lines
            if isinstance(line, dict)
            and line.get('skuId')
            and line.get('unitCost') is not None
        }

        raw_lines = payload.get('lines')
        if not isinstance(raw_lines, list) or not raw_lines:
            remaining_lines = []
            for line in po_lines:
                if not isinstance(line, dict):
                    continue
                qty_ordered = int(line.get('qtyOrdered') or 0)
                qty_received = int(line.get('qtyReceived') or 0)
                remaining = qty_ordered - qty_received
                size_id = str(line.get('skuId') or '').strip()
                unit_cost = line.get('unitCost')
                if remaining > 0 and size_id and unit_cost is not None:
                    remaining_lines.append(
                        {
                            'sizeId': size_id,
                            'qty': remaining,
                            'unitCost': int(unit_cost),
                        }
                    )
            if not remaining_lines:
                raise ToolPreparationError(
                    'This purchase order has no remaining lines to receive.',
                    ['lines'],
                )
            resolved['lines'] = remaining_lines
            resolved['confirm'] = True
            return resolved

        resolved_lines: list[dict[str, Any]] = []
        for raw_line in raw_lines:
            if not isinstance(raw_line, dict):
                raise ToolPreparationError('Each purchase order receipt line must be an object.', ['lines'])
            qty = raw_line.get('qty', raw_line.get('quantity'))
            if qty is None:
                raise ToolPreparationError('Each purchase order receipt line needs a quantity.', ['lines'])

            size_id = str(raw_line.get('sizeId') or '').strip()
            if not size_id:
                try:
                    size_id = await resolver.size_from_payload(raw_line)
                except ValueError as exc:
                    raise ToolPreparationError(str(exc), ['lines']) from exc
            unit_cost = raw_line.get('unitCost', raw_line.get('cost'))
            if unit_cost is None:
                unit_cost = unit_cost_by_size_id.get(size_id)
            if unit_cost is None:
                raise ToolPreparationError(
                    'Each purchase order receipt line needs a unit cost or a matching PO line.',
                    ['lines'],
                )

            resolved_lines.append(
                {
                    'sizeId': size_id,
                    'qty': as_positive_int(qty, field_name='Quantity'),
                    'unitCost': as_non_negative_int(unit_cost, field_name='unitCost'),
                }
            )

        resolved['lines'] = resolved_lines
        resolved['confirm'] = True
        return resolved

    async def receive_po(payload: dict[str, Any]) -> dict[str, Any]:
        po_id = str(payload['poId'])
        request_payload = {
            'locationId': payload['locationId'],
            'lines': payload['lines'],
            'confirm': bool(payload.get('confirm')),
        }
        return {'result': await backend.receive_po(token, tenant, po_id, request_payload)}

    async def prepare_close_po(payload: dict[str, Any]) -> dict[str, Any]:
        po_ref = first_reference(payload, 'poId', 'purchaseOrderId', 'purchaseOrder', 'reference', 'id')
        if not po_ref:
            raise ToolPreparationError('Which purchase order should I close?', ['po_id'])
        return {'poId': await resolve_reference(resolver.purchase_order(po_ref), ['po_id']), 'confirm': True}

    async def close_po(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.close_po(token, tenant, str(payload['poId']))}

    async def prepare_cancel_po(payload: dict[str, Any]) -> dict[str, Any]:
        po_ref = first_reference(payload, 'poId', 'purchaseOrderId', 'purchaseOrder', 'reference', 'id')
        if not po_ref:
            raise ToolPreparationError('Which purchase order should I cancel?', ['po_id'])
        return {'poId': await resolve_reference(resolver.purchase_order(po_ref), ['po_id']), 'confirm': True}

    async def cancel_po(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.cancel_po(token, tenant, str(payload['poId']))}

    async def prepare_create_invoice(payload: dict[str, Any]) -> dict[str, Any]:
        resolved = dict(payload)
        customer = str(payload.get('customerId') or '').strip()
        if not customer:
            raise ToolPreparationError('Which customer should this sales order use?', ['customer_id'])
        resolved['customerId'] = await resolve_reference(resolver.customer(customer), ['customer_id'])

        raw_lines = payload.get('lines')
        if not isinstance(raw_lines, list) or not raw_lines:
            raise ToolPreparationError(
                'Reply with sales order lines that include item, size, and quantity.',
                ['lines'],
            )

        resolved_lines: list[dict[str, Any]] = []
        for raw_line in raw_lines:
            if not isinstance(raw_line, dict):
                raise ToolPreparationError(
                    'Reply with sales order lines that include item, size, and quantity.',
                    ['lines'],
                )
            resolved_lines.append(
                await resolve_commerce_line(
                    raw_line,
                    price_field='unitPrice',
                    price_aliases=('unit_price', 'price'),
                    allow_price_lookup=True,
                )
            )

        resolved['lines'] = resolved_lines
        return resolved

    async def create_invoice(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.create_invoice(token, tenant, payload)}

    async def prepare_get_invoice(payload: dict[str, Any]) -> dict[str, Any]:
        invoice_ref = first_reference(payload, 'invoiceId', 'salesOrderId', 'salesOrder', 'reference', 'id')
        if not invoice_ref:
            raise ToolPreparationError('Which sales order should I inspect?', ['sales_order_id'])
        return {'invoiceId': await resolve_reference(resolver.invoice(invoice_ref), ['sales_order_id'])}

    async def get_invoice(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.get_invoice(token, tenant, str(payload['invoiceId']))}

    async def prepare_list_invoices(payload: dict[str, Any]) -> dict[str, Any]:
        params: dict[str, Any] = {}
        status = payload.get('status')
        if isinstance(status, str) and status.strip():
            params['status'] = status.strip()
        customer = str(payload.get('customerId') or payload.get('customer') or payload.get('customerName') or '').strip()
        if customer:
            params['customerId'] = await resolve_reference(resolver.customer(customer), ['customer_id'])
        return params

    async def list_invoices(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.list_invoices(token, tenant, params=payload or None)}

    async def prepare_update_invoice(payload: dict[str, Any]) -> dict[str, Any]:
        invoice_ref = first_reference(payload, 'invoiceId', 'salesOrderId', 'salesOrder', 'reference', 'id')
        if not invoice_ref:
            raise ToolPreparationError('Which sales order should I update?', ['sales_order_id'])

        resolved: dict[str, Any] = {'invoiceId': await resolve_reference(resolver.invoice(invoice_ref), ['sales_order_id'])}
        header_patch: dict[str, Any] = {}
        raw_header_patch = payload.get('headerPatch')
        if isinstance(raw_header_patch, dict):
            customer = str(raw_header_patch.get('customerId') or '').strip()
            if customer:
                header_patch['customerId'] = await resolve_reference(resolver.customer(customer), ['customer_id'])
        customer = str(payload.get('customerId') or '').strip()
        if customer:
            header_patch['customerId'] = await resolve_reference(resolver.customer(customer), ['customer_id'])
        if header_patch:
            resolved['headerPatch'] = header_patch

        raw_lines = payload.get('lines')
        if isinstance(raw_lines, list) and raw_lines:
            resolved['lines'] = [
                await resolve_commerce_line(
                    raw_line,
                    price_field='unitPrice',
                    price_aliases=('unit_price', 'price'),
                    allow_price_lookup=True,
                )
                for raw_line in raw_lines
                if isinstance(raw_line, dict)
            ]
            if len(resolved['lines']) != len(raw_lines):
                raise ToolPreparationError('Each sales order line must be an object.', ['lines'])

        raw_line_ops = payload.get('lineOps')
        if isinstance(raw_line_ops, list) and raw_line_ops:
            if not all(isinstance(raw_line_op, dict) for raw_line_op in raw_line_ops):
                raise ToolPreparationError('Each sales order line change must be an object.', ['line_ops'])
            resolved['lineOps'] = await resolve_line_ops(
                raw_line_ops,  # type: ignore[arg-type]
                price_field='unitPrice',
                price_aliases=('unit_price', 'price'),
                patch_price_field='change_price',
            )

        if not any(key in resolved for key in ('headerPatch', 'lines', 'lineOps')):
            raise ToolPreparationError('What should I change on this sales order?', ['patch'])
        return resolved

    async def update_invoice(payload: dict[str, Any]) -> dict[str, Any]:
        invoice_id = str(payload['invoiceId'])
        request_payload = {
            key: payload[key]
            for key in ('headerPatch', 'lines', 'lineOps')
            if key in payload
        }
        return {'result': await backend.update_invoice(token, tenant, invoice_id, request_payload)}

    async def prepare_dispatch_invoice(payload: dict[str, Any]) -> dict[str, Any]:
        invoice_ref = first_reference(payload, 'invoiceId', 'salesOrderId', 'salesOrder', 'reference', 'id')
        if not invoice_ref:
            raise ToolPreparationError('Which sales order should I dispatch?', ['sales_order_id'])
        location = first_reference(payload, 'locationId', 'location', 'locationCode')
        if not location:
            raise ToolPreparationError('Which location should dispatch this sales order?', ['location_id'])
        return {
            'invoiceId': await resolve_reference(resolver.invoice(invoice_ref), ['sales_order_id']),
            'locationId': await resolve_reference(resolver.location(location), ['location_id']),
            'confirm': True,
        }

    async def dispatch_invoice(payload: dict[str, Any]) -> dict[str, Any]:
        invoice_id = str(payload['invoiceId'])
        request_payload = {
            'locationId': payload['locationId'],
            'confirm': bool(payload.get('confirm')),
        }
        return {'result': await backend.dispatch_invoice(token, tenant, invoice_id, request_payload)}

    async def prepare_cancel_invoice(payload: dict[str, Any]) -> dict[str, Any]:
        invoice_ref = first_reference(payload, 'invoiceId', 'salesOrderId', 'salesOrder', 'reference', 'id')
        if not invoice_ref:
            raise ToolPreparationError('Which sales order should I cancel?', ['sales_order_id'])
        return {'invoiceId': await resolve_reference(resolver.invoice(invoice_ref), ['sales_order_id']), 'confirm': True}

    async def cancel_invoice(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.cancel_invoice(token, tenant, str(payload['invoiceId']))}

    async def prepare_get_product_variants(payload: dict[str, Any]) -> dict[str, Any]:
        reference = str(payload.get('product') or payload.get('productName') or payload.get('styleCode') or '').strip()
        if not reference:
            raise ToolPreparationError('Which product should I inspect?', ['product'])
        detail = await product_detail_for_reference(reference)
        return {'reference': reference, 'detail': detail}

    async def get_product_variants(payload: dict[str, Any]) -> dict[str, Any]:
        detail = payload.get('detail')
        if not isinstance(detail, dict):
            raise ToolPreparationError('Product detail is missing.', ['product'])
        skus = detail.get('skus')
        sizes = detail.get('sizes')
        if not isinstance(skus, list) or not isinstance(sizes, list):
            raise ToolPreparationError('Product variants are missing.', ['product'])
        color_by_sku_id = {
            str(sku.get('id') or ''): str(sku.get('color_name') or '').strip()
            for sku in skus
            if isinstance(sku, dict)
        }
        rows = []
        for size in sizes:
            if not isinstance(size, dict):
                continue
            sku_id = str(size.get('sku_id') or '').strip()
            rows.append(
                {
                    'sizeId': str(size.get('id') or ''),
                    'skuId': sku_id,
                    'colorName': color_by_sku_id.get(sku_id, ''),
                    'sizeLabel': str(size.get('size_label') or ''),
                }
            )
        return {'rows': rows}

    return {
        'master.search_locations': SemanticTool(
            name='master.search_locations',
            description='Search locations by name or code.',
            input_schema=object_schema({'query': {'type': 'string'}}, ['query']),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=search_locations,
        ),
        'master.create_location': SemanticTool(
            name='master.create_location',
            description='Create a warehouse or store location. Requires a location name, code, and type.',
            input_schema=object_schema(
                {
                    'name': {'type': 'string'},
                    'code': {'type': 'string'},
                    'type': {'type': 'string'},
                    'locationType': {'type': ['string', 'null']},
                    'address': {'type': 'string'},
                    'status': {'type': 'string'},
                },
                ['name', 'code', 'type'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=create_location,
            preparer=prepare_create_location,
        ),
        'master.update_location': SemanticTool(
            name='master.update_location',
            description='Update a warehouse or store location by UUID, name, or code.',
            input_schema=object_schema(
                {
                    'locationId': {'type': 'string', 'description': 'Location UUID, name, or code'},
                    'patch': {
                        'type': 'object',
                        'properties': {
                            'name': {'type': 'string'},
                            'code': {'type': 'string'},
                            'type': {'type': 'string'},
                            'locationType': {'type': 'string'},
                            'address': {'type': 'string'},
                            'status': {'type': 'string'},
                        },
                    },
                },
                ['locationId', 'patch'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=update_location,
            preparer=prepare_update_location,
        ),
        'master.delete_location': SemanticTool(
            name='master.delete_location',
            description='Delete a warehouse or store location by UUID, name, or code.',
            input_schema=object_schema(
                {'locationId': {'type': 'string', 'description': 'Location UUID, name, or code'}},
                ['locationId'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=delete_location,
            preparer=prepare_delete_location,
        ),
        'master.search_suppliers': SemanticTool(
            name='master.search_suppliers',
            description='Search suppliers by name or code.',
            input_schema=object_schema({'query': {'type': 'string'}}, ['query']),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=search_suppliers,
        ),
        'master.create_supplier': SemanticTool(
            name='master.create_supplier',
            description='Create a supplier or vendor record. Requires a supplier name.',
            input_schema=object_schema(
                {field: {'type': 'string'} for field in PARTY_FIELDS},
                ['name'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=create_supplier,
            preparer=prepare_create_supplier,
        ),
        'master.update_supplier': SemanticTool(
            name='master.update_supplier',
            description='Update a supplier or vendor by UUID or natural reference.',
            input_schema=object_schema(
                {
                    'supplierId': {'type': 'string', 'description': 'Supplier UUID or natural reference'},
                    'patch': {
                        'type': 'object',
                        'properties': {field: {'type': 'string'} for field in PARTY_FIELDS},
                    },
                },
                ['supplierId', 'patch'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=update_supplier,
            preparer=prepare_update_supplier,
        ),
        'master.delete_supplier': SemanticTool(
            name='master.delete_supplier',
            description='Delete a supplier or vendor by UUID or natural reference.',
            input_schema=object_schema(
                {'supplierId': {'type': 'string', 'description': 'Supplier UUID or natural reference'}},
                ['supplierId'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=delete_supplier,
            preparer=prepare_delete_supplier,
        ),
        'master.search_customers': SemanticTool(
            name='master.search_customers',
            description='Search customers by name, email, or code.',
            input_schema=object_schema({'query': {'type': 'string'}}, ['query']),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=search_customers,
        ),
        'master.create_customer': SemanticTool(
            name='master.create_customer',
            description='Create a customer or client record. Requires a customer name.',
            input_schema=object_schema(
                {field: {'type': 'string'} for field in PARTY_FIELDS},
                ['name'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=create_customer,
            preparer=prepare_create_customer,
        ),
        'master.update_customer': SemanticTool(
            name='master.update_customer',
            description='Update a customer or client by UUID, name, or email.',
            input_schema=object_schema(
                {
                    'customerId': {'type': 'string', 'description': 'Customer UUID, name, or email'},
                    'patch': {
                        'type': 'object',
                        'properties': {field: {'type': 'string'} for field in PARTY_FIELDS},
                    },
                },
                ['customerId', 'patch'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=update_customer,
            preparer=prepare_update_customer,
        ),
        'master.delete_customer': SemanticTool(
            name='master.delete_customer',
            description='Delete a customer or client by UUID, name, or email.',
            input_schema=object_schema(
                {'customerId': {'type': 'string', 'description': 'Customer UUID, name, or email'}},
                ['customerId'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=delete_customer,
            preparer=prepare_delete_customer,
        ),
        'master.search_categories': SemanticTool(
            name='master.search_categories',
            description='Search product categories by name.',
            input_schema=object_schema({'query': {'type': 'string'}}, ['query']),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=search_categories,
        ),
        'navigation.find_screen': SemanticTool(
            name='navigation.find_screen',
            description='Find the most relevant internal screen for a user workflow request.',
            input_schema=object_schema({'query': {'type': 'string'}}, ['query']),
            risk_level='low',
            side_effect=False,
            output_mode='navigation',
            executor=find_screen,
        ),
        'purchasing.create_po': SemanticTool(
            name='purchasing.create_po',
            description='Create a purchase order draft. Supplier accepts a name or UUID.',
            input_schema=object_schema(
                {
                    'supplierId': {'type': 'string', 'description': 'Supplier name or UUID'},
                    'expectedDate': {'type': ['string', 'null']},
                    'lines': {'type': 'array', 'items': commerce_line_schema(price_field='unitCost', price_aliases=('cost', 'unit_price', 'price')), 'minItems': 1},
                },
                ['supplierId', 'lines'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=create_po,
            preparer=prepare_create_po,
        ),
        'purchasing.get_po': SemanticTool(
            name='purchasing.get_po',
            description='Fetch a purchase order by number or UUID.',
            input_schema=object_schema(
                {'poId': {'type': 'string', 'description': 'Purchase order number or UUID'}},
                ['poId'],
            ),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=get_po,
            preparer=prepare_get_po,
        ),
        'purchasing.list_pos': SemanticTool(
            name='purchasing.list_pos',
            description='List purchase orders, optionally filtered by status or supplier.',
            input_schema=object_schema(
                {
                    'status': {'type': ['string', 'null']},
                    'supplierId': {'type': ['string', 'null'], 'description': 'Supplier UUID or natural reference'},
                    'supplier': {'type': ['string', 'null']},
                    'supplierName': {'type': ['string', 'null']},
                }
            ),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=list_pos,
            preparer=prepare_list_pos,
        ),
        'purchasing.update_po': SemanticTool(
            name='purchasing.update_po',
            description='Update an existing purchase order by number or UUID.',
            input_schema=object_schema(
                {
                    'poId': {'type': 'string', 'description': 'Purchase order number or UUID'},
                    'supplierId': {'type': ['string', 'null'], 'description': 'Supplier UUID or natural reference'},
                    'expectedDate': {'type': ['string', 'null']},
                    'headerPatch': {
                        'type': 'object',
                        'properties': {
                            'supplierId': {'type': ['string', 'null']},
                            'expectedDate': {'type': ['string', 'null']},
                        },
                    },
                    'lines': {
                        'type': ['array', 'null'],
                        'items': commerce_line_schema(price_field='unitCost', price_aliases=('cost', 'unit_price', 'price')),
                        'minItems': 1,
                    },
                    'lineOps': {
                        'type': ['array', 'null'],
                        'items': commerce_line_op_schema(
                            price_field='unitCost',
                            price_aliases=('cost', 'unit_price', 'price'),
                            patch_price_field='change_cost',
                        ),
                        'minItems': 1,
                    },
                },
                ['poId'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=update_po,
            preparer=prepare_update_po,
        ),
        'purchasing.receive_po': SemanticTool(
            name='purchasing.receive_po',
            description='Receive stock against an existing purchase order into a location.',
            input_schema=object_schema(
                {
                    'poId': {'type': 'string', 'description': 'Purchase order number or UUID'},
                    'locationId': {'type': 'string', 'description': 'Location name, code, or UUID'},
                    'lines': {
                        'type': ['array', 'null'],
                        'items': commerce_line_schema(price_field='unitCost', price_aliases=('cost', 'unit_price', 'price')),
                        'minItems': 1,
                    },
                },
                ['poId', 'locationId'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=receive_po,
            preparer=prepare_receive_po,
        ),
        'purchasing.close_po': SemanticTool(
            name='purchasing.close_po',
            description='Close an existing purchase order by number or UUID.',
            input_schema=object_schema(
                {'poId': {'type': 'string', 'description': 'Purchase order number or UUID'}},
                ['poId'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=close_po,
            preparer=prepare_close_po,
        ),
        'purchasing.cancel_po': SemanticTool(
            name='purchasing.cancel_po',
            description='Cancel an existing purchase order by number or UUID.',
            input_schema=object_schema(
                {'poId': {'type': 'string', 'description': 'Purchase order number or UUID'}},
                ['poId'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=cancel_po,
            preparer=prepare_cancel_po,
        ),
        'sales.create_invoice': SemanticTool(
            name='sales.create_invoice',
            description='Create a sales order or invoice. Customer accepts a name, email, or UUID.',
            input_schema=object_schema(
                {
                    'customerId': {'type': 'string', 'description': 'Customer name, email, or UUID'},
                    'lines': {'type': 'array', 'items': commerce_line_schema(price_field='unitPrice', price_aliases=('unit_price', 'price')), 'minItems': 1},
                },
                ['customerId', 'lines'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=create_invoice,
            preparer=prepare_create_invoice,
        ),
        'sales.get_invoice': SemanticTool(
            name='sales.get_invoice',
            description='Fetch a sales order by number or UUID.',
            input_schema=object_schema(
                {'invoiceId': {'type': 'string', 'description': 'Sales order number or UUID'}},
                ['invoiceId'],
            ),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=get_invoice,
            preparer=prepare_get_invoice,
        ),
        'sales.list_invoices': SemanticTool(
            name='sales.list_invoices',
            description='List sales orders, optionally filtered by status or customer.',
            input_schema=object_schema(
                {
                    'status': {'type': ['string', 'null']},
                    'customerId': {'type': ['string', 'null'], 'description': 'Customer UUID or natural reference'},
                    'customer': {'type': ['string', 'null']},
                    'customerName': {'type': ['string', 'null']},
                }
            ),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=list_invoices,
            preparer=prepare_list_invoices,
        ),
        'sales.update_invoice': SemanticTool(
            name='sales.update_invoice',
            description='Update an existing sales order by number or UUID.',
            input_schema=object_schema(
                {
                    'invoiceId': {'type': 'string', 'description': 'Sales order number or UUID'},
                    'customerId': {'type': ['string', 'null'], 'description': 'Customer UUID or natural reference'},
                    'headerPatch': {
                        'type': 'object',
                        'properties': {
                            'customerId': {'type': ['string', 'null']},
                        },
                    },
                    'lines': {
                        'type': ['array', 'null'],
                        'items': commerce_line_schema(price_field='unitPrice', price_aliases=('unit_price', 'price')),
                        'minItems': 1,
                    },
                    'lineOps': {
                        'type': ['array', 'null'],
                        'items': commerce_line_op_schema(
                            price_field='unitPrice',
                            price_aliases=('unit_price', 'price'),
                            patch_price_field='change_price',
                        ),
                        'minItems': 1,
                    },
                },
                ['invoiceId'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=update_invoice,
            preparer=prepare_update_invoice,
        ),
        'sales.dispatch_invoice': SemanticTool(
            name='sales.dispatch_invoice',
            description='Dispatch an existing sales order from a specific location.',
            input_schema=object_schema(
                {
                    'invoiceId': {'type': 'string', 'description': 'Sales order number or UUID'},
                    'locationId': {'type': 'string', 'description': 'Location name, code, or UUID'},
                },
                ['invoiceId', 'locationId'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=dispatch_invoice,
            preparer=prepare_dispatch_invoice,
        ),
        'sales.cancel_invoice': SemanticTool(
            name='sales.cancel_invoice',
            description='Cancel an existing sales order by number or UUID.',
            input_schema=object_schema(
                {'invoiceId': {'type': 'string', 'description': 'Sales order number or UUID'}},
                ['invoiceId'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=cancel_invoice,
            preparer=prepare_cancel_invoice,
        ),
        'products.get_product_variants': SemanticTool(
            name='products.get_product_variants',
            description='List the available colour and size variants for a product.',
            input_schema=object_schema(
                {
                    'product': {'type': ['string', 'null']},
                    'productName': {'type': ['string', 'null']},
                    'styleCode': {'type': ['string', 'null']},
                },
            ),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=get_product_variants,
            preparer=prepare_get_product_variants,
        ),
    }
