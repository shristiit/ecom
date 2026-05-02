from __future__ import annotations

from typing import Any

from conversational_engine.clients.backend import BackendClient
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.retrieval.navigation_targets import NAVIGATION_TARGETS
from conversational_engine.tools.definitions import SemanticTool

from .resolvers import EntityResolver
from .utils import ToolPreparationError, object_schema, search_rows

PARTY_FIELDS = ('name', 'email', 'phone', 'address', 'status')
LOCATION_FIELDS = ('name', 'code', 'type', 'address', 'status')


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
        return {'locationId': await resolver.location(location), 'patch': patch}

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
        return {'locationId': await resolver.location(location)}

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
        return {'result': await backend.create_supplier(token, tenant, payload)}

    async def prepare_update_supplier(payload: dict[str, Any]) -> dict[str, Any]:
        supplier = first_reference(payload, 'supplierId', 'supplier', 'supplierName', 'reference', 'id')
        if not supplier:
            raise ToolPreparationError('Which supplier should I update?', ['supplier_id'])
        patch = extract_patch(payload, identifier_keys=('supplierId', 'supplier', 'supplierName', 'reference', 'id'))
        if not patch:
            raise ToolPreparationError('What supplier details should I change?', ['patch'])
        return {'supplierId': await resolver.supplier(supplier), 'patch': patch}

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
        return {'supplierId': await resolver.supplier(supplier)}

    async def delete_supplier(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.delete_supplier(token, tenant, str(payload['supplierId']))}

    async def prepare_create_customer(payload: dict[str, Any]) -> dict[str, Any]:
        normalized = clean_party_fields(payload)
        if not str(normalized.get('name') or '').strip():
            raise ToolPreparationError('What customer name should I create?', ['name'])
        return normalized

    async def create_customer(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.create_customer(token, tenant, payload)}

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
        return {'customerId': await resolver.customer(customer), 'patch': patch}

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
        return {'customerId': await resolver.customer(customer)}

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
        resolved['supplierId'] = await resolver.supplier(supplier)

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

            qty = raw_line.get('qty', raw_line.get('quantity'))
            unit_cost = raw_line.get('unitCost', raw_line.get('cost'))
            if qty is None or int(qty) <= 0 or unit_cost is None:
                raise ToolPreparationError(
                    'Each PO line needs an item, quantity, and unit cost.',
                    ['lines'],
                )

            size_id = str(raw_line.get('sizeId') or '').strip()
            if size_id:
                resolved_size_id = size_id
            else:
                try:
                    resolved_size_id = await resolver.size_from_payload(raw_line)
                except ValueError as exc:
                    raise ToolPreparationError(str(exc), ['lines']) from exc

            resolved_lines.append(
                {
                    'sizeId': resolved_size_id,
                    'qty': int(qty),
                    'unitCost': int(unit_cost),
                }
            )

        resolved['lines'] = resolved_lines
        return resolved

    async def create_po(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.create_po(token, tenant, payload)}

    async def prepare_receive_po(payload: dict[str, Any]) -> dict[str, Any]:
        po_ref = first_reference(payload, 'poId', 'purchaseOrderId', 'purchaseOrder', 'reference', 'id')
        if not po_ref:
            raise ToolPreparationError('Which purchase order should I receive?', ['po_id'])

        resolved = dict(payload)
        po_id = await resolver.purchase_order(po_ref)
        resolved['poId'] = po_id

        location = first_reference(payload, 'locationId', 'location', 'locationCode')
        if not location:
            raise ToolPreparationError('Which location should receive this purchase order?', ['location_id'])
        resolved['locationId'] = await resolver.location(location)

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
            if qty is None or int(qty) <= 0:
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

            resolved_lines.append({'sizeId': size_id, 'qty': int(qty), 'unitCost': int(unit_cost)})

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
        return {'poId': await resolver.purchase_order(po_ref)}

    async def close_po(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.close_po(token, tenant, str(payload['poId']))}

    async def prepare_create_invoice(payload: dict[str, Any]) -> dict[str, Any]:
        resolved = dict(payload)
        customer = str(payload.get('customerId') or '').strip()
        if not customer:
            raise ToolPreparationError('Which customer should this sales order use?', ['customer_id'])
        resolved['customerId'] = await resolver.customer(customer)

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

            line_size_id = str(raw_line.get('sizeId') or '').strip()
            qty = raw_line.get('qty', raw_line.get('quantity'))
            unit_price = raw_line.get('unitPrice')

            if qty is None or int(qty) <= 0:
                raise ToolPreparationError('Each sales order line needs an item and quantity.', ['lines'])

            if not line_size_id or unit_price is None:
                try:
                    details = await resolver.sku_size_details(
                        str(raw_line.get('productName') or '').strip(),
                        str(raw_line.get('sizeLabel') or '').strip(),
                        str(raw_line.get('colorName') or '').strip() or None,
                    )
                except ValueError as exc:
                    raise ToolPreparationError(str(exc), ['lines']) from exc
                line_size_id = str(details['sizeId'])
                if unit_price is None:
                    unit_price = details['unitPrice']

            resolved_lines.append(
                {
                    'sizeId': line_size_id,
                    'qty': int(qty),
                    'unitPrice': int(unit_price),
                }
            )

        resolved['lines'] = resolved_lines
        return resolved

    async def create_invoice(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.create_invoice(token, tenant, payload)}

    async def prepare_dispatch_invoice(payload: dict[str, Any]) -> dict[str, Any]:
        invoice_ref = first_reference(payload, 'invoiceId', 'salesOrderId', 'salesOrder', 'reference', 'id')
        if not invoice_ref:
            raise ToolPreparationError('Which sales order should I dispatch?', ['sales_order_id'])
        location = first_reference(payload, 'locationId', 'location', 'locationCode')
        if not location:
            raise ToolPreparationError('Which location should dispatch this sales order?', ['location_id'])
        return {
            'invoiceId': await resolver.invoice(invoice_ref),
            'locationId': await resolver.location(location),
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
        return {'invoiceId': await resolver.invoice(invoice_ref)}

    async def cancel_invoice(payload: dict[str, Any]) -> dict[str, Any]:
        return {'result': await backend.cancel_invoice(token, tenant, str(payload['invoiceId']))}

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
                    'lines': {'type': 'array', 'items': {'type': 'object'}},
                },
                ['supplierId', 'lines'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=create_po,
            preparer=prepare_create_po,
        ),
        'purchasing.receive_po': SemanticTool(
            name='purchasing.receive_po',
            description='Receive stock against an existing purchase order into a location.',
            input_schema=object_schema(
                {
                    'poId': {'type': 'string', 'description': 'Purchase order number or UUID'},
                    'locationId': {'type': 'string', 'description': 'Location name, code, or UUID'},
                    'lines': {'type': ['array', 'null'], 'items': {'type': 'object'}},
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
        'sales.create_invoice': SemanticTool(
            name='sales.create_invoice',
            description='Create a sales order or invoice. Customer accepts a name, email, or UUID.',
            input_schema=object_schema(
                {
                    'customerId': {'type': 'string', 'description': 'Customer name, email, or UUID'},
                    'lines': {'type': 'array', 'items': {'type': 'object'}},
                },
                ['customerId', 'lines'],
            ),
            risk_level='high',
            side_effect=True,
            output_mode='mutation',
            executor=create_invoice,
            preparer=prepare_create_invoice,
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
    }
