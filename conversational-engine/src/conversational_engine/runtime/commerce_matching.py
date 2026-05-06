from __future__ import annotations

import re

from conversational_engine.clients.backend import BackendClient
from conversational_engine.contracts.auth import AuthContext

SIZE_LABELS = {'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'} | {str(size) for size in range(2, 31, 2)}


def normalize_text(value: str) -> str:
    return ' '.join(''.join(character.lower() if character.isalnum() else ' ' for character in value).split())


def normalized_tokens(value: str) -> set[str]:
    return {token for token in normalize_text(value).split() if token}


def parse_size_labels(text: str) -> list[str]:
    labels: list[str] = []
    for token in re.findall(r'\b[A-Za-z0-9]+\b', text.upper()):
        if token in SIZE_LABELS and token not in labels:
            labels.append(token)
    return labels


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
        email = str(customer.get('email') or '')
        code = str(customer.get('code') or '')
        if (
            normalize_text(name) in target
            or (email and email.lower() in message.lower())
            or (code and normalize_text(code) in target)
        ):
            return {'id': str(customer['id']), 'label': name}
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
    sized_pattern = re.compile(
        r'(?P<sku>[A-Za-z0-9-]+)\s*/\s*(?P<size>[A-Za-z0-9]+)\s*x(?P<qty>\d+)(?:\s*@(?P<cost>\d+))?',
        re.IGNORECASE,
    )
    bare_pattern = re.compile(
        r'(?P<sku>[A-Za-z0-9-]+)\s+(?P<qty>\d+)\s*(?:items?|units?|pcs?)\b(?:\s*@(?P<cost>\d+))?',
        re.IGNORECASE,
    )
    for segment in segments:
        sized_match = sized_pattern.search(segment)
        if sized_match:
            size_ref = await resolve_size_reference(
                backend_client,
                auth,
                sku_code=sized_match.group('sku').upper(),
                size_label=sized_match.group('size').upper(),
            )
            if not size_ref or not size_ref.get('sizeId'):
                continue
            cost = sized_match.group('cost')
            if cost is None and allow_missing_cost:
                remembered = po_cost_map.get((sized_match.group('sku').upper(), sized_match.group('size').upper()))
                if remembered is not None:
                    cost = str(remembered)
            line: dict[str, object] = {
                'sizeId': size_ref['sizeId'],
                'qty': int(sized_match.group('qty')),
            }
            if cost is not None:
                line['unitCost'] = int(cost)
            lines.append(line)
            continue

        bare_match = bare_pattern.search(segment)
        if not bare_match:
            continue
        line = {
            'productName': bare_match.group('sku').upper(),
            'qty': int(bare_match.group('qty')),
        }
        if bare_match.group('cost') is not None:
            line['unitCost'] = int(bare_match.group('cost'))
        lines.append(line)

    if lines:
        return lines

    qty_match = re.search(r'\b(\d+)\s*(?:items?|units?|pcs?)\b', message, re.IGNORECASE)
    if not qty_match:
        return []

    style_match = re.search(r'\b[A-Za-z]{2,}[A-Za-z0-9]*-\d{2,}\b', message)
    if style_match:
        fallback_line: dict[str, object] = {
            'productName': style_match.group(0).upper(),
            'qty': int(qty_match.group(1)),
        }
        cost_match = re.search(r'@\s*(\d+)\b', message)
        if cost_match:
            fallback_line['unitCost'] = int(cost_match.group(1))
        return [fallback_line]

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
