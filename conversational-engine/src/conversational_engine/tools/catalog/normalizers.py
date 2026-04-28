from __future__ import annotations

from typing import Any


def normalize_product_size(raw_size: dict[str, Any]) -> dict[str, Any] | None:
    size_label = raw_size.get('sizeLabel') or raw_size.get('size')
    if not isinstance(size_label, str) or not size_label.strip():
        return None

    normalized: dict[str, Any] = {'sizeLabel': size_label.strip().upper()}

    if isinstance(raw_size.get('barcode'), str) and raw_size['barcode'].strip():
        normalized['barcode'] = raw_size['barcode'].strip()
    if isinstance(raw_size.get('unitOfMeasure'), str) and raw_size['unitOfMeasure'].strip():
        normalized['unitOfMeasure'] = raw_size['unitOfMeasure'].strip()
    if isinstance(raw_size.get('packSize'), int):
        normalized['packSize'] = raw_size['packSize']
    if isinstance(raw_size.get('priceOverride'), int):
        normalized['priceOverride'] = raw_size['priceOverride']

    stock_by_location = raw_size.get('stockByLocation')
    if isinstance(stock_by_location, list):
        normalized['stockByLocation'] = [item for item in stock_by_location if isinstance(item, dict)]
    elif isinstance(raw_size.get('locationId'), str) and isinstance(raw_size.get('quantity'), int):
        normalized['stockByLocation'] = [
            {'locationId': raw_size['locationId'], 'quantity': raw_size['quantity']},
        ]

    return normalized


def normalize_product_create_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Accepts the AI's flexible variant shape and converts it to the backend-native
    { product, styleMedia, variants: [{ colorName, sizes: [...] }] } structure.
    Also normalizes nested approval-style payloads so partially-native shapes still
    satisfy the backend contract.
    """
    product = payload.get('product') if isinstance(payload.get('product'), dict) else payload
    variants = payload.get('variants')

    grouped_variants: dict[tuple[str, str | None, str | None], dict[str, Any]] = {}
    flat_variants = variants if isinstance(variants, list) else []

    for raw_variant in flat_variants:
        if not isinstance(raw_variant, dict):
            continue

        color_name = raw_variant.get('colorName') or raw_variant.get('color') or 'Default'
        if not isinstance(color_name, str) or not color_name.strip():
            color_name = 'Default'
        normalized_color = color_name.strip().title()

        color_code = raw_variant.get('colorCode')
        sku_code = raw_variant.get('skuCode')
        key = (
            normalized_color,
            str(color_code).strip() if isinstance(color_code, str) and color_code.strip() else None,
            str(sku_code).strip().upper() if isinstance(sku_code, str) and sku_code.strip() else None,
        )

        variant_entry = grouped_variants.setdefault(key, {'colorName': normalized_color, 'sizes': []})
        if key[1]:
            variant_entry['colorCode'] = key[1]
        if key[2]:
            variant_entry['skuCode'] = key[2]
        if isinstance(raw_variant.get('priceOverride'), int):
            variant_entry['priceOverride'] = raw_variant['priceOverride']
        if isinstance(raw_variant.get('media'), list):
            variant_entry['media'] = [item for item in raw_variant['media'] if isinstance(item, dict)]

        size_candidates = raw_variant.get('sizes') if isinstance(raw_variant.get('sizes'), list) else [raw_variant]
        for raw_size in size_candidates:
            if not isinstance(raw_size, dict):
                continue
            normalized_size = normalize_product_size(raw_size)
            if normalized_size:
                variant_entry['sizes'].append(normalized_size)

    return {
        'product': {
            'styleCode': product.get('styleCode'),
            'name': product.get('name'),
            'category': product.get('category', ''),
            'brand': product.get('brand', ''),
            'basePrice': product.get('basePrice'),
            'priceVisible': product.get('priceVisible', True),
            'inventoryMode': product.get('inventoryMode', 'local'),
            'maxBackorderQty': product.get('maxBackorderQty'),
            'pickupEnabled': product.get('pickupEnabled', False),
            'categoryId': product.get('categoryId'),
            'status': product.get('status', 'active'),
        },
        'styleMedia': (
            [item for item in payload.get('styleMedia', []) if isinstance(item, dict)]
            if isinstance(payload.get('styleMedia'), list)
            else []
        ),
        'variants': [v for v in grouped_variants.values() if v.get('sizes')],
    }
