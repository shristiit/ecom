from __future__ import annotations

from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import PreviewEntity


def _dedupe_entities(entities: list[PreviewEntity]) -> list[PreviewEntity]:
    seen: set[tuple[str, str]] = set()
    results: list[PreviewEntity] = []
    for entity in entities:
        key = (entity.label, entity.value)
        if key in seen:
            continue
        seen.add(key)
        results.append(entity)
    return results


def _serialize_entities(entities: list[PreviewEntity]) -> list[dict[str, str]]:
    return [entity.model_dump(by_alias=True, mode='json') for entity in entities]


def build_product_update_operations(memory: dict[str, object]) -> dict[str, object]:
    product_patch: dict[str, object] = {}
    for source, target in (
        ('styleCode', 'styleCode'),
        ('name', 'name'),
        ('category', 'category'),
        ('brand', 'brand'),
        ('basePrice', 'basePrice'),
        ('categoryId', 'categoryId'),
        ('status', 'status'),
        ('pickupEnabled', 'pickupEnabled'),
    ):
        if memory.get(source) is not None:
            product_patch[target] = memory[source]

    preview_entities = [
        PreviewEntity(label='Product', value=str(memory.get('productName', memory.get('productId', ''))))
    ]
    sku_ops: list[dict[str, object]] = []
    size_ops: list[dict[str, object]] = []
    location_ops: list[dict[str, object]] = []

    if memory.get('skuCode') or memory.get('colorName'):
        if memory.get('existingSkuId'):
            sku_ops.append(
                {
                    'op': 'update',
                    'skuId': memory['existingSkuId'],
                    'payload': {
                        key: value
                        for key, value in {
                            'skuCode': memory.get('skuCode'),
                            'colorName': memory.get('colorName'),
                            'status': memory.get('status'),
                        }.items()
                        if value is not None
                    },
                }
            )
            preview_entities.append(PreviewEntity(label='SKU update', value=str(memory.get('skuCode', 'existing'))))
        else:
            sku_ops.append(
                {
                    'op': 'create',
                    'payload': {
                        'skuCode': memory['skuCode'],
                        'colorName': memory.get('colorName', 'Default'),
                        'status': memory.get('status', 'active'),
                    },
                }
            )
            preview_entities.append(PreviewEntity(label='SKU create', value=str(memory.get('skuCode', 'new'))))

    if memory.get('sizeLabels'):
        size_label = str(memory['sizeLabels'][0])
        size_payload = {
            'sizeLabel': size_label,
            'barcode': str(memory.get('barcode') or f'AUTO-{size_label}'),
            'unitOfMeasure': 'unit',
            'packSize': 1,
            'status': memory.get('status', 'active'),
        }
        if memory.get('existingSizeId'):
            size_ops.append({'op': 'update', 'sizeId': memory['existingSizeId'], 'payload': size_payload})
            preview_entities.append(PreviewEntity(label='Size update', value=size_label))
        else:
            size_ops.append({'op': 'create', 'skuCode': memory.get('skuCode'), 'payload': size_payload})
            preview_entities.append(PreviewEntity(label='Size create', value=size_label))

    if memory.get('locationId'):
        location_ops.append(
            {
                'payload': {
                    'locationId': memory['locationId'],
                    'isEnabled': True,
                    'pickupEnabled': bool(memory.get('pickupEnabled', False)),
                }
            }
        )
        preview_entities.append(PreviewEntity(label='Location', value=str(memory.get('locationLabel', ''))))

    return {
        'productId': memory['productId'],
        'productPatch': product_patch,
        'skuOps': sku_ops,
        'sizeOps': size_ops,
        'locationOps': location_ops,
        'previewEntities': _serialize_entities(_dedupe_entities(preview_entities)),
    }


