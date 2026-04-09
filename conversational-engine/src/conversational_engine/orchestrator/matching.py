from __future__ import annotations

import re

from conversational_engine.clients.backend import BackendClient
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.orchestrator.parsing import (
    normalize_text,
    normalized_tokens,
    parse_size_labels,
    parse_uuid,
)


def extract_sku_code(message: str) -> str | None:
    if sku_match := re.search(r'sku\s+([A-Za-z0-9-]+)', message, re.IGNORECASE):
        return sku_match.group(1).strip().upper()
    if pair_match := re.search(r'([A-Za-z0-9-]+)\s*/\s*([A-Za-z0-9]+)', message):
        return pair_match.group(1).strip().upper()
    return None


def extract_size_label(message: str) -> str | None:
    if pair_match := re.search(r'([A-Za-z0-9-]+)\s*/\s*([A-Za-z0-9]+)', message):
        return pair_match.group(2).strip().upper()
    labels = parse_size_labels(message)
    return labels[0] if labels else None


def extract_reason(message: str) -> str | None:
    if match := re.search(r'reason\s+(.*)', message, re.IGNORECASE):
        return match.group(1).strip().strip('.')
    normalized = normalize_text(message)
    if 'damaged' in normalized:
        return 'damaged stock'
    if 'cycle count' in normalized:
        return 'cycle count'
    return None


async def match_location(
    backend_client: BackendClient,
    auth: AuthContext,
    message: str,
    *,
    qualifier: str | None = None,
) -> dict[str, str] | None:
    text = message
    if qualifier:
        qualifier_match = re.search(rf'{qualifier}\s+([A-Za-z0-9 \-]+)', message, re.IGNORECASE)
        if qualifier_match:
            text = qualifier_match.group(1)
    locations = await backend_client.list_locations(auth.access_token or '', auth.tenant_id)
    target = normalize_text(text)
    target_tokens = normalized_tokens(text)
    for location in locations:
        name = str(location.get('name') or '')
        code = str(location.get('code') or '')
        normalized_name = normalize_text(name)
        normalized_code = normalize_text(code)
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


async def match_supplier(
    backend_client: BackendClient,
    auth: AuthContext,
    message: str,
) -> dict[str, str] | None:
    suppliers = await backend_client.list_suppliers(auth.access_token or '', auth.tenant_id)
    target = normalize_text(message)
    for supplier in suppliers:
        name = str(supplier.get('name') or '')
        if normalize_text(name) in target:
            return {'id': str(supplier['id']), 'label': name}
    return None


async def match_customer(
    backend_client: BackendClient,
    auth: AuthContext,
    message: str,
) -> dict[str, str] | None:
    customers = await backend_client.list_customers(auth.access_token or '', auth.tenant_id)
    target = normalize_text(message)
    for customer in customers:
        name = str(customer.get('name') or '')
        if normalize_text(name) in target:
            return {'id': str(customer['id']), 'label': name}
    return None


async def match_category(
    backend_client: BackendClient,
    auth: AuthContext,
    message: str,
) -> dict[str, str] | None:
    categories = await backend_client.list_categories(auth.access_token or '', auth.tenant_id)
    target = normalize_text(message)
    for category in categories:
        name = str(category.get('name') or '')
        if normalize_text(name) in target:
            return {'id': str(category['id']), 'label': name}
    return None


async def match_po(
    backend_client: BackendClient,
    auth: AuthContext,
    message: str,
) -> dict[str, str] | None:
    uuid_value = parse_uuid(message)
    if uuid_value:
        return {'id': uuid_value, 'number': uuid_value[:8]}

    payload = await backend_client.list_pos(auth.access_token or '', auth.tenant_id, params={'pageSize': 50})
    items = payload.get('items', []) if isinstance(payload, dict) else []
    target = normalize_text(message)
    for item in items:
        if not isinstance(item, dict):
            continue
        number = str(item.get('number') or '')
        supplier_name = str(item.get('supplierName') or '')
        identifier = str(item.get('id') or '')
        if normalize_text(number) in target or identifier[:8].lower() in target or normalize_text(supplier_name) in target:
            return {'id': identifier, 'number': number or identifier[:8]}
    return None


async def match_product(
    backend_client: BackendClient,
    auth: AuthContext,
    message: str,
) -> dict[str, str] | None:
    uuid_value = parse_uuid(message)
    if uuid_value:
        product = await backend_client.get_product(auth.access_token or '', auth.tenant_id, uuid_value)
        product_name = str(product.get('product', {}).get('name') or uuid_value)
        return {'id': uuid_value, 'label': product_name}

    products = await backend_client.list_products(auth.access_token or '', auth.tenant_id)
    target = normalize_text(message)
    for product in products:
        if not isinstance(product, dict):
            continue
        name = str(product.get('name') or '')
        style_code = str(product.get('style_code') or product.get('styleCode') or '')
        if normalize_text(name) in target or normalize_text(style_code) in target:
            return {'id': str(product['id']), 'label': f'{name} ({style_code})'.strip()}
    return None


