from __future__ import annotations

from typing import Any

from conversational_engine.clients.backend import BackendClient
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.retrieval.navigation_targets import NAVIGATION_TARGETS
from conversational_engine.tools.definitions import SemanticTool

from .resolvers import EntityResolver
from .utils import ToolPreparationError, object_schema, search_rows


def build_commerce_tools(
    backend: BackendClient, auth: AuthContext, resolver: EntityResolver
) -> dict[str, SemanticTool]:
    token = auth.access_token or ''
    tenant = auth.tenant_id

    async def search_locations(payload: dict[str, Any]) -> dict[str, Any]:
        items = await backend.list_locations(token, tenant)
        rows = search_rows(items, str(payload.get('query') or ''), 'name', 'code')
        return {'rows': [{k: row[k] for k in ('id', 'name', 'code') if k in row} for row in rows]}

    async def search_suppliers(payload: dict[str, Any]) -> dict[str, Any]:
        items = await backend.list_suppliers(token, tenant)
        rows = search_rows(items, str(payload.get('query') or ''), 'name', 'code')
        return {'rows': [{k: row[k] for k in ('id', 'name', 'code') if k in row} for row in rows]}

    async def search_customers(payload: dict[str, Any]) -> dict[str, Any]:
        items = await backend.list_customers(token, tenant)
        rows = search_rows(items, str(payload.get('query') or ''), 'name', 'email', 'code')
        return {'rows': [{k: row[k] for k in ('id', 'name', 'email', 'code') if k in row} for row in rows]}

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
        'master.search_suppliers': SemanticTool(
            name='master.search_suppliers',
            description='Search suppliers by name or code.',
            input_schema=object_schema({'query': {'type': 'string'}}, ['query']),
            risk_level='low',
            side_effect=False,
            output_mode='table',
            executor=search_suppliers,
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
    }
