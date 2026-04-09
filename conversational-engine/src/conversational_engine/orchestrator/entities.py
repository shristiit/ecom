from __future__ import annotations

import re

from conversational_engine.clients.backend import BackendClient
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.orchestrator.matching import (
    extract_reason,
    extract_size_label,
    extract_sku_code,
    match_category,
    match_customer,
    match_invoice,
    match_location,
    match_po,
    match_product,
    match_supplier,
    parse_po_lines,
    parse_sales_lines,
    resolve_size_reference,
)
from conversational_engine.orchestrator.parsing import (
    extract_color_names,
    normalize_text,
    parse_iso_date,
    parse_money,
    parse_size_labels,
)


async def extract_stock_query_entities(
    backend_client: BackendClient,
    auth: AuthContext,
    message: str,
) -> dict[str, object]:
    location = await match_location(backend_client, auth, message)
    sku_code = extract_sku_code(message)
    return {
        'query': message.strip(),
        **({'locationId': location['id'], 'locationLabel': location['label']} if location else {}),
        **({'skuQuery': sku_code} if sku_code else {}),
    }


async def extract_reporting_entities(
    backend_client: BackendClient,
    auth: AuthContext,
    message: str,
) -> dict[str, object]:
    normalized = normalize_text(message)
    report_type = 'stock'
    if 'movement' in normalized:
        report_type = 'movement'
    elif 'receipt' in normalized:
        report_type = 'receipt'
    elif 'po' in normalized or 'purchase order' in normalized:
        report_type = 'po'

    location = await match_location(backend_client, auth, message)
    status_match = re.search(r'\b(draft|open|partial|closed)\b', normalized)

    payload: dict[str, object] = {
        'reportType': report_type,
        'query': message.strip(),
    }
    if location:
        payload['locationId'] = location['id']
        payload['locationLabel'] = location['label']
    if status_match:
        payload['status'] = status_match.group(1)
    start = parse_iso_date(message)
    if start:
        payload['from'] = start
    return payload


async def extract_inventory_entities(
    backend_client: BackendClient,
    auth: AuthContext,
    intent: str,
    memory: dict[str, object],
    message: str,
) -> dict[str, object]:
    extracted: dict[str, object] = {}
    normalized = normalize_text(message)

    if intent == 'stock_transfer':
        from_location = await match_location(backend_client, auth, message, qualifier='from')
        to_location = await match_location(backend_client, auth, message, qualifier='to')
        if from_location:
            extracted['fromLocationId'] = from_location['id']
            extracted['fromLocationLabel'] = from_location['label']
        if to_location:
            extracted['toLocationId'] = to_location['id']
            extracted['toLocationLabel'] = to_location['label']
        extracted['actionType'] = 'transfer_stock'
        extracted['toolName'] = 'inventory.transferStock'
    else:
        location = await match_location(backend_client, auth, message)
        if location:
            extracted['locationId'] = location['id']
            extracted['locationLabel'] = location['label']
        if intent == 'stock_receipt' or 'receive' in normalized:
            extracted['actionType'] = 'receive_stock'
            extracted['toolName'] = 'inventory.receiveStock'
        elif 'cycle count' in normalized:
            extracted['actionType'] = 'cycle_count'
            extracted['toolName'] = 'inventory.cycleCount'
        elif 'write off' in normalized or 'damaged' in normalized:
            extracted['actionType'] = 'write_off_stock'
            extracted['toolName'] = 'inventory.writeOffStock'
        else:
            extracted['actionType'] = 'adjust_stock'
            extracted['toolName'] = 'inventory.adjustStock'

    size_match = await resolve_size_reference(
        backend_client,
        auth,
        sku_code=extract_sku_code(message) or str(memory.get('skuCode') or ''),
        size_label=extract_size_label(message) or str(memory.get('sizeLabel') or ''),
    )
    if size_match:
        extracted.update(size_match)

    quantity_match = re.search(
        r'\b(?:quantity|qty|initial stock|stock)\s*(?:is|of|=)?\s*(\d+)\b',
        message,
        re.IGNORECASE,
    )
    if quantity_match:
        extracted['quantity'] = int(quantity_match.group(1))

    reason = extract_reason(message)
    if reason:
        extracted['reason'] = reason
    elif extracted.get('actionType') == 'write_off_stock':
        extracted.setdefault('reason', 'damaged stock')
    elif extracted.get('actionType') == 'cycle_count':
        extracted.setdefault('reason', 'cycle count')

    return extracted


async def extract_po_entities(
    backend_client: BackendClient,
    auth: AuthContext,
    intent: str,
    memory: dict[str, object],
    message: str,
) -> dict[str, object]:
    extracted: dict[str, object] = {}
    normalized = normalize_text(message)

    if intent == 'po_create':
        extracted['actionType'] = 'create_po'
        extracted['toolName'] = 'purchasing.createPO'
    elif intent == 'po_receive':
        extracted['actionType'] = 'receive_po'
        extracted['toolName'] = 'purchasing.receivePO'
    elif intent == 'po_close' or 'close po' in normalized:
        extracted['actionType'] = 'close_po'
        extracted['toolName'] = 'purchasing.closePO'
    else:
        extracted['actionType'] = 'update_po'
        extracted['toolName'] = 'purchasing.updatePO'

    supplier = await match_supplier(backend_client, auth, message)
    if supplier:
        extracted['supplierId'] = supplier['id']
        extracted['supplierName'] = supplier['label']

    po_ref = await match_po(backend_client, auth, message)
    if po_ref:
        extracted['poId'] = po_ref['id']
        extracted['poNumber'] = po_ref['number']

    location = await match_location(backend_client, auth, message)
    if location:
        extracted['locationId'] = location['id']
        extracted['locationLabel'] = location['label']

    expected_date = parse_iso_date(message)
    if expected_date:
        extracted['expectedDate'] = expected_date

    lines = await parse_po_lines(
        backend_client,
        auth,
        message,
        po_id=str(extracted.get('poId') or memory.get('poId') or ''),
        allow_missing_cost=intent == 'po_receive',
    )
    if lines:
        extracted['lines'] = lines

    return extracted