async def match_invoice(
    backend_client: BackendClient,
    auth: AuthContext,
    message: str,
) -> dict[str, str] | None:
    uuid_value = parse_uuid(message)
    if uuid_value:
        return {'id': uuid_value, 'number': f'SO-{uuid_value[:8].upper()}'}

    payload = await backend_client.list_invoices(
        auth.access_token or '',
        auth.tenant_id,
        params={'pageSize': 50},
    )
    items = payload.get('items', []) if isinstance(payload, dict) else []
    target = normalize_text(message)
    for item in items:
        if not isinstance(item, dict):
            continue
        number = str(item.get('number') or '')
        customer_name = str(item.get('customerName') or '')
        identifier = str(item.get('id') or '')
        if normalize_text(number) in target or identifier[:8].lower() in target or normalize_text(customer_name) in target:
            return {'id': identifier, 'number': number or f'SO-{identifier[:8].upper()}'}
    return None


async def resolve_size_reference(
    backend_client: BackendClient,
    auth: AuthContext,
    *,
    sku_code: str,
    size_label: str,
) -> dict[str, object] | None:
    if not sku_code or not size_label:
        return None
    sku_matches = await backend_client.search_skus(auth.access_token or '', auth.tenant_id, sku_code)
    exact = None
    for candidate in sku_matches:
        code = str(candidate.get('sku_code') or '')
        if code.upper() == sku_code.upper():
            exact = candidate
            break
    candidate = exact or (sku_matches[0] if sku_matches else None)
    if not isinstance(candidate, dict):
        return None

    product = await backend_client.get_product(
        auth.access_token or '',
        auth.tenant_id,
        str(candidate['product_id']),
    )
    skus = product.get('skus', []) if isinstance(product, dict) else []
    sizes = product.get('sizes', []) if isinstance(product, dict) else []

    existing_sku_id: str | None = None
    for sku in skus:
        if not isinstance(sku, dict):
            continue
        if str(sku.get('sku_code') or '').upper() == sku_code.upper():
            existing_sku_id = str(sku['id'])
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


async def parse_po_lines(
    backend_client: BackendClient,
    auth: AuthContext,
    message: str,
    *,
    po_id: str,
    allow_missing_cost: bool,
) -> list[dict[str, object]]:
    segments = [segment.strip() for segment in re.split(r'[,\n;]+', message) if segment.strip()]
    if not segments:
        return []

    po_cost_map: dict[tuple[str, str], int] = {}
    if allow_missing_cost and po_id:
        po_detail = await backend_client.get_po(auth.access_token or '', auth.tenant_id, po_id)
        for line in po_detail.get('lines', []):
            if not isinstance(line, dict):
                continue
            sku = str(line.get('sku') or '')
            if '-' not in sku:
                continue
            sku_code, size_label = sku.rsplit('-', 1)
            po_cost_map[(sku_code.upper(), size_label.upper())] = int(line.get('unitCost') or 0)

    lines: list[dict[str, object]] = []
    pattern = re.compile(
        r'(?P<sku>[A-Za-z0-9-]+)\s*/\s*(?P<size>[A-Za-z0-9]+)\s*x(?P<qty>\d+)(?:\s*@(?P<cost>\d+))?',
        re.IGNORECASE,
    )
    for segment in segments:
        match = pattern.search(segment)
        if not match:
            continue
        size_ref = await resolve_size_reference(
            backend_client,
            auth,
            sku_code=match.group('sku').upper(),
            size_label=match.group('size').upper(),
        )
        if not size_ref or not size_ref.get('sizeId'):
            continue
        cost = match.group('cost')
        if cost is None and allow_missing_cost:
            cost = str(po_cost_map.get((match.group('sku').upper(), match.group('size').upper()), 0))
        if cost is None:
            continue
        lines.append(
            {
                'sizeId': size_ref['sizeId'],
                'qty': int(match.group('qty')),
                'unitCost': int(cost),
            }
        )
    return lines


async def parse_sales_lines(
    backend_client: BackendClient,
    auth: AuthContext,
    message: str,
    *,
    invoice_id: str,
) -> list[dict[str, object]]:
    del invoice_id
    segments = [segment.strip() for segment in re.split(r'[,\n;]+', message) if segment.strip()]
    if not segments:
        return []

    lines: list[dict[str, object]] = []
    pattern = re.compile(
        r'(?P<sku>[A-Za-z0-9-]+)\s*/\s*(?P<size>[A-Za-z0-9]+)\s*x(?P<qty>\d+)(?:\s*@(?P<price>\d+))?',
        re.IGNORECASE,
    )
    for segment in segments:
        match = pattern.search(segment)
        if not match or match.group('price') is None:
            continue
        size_ref = await resolve_size_reference(
            backend_client,
            auth,
            sku_code=match.group('sku').upper(),
            size_label=match.group('size').upper(),
        )
        if not size_ref or not size_ref.get('sizeId'):
            continue
        lines.append(
            {
                'sizeId': size_ref['sizeId'],
                'qty': int(match.group('qty')),
                'unitPrice': int(match.group('price')),
            }
        )
    return lines