def build_preview_payload(auth: AuthContext, memory: dict[str, object]) -> dict[str, object]:
    action_type = str(memory.get('actionType') or memory.get('intent') or 'workflow')
    entities: list[PreviewEntity] = []
    warnings: list[str] = []

    if action_type == 'transfer_stock':
        memory['executionPayload'] = {
            'sizeId': memory['sizeId'],
            'fromLocationId': memory['fromLocationId'],
            'toLocationId': memory['toLocationId'],
            'quantity': memory['quantity'],
            'reason': memory['reason'],
        }
        entities.extend(
            [
                PreviewEntity(label='SKU', value=str(memory.get('skuCode', ''))),
                PreviewEntity(label='Size', value=str(memory.get('sizeLabel', ''))),
                PreviewEntity(label='From', value=str(memory.get('fromLocationLabel', ''))),
                PreviewEntity(label='To', value=str(memory.get('toLocationLabel', ''))),
                PreviewEntity(label='Quantity', value=str(memory.get('quantity', ''))),
                PreviewEntity(label='Reason', value=str(memory.get('reason', ''))),
            ]
        )
        memory['summary'] = (
            f'Transfer {memory.get("quantity")} units of {memory.get("skuCode")} / {memory.get("sizeLabel")} '
            f'from {memory.get("fromLocationLabel")} to {memory.get("toLocationLabel")}'
        )
    elif action_type in {'adjust_stock', 'receive_stock', 'write_off_stock', 'cycle_count'}:
        memory['executionPayload'] = {
            'sizeId': memory['sizeId'],
            'locationId': memory['locationId'],
            'quantity': memory['quantity'],
            'reason': memory['reason'],
        }
        entities.extend(
            [
                PreviewEntity(label='SKU', value=str(memory.get('skuCode', ''))),
                PreviewEntity(label='Size', value=str(memory.get('sizeLabel', ''))),
                PreviewEntity(label='Location', value=str(memory.get('locationLabel', ''))),
                PreviewEntity(label='Quantity', value=str(memory.get('quantity', ''))),
                PreviewEntity(label='Reason', value=str(memory.get('reason', ''))),
            ]
        )
        memory['summary'] = (
            f'{action_type.replace("_", " ").title()} for {memory.get("quantity")} units of '
            f'{memory.get("skuCode")} / {memory.get("sizeLabel")} at {memory.get("locationLabel")}'
        )
        if action_type == 'write_off_stock':
            warnings.append('This write-off will permanently reduce stock.')
    elif action_type == 'create_po':
        memory['executionPayload'] = {
            'supplierId': memory['supplierId'],
            'lines': memory['lines'],
        }
        if memory.get('expectedDate'):
            memory['executionPayload']['expectedDate'] = memory['expectedDate']
        entities.extend(
            [
                PreviewEntity(label='Supplier', value=str(memory.get('supplierName', ''))),
                PreviewEntity(label='Line count', value=str(len(memory.get('lines', [])))),
            ]
        )
        if memory.get('expectedDate'):
            entities.insert(1, PreviewEntity(label='Expected date', value=str(memory.get('expectedDate', ''))[:10]))
        memory['summary'] = f'Create PO draft for {memory.get("supplierName")} with {len(memory.get("lines", []))} line(s)'
    elif action_type == 'update_po':
        patch: dict[str, object] = {}
        if memory.get('supplierId'):
            patch['supplierId'] = memory['supplierId']
            entities.append(PreviewEntity(label='Supplier', value=str(memory.get('supplierName', ''))))
        if memory.get('expectedDate'):
            patch['expectedDate'] = memory['expectedDate']
            entities.append(PreviewEntity(label='Expected date', value=str(memory.get('expectedDate', ''))[:10]))
        if memory.get('lines'):
            patch['lines'] = memory['lines']
            entities.append(PreviewEntity(label='Line count', value=str(len(memory.get('lines', [])))))
        memory['executionPayload'] = {'poId': memory['poId'], 'patch': patch}
        entities.insert(0, PreviewEntity(label='PO', value=str(memory.get('poNumber', memory.get('poId', '')))))
        memory['summary'] = f'Update {memory.get("poNumber", memory.get("poId", "PO"))}'
    elif action_type == 'receive_po':
        memory['executionPayload'] = {
            'poId': memory['poId'],
            'locationId': memory['locationId'],
            'lines': memory['lines'],
        }
        entities.extend(
            [
                PreviewEntity(label='PO', value=str(memory.get('poNumber', memory.get('poId', '')))),
                PreviewEntity(label='Location', value=str(memory.get('locationLabel', ''))),
                PreviewEntity(label='Line count', value=str(len(memory.get('lines', [])))),
            ]
        )
        memory['summary'] = f'Receive {len(memory.get("lines", []))} PO line(s) for {memory.get("poNumber", memory.get("poId", "PO"))}'
    elif action_type == 'close_po':
        memory['executionPayload'] = {'poId': memory['poId']}
        entities.append(PreviewEntity(label='PO', value=str(memory.get('poNumber', memory.get('poId', '')))))
        memory['summary'] = f'Close {memory.get("poNumber", memory.get("poId", "PO"))}'
        warnings.append('Closing a PO stops further draft edits.')
    elif action_type == 'create_sales_order':
        memory['executionPayload'] = {
            'customerId': memory['customerId'],
            'lines': memory['lines'],
        }
        entities.extend(
            [
                PreviewEntity(label='Customer', value=str(memory.get('customerName', ''))),
                PreviewEntity(label='Line count', value=str(len(memory.get('lines', [])))),
            ]
        )
        memory['summary'] = (
            f'Create sales order for {memory.get("customerName")} with {len(memory.get("lines", []))} line(s)'
        )
    elif action_type == 'update_sales_order':
        patch: dict[str, object] = {}
        if memory.get('customerId'):
            patch['customerId'] = memory['customerId']
            entities.append(PreviewEntity(label='Customer', value=str(memory.get('customerName', ''))))
        if memory.get('lines'):
            patch['lines'] = memory['lines']
            entities.append(PreviewEntity(label='Line count', value=str(len(memory.get('lines', [])))))
        memory['executionPayload'] = {'invoiceId': memory['invoiceId'], 'patch': patch}
        entities.insert(0, PreviewEntity(label='Sales order', value=str(memory.get('invoiceNumber', memory.get('invoiceId', '')))))
        memory['summary'] = f'Update {memory.get("invoiceNumber", memory.get("invoiceId", "sales order"))}'
    elif action_type == 'dispatch_sales_order':
        memory['executionPayload'] = {
            'invoiceId': memory['invoiceId'],
            'locationId': memory['locationId'],
        }
        entities.extend(
            [
                PreviewEntity(label='Sales order', value=str(memory.get('invoiceNumber', memory.get('invoiceId', '')))),
                PreviewEntity(label='Location', value=str(memory.get('locationLabel', ''))),
            ]
        )
        memory['summary'] = (
            f'Dispatch {memory.get("invoiceNumber", memory.get("invoiceId", "sales order"))} '
            f'from {memory.get("locationLabel")}'
        )
    elif action_type == 'cancel_sales_order':
        memory['executionPayload'] = {'invoiceId': memory['invoiceId']}
        entities.append(PreviewEntity(label='Sales order', value=str(memory.get('invoiceNumber', memory.get('invoiceId', '')))))
        memory['summary'] = f'Cancel {memory.get("invoiceNumber", memory.get("invoiceId", "sales order"))}'
        warnings.append('Canceling a sales order stops further processing.')
    elif action_type == 'create_product':
        size_labels = [str(label) for label in memory.get('sizeLabels', [])]
        color_names = [str(label) for label in memory.get('colorNames', [])] or [str(memory.get('colorName', ''))]
        stock_by_size = memory.get('sizeQuantities') if isinstance(memory.get('sizeQuantities'), dict) else {}
        media: list[dict[str, object]] = []
        if memory.get('mediaUrl'):
            media.append(
                {
                    'url': memory['mediaUrl'],
                    'altText': str(memory.get('name', '')),
                    'sortOrder': 0,
                    'isPrimary': True,
                }
            )
        memory['executionPayload'] = {
            'product': {
                'styleCode': memory['styleCode'],
                'name': memory['name'],
                'category': memory.get('category', ''),
                'brand': memory.get('brand', ''),
                'basePrice': memory['basePrice'],
                'categoryId': memory.get('categoryId'),
                'status': memory.get('status', 'active'),
            },
            'styleMedia': media,
            'variants': [],
        }
        for index, color_name in enumerate(color_names):
            variant: dict[str, object] = {
                'colorName': color_name,
                'media': media,
                'sizes': [],
            }
            if memory.get('skuCode') and index == 0:
                variant['skuCode'] = memory['skuCode']
            for size_label in size_labels:
                stock_by_location: list[dict[str, object]] = []
                if memory.get('locationId'):
                    per_size_quantity = stock_by_size.get(size_label)
                    if per_size_quantity is not None:
                        stock_by_location = [{'locationId': memory['locationId'], 'quantity': int(per_size_quantity)}]
                    elif memory.get('quantity') is not None and len(size_labels) == 1:
                        stock_by_location = [{'locationId': memory['locationId'], 'quantity': memory['quantity']}]
                variant['sizes'].append({'sizeLabel': size_label, 'stockByLocation': stock_by_location})
            memory['executionPayload']['variants'].append(variant)
        entities.extend(
            [
                PreviewEntity(label='Style code', value=str(memory.get('styleCode', ''))),
                PreviewEntity(label='Name', value=str(memory.get('name', ''))),
                PreviewEntity(label='Category', value=str(memory.get('category', ''))),
                PreviewEntity(label='Variants', value=', '.join(color_names)),
                PreviewEntity(label='Sizes', value=', '.join(size_labels)),
            ]
        )
        if memory.get('skuCode'):
            entities.insert(4, PreviewEntity(label='SKU', value=str(memory.get('skuCode', ''))))
        if memory.get('locationLabel'):
            stock_summary = (
                ', '.join(f'{size}:{qty}' for size, qty in stock_by_size.items()) if stock_by_size else str(memory.get('quantity', 0))
            )
            entities.append(PreviewEntity(label='Initial stock', value=f'{stock_summary} at {memory.get("locationLabel")}'))
        memory['summary'] = f'Create product {memory.get("styleCode")} / {memory.get("name")}'
    elif action_type == 'update_product':
        operations = build_product_update_operations(memory)
        memory['executionPayload'] = operations
        entities.extend(operations['previewEntities'])
        memory['summary'] = f'Update product {memory.get("productName", memory.get("productId", ""))}'
    else:
        memory['executionPayload'] = {}
        warnings.append('The execution payload could not be constructed.')

    return {
        'actionType': action_type.replace('_', ' ').title(),
        'actor': auth.email,
        'entities': _serialize_entities(_dedupe_entities(entities)),
        'warnings': warnings,
        'nextStep': 'Confirm to submit this request for approval.',
    }