async def extract_sales_entities(
    backend_client: BackendClient,
    auth: AuthContext,
    intent: str,
    memory: dict[str, object],
    message: str,
) -> dict[str, object]:
    extracted: dict[str, object] = {}

    if intent == 'so_create':
        extracted['actionType'] = 'create_sales_order'
        extracted['toolName'] = 'sales.createInvoice'
    elif intent == 'so_update':
        extracted['actionType'] = 'update_sales_order'
        extracted['toolName'] = 'sales.updateInvoice'
    elif intent == 'so_dispatch':
        extracted['actionType'] = 'dispatch_sales_order'
        extracted['toolName'] = 'sales.dispatchInvoice'
    else:
        extracted['actionType'] = 'cancel_sales_order'
        extracted['toolName'] = 'sales.cancelInvoice'

    customer = await match_customer(backend_client, auth, message)
    if customer:
        extracted['customerId'] = customer['id']
        extracted['customerName'] = customer['label']

    invoice_ref = await match_invoice(backend_client, auth, message)
    if invoice_ref:
        extracted['invoiceId'] = invoice_ref['id']
        extracted['invoiceNumber'] = invoice_ref['number']

    location = await match_location(backend_client, auth, message)
    if location:
        extracted['locationId'] = location['id']
        extracted['locationLabel'] = location['label']

    lines = await parse_sales_lines(
        backend_client,
        auth,
        message,
        invoice_id=str(extracted.get('invoiceId') or memory.get('invoiceId') or ''),
    )
    if lines:
        extracted['lines'] = lines

    return extracted


async def extract_product_entities(
    backend_client: BackendClient,
    auth: AuthContext,
    intent: str,
    memory: dict[str, object],
    message: str,
) -> dict[str, object]:
    extracted: dict[str, object] = {}
    normalized = normalize_text(message)

    product_ref = await match_product(backend_client, auth, message)
    if product_ref:
        extracted['productId'] = product_ref['id']
        extracted['productName'] = product_ref['label']

    category = await match_category(backend_client, auth, message)
    if category:
        extracted['categoryId'] = category['id']
        extracted['category'] = category['label']
    elif match := re.search(r'category\s+([a-zA-Z0-9 -]+)', message, re.IGNORECASE):
        extracted['category'] = match.group(1).strip()
    elif match := re.search(r'([a-zA-Z0-9 -]+)\s+category\b', message, re.IGNORECASE):
        extracted['category'] = match.group(1).strip(' ,')

    if style := re.search(r'sty(?:le|e)(?:\s*code)?\s*(?:is|=|:)?\s*([A-Za-z0-9_-]+)', message, re.IGNORECASE):
        extracted['styleCode'] = style.group(1).strip().upper()

    name_match = re.search(
        r'(?:name|named)\s+"?(.+?)"?(?=\s+(?:with|style|category|base|price|colors?|sizes?|sku|barcode|location|stock|qty|quantity)\b|$)',
        message,
        re.IGNORECASE,
    )
    if name_match:
        extracted['name'] = name_match.group(1).strip()

    price = parse_money(message)
    if price is not None:
        extracted['basePrice'] = price

    if brand := re.search(r'brand\s+([a-zA-Z0-9 -]+)', message, re.IGNORECASE):
        extracted['brand'] = brand.group(1).strip()

    color_names = extract_color_names(message)
    if color_names:
        extracted['colorNames'] = color_names
        extracted['colorName'] = color_names[0]

    sku_code = extract_sku_code(message)
    if sku_code:
        extracted['skuCode'] = sku_code

    size_labels = parse_size_labels(message)
    if size_labels:
        extracted['sizeLabels'] = size_labels

    if barcode := re.search(r'barcode\s+([A-Za-z0-9-]+)', message, re.IGNORECASE):
        extracted['barcode'] = barcode.group(1).strip()

    location = await match_location(backend_client, auth, message)
    if location:
        extracted['locationId'] = location['id']
        extracted['locationLabel'] = location['label']

    quantity_match = re.search(
        (
            r'(?:\b(?:quantity|qty|initial stock|stock)\s*(?:is|of|=)?\s*(\d+)\b|'
            r'\bhas\s+(\d+)\s+stock\b|\b(\d+)\s+stock\b)'
        ),
        message,
        re.IGNORECASE,
    )
    if quantity_match:
        extracted['quantity'] = int(next(group for group in quantity_match.groups() if group is not None))
        size_labels = extracted.get('sizeLabels') or memory.get('sizeLabels')
        if isinstance(size_labels, list) and size_labels and re.search(r'\beach\b', message, re.IGNORECASE):
            extracted['sizeQuantities'] = {
                str(size_label): int(extracted['quantity']) for size_label in size_labels
            }

    media_url = re.search(r'(https?://\S+)', message)
    if media_url:
        extracted['mediaUrl'] = media_url.group(1)

    if 'inactive' in normalized:
        extracted['status'] = 'inactive'
    elif 'active' in normalized:
        extracted['status'] = 'active'

    if intent == 'product_create':
        extracted['actionType'] = 'create_product'
        extracted['toolName'] = 'products.createProduct'
    else:
        extracted['actionType'] = 'update_product'
        extracted['toolName'] = 'products.updateProduct'

    if pickup := re.search(r'pickup\s+(enabled|disabled)', normalized):
        extracted['pickupEnabled'] = pickup.group(1) == 'enabled'

    return extracted
