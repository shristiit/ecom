from __future__ import annotations

import pytest

from conversational_engine.contracts.auth import AuthContext
from conversational_engine.tools.catalog import SemanticToolCatalog
from conversational_engine.tools.catalog.utils import ToolPreparationError

pytestmark = pytest.mark.anyio


class FakeBackendClient:
    def __init__(self) -> None:
        self.list_call_counts: dict[str, int] = {
            'locations': 0,
            'suppliers': 0,
            'customers': 0,
            'categories': 0,
        }
        self.location_payloads: list[dict[str, object]] = []
        self.location_updates: list[tuple[str, dict[str, object]]] = []
        self.deleted_locations: list[str] = []
        self.payloads: list[dict[str, object]] = []
        self.invoice_payloads: list[dict[str, object]] = []
        self.invoice_updates: list[tuple[str, dict[str, object]]] = []
        self.invoice_dispatch_payloads: list[tuple[str, dict[str, object]]] = []
        self.invoice_cancel_ids: list[str] = []
        self.po_payloads: list[dict[str, object]] = []
        self.po_updates: list[tuple[str, dict[str, object]]] = []
        self.po_receive_payloads: list[tuple[str, dict[str, object]]] = []
        self.po_close_ids: list[str] = []
        self.po_cancel_ids: list[str] = []
        self.po_list_params: list[dict[str, object] | None] = []
        self.invoice_list_params: list[dict[str, object] | None] = []
        self.receipt_payloads: list[dict[str, object]] = []
        self.write_off_payloads: list[dict[str, object]] = []
        self.supplier_payloads: list[dict[str, object]] = []
        self.supplier_updates: list[tuple[str, dict[str, object]]] = []
        self.deleted_suppliers: list[str] = []
        self.customer_payloads: list[dict[str, object]] = []
        self.customer_updates: list[tuple[str, dict[str, object]]] = []
        self.deleted_customers: list[str] = []
        self.locations = [
            {'id': 'loc-1', 'name': 'Main Warehouse', 'code': 'WH1'},
            {'id': 'loc-2', 'name': 'Outlet Store', 'code': 'OUT'},
        ]
        self.suppliers = [
            {'id': 'sup-1', 'name': 'Acme Supply', 'code': 'ACME'},
            {'id': 'sup-2', 'name': 'Beta Goods', 'code': 'BETA'},
        ]
        self.customers = [
            {'id': 'cust-1', 'name': 'Alice Jones', 'email': 'alice@example.com', 'code': 'ALICE'},
            {'id': 'cust-2', 'name': 'Bob Smith', 'email': 'bob@example.com', 'code': 'BOB'},
        ]
        self.categories = [
            {'id': 'cat-1', 'name': 'Shirts'},
            {'id': 'cat-2', 'name': 'Shoes'},
        ]
        self.products = [{'id': 'prod-1', 'name': 'Field Fresh Short'}]
        self.product_detail = {
            'product': {'id': 'prod-1', 'base_price': 42},
            'skus': [
                {'id': 'sku-sand', 'color_name': 'Sand', 'price_override': 50},
                {'id': 'sku-clay', 'color_name': 'Clay', 'price_override': None},
            ],
            'sizes': [
                {'id': 'size-sand-l', 'sku_id': 'sku-sand', 'size_label': 'L', 'price_override': 55},
                {'id': 'size-sand-m', 'sku_id': 'sku-sand', 'size_label': 'M', 'price_override': None},
                {'id': 'size-clay-l', 'sku_id': 'sku-clay', 'size_label': 'L', 'price_override': 44},
                {'id': 'size-clay-m', 'sku_id': 'sku-clay', 'size_label': 'M', 'price_override': None},
            ],
        }
        self.purchase_orders = [
            {'id': 'po-1', 'number': 'PO-0001', 'supplierName': 'Acme Supply'},
        ]
        self.purchase_order_detail = {
            'id': 'po-1',
            'number': 'PO-0001',
            'lines': [
                {'skuId': 'size-sand-l', 'qtyOrdered': 5, 'qtyReceived': 2, 'unitCost': 21},
                {'skuId': 'size-clay-m', 'qtyOrdered': 7, 'qtyReceived': 0, 'unitCost': 18},
            ],
        }
        self.invoices = [
            {'id': 'inv-1', 'number': 'SO-0001', 'customerName': 'Bob Smith'},
        ]
        self.invoice_detail = {
            'id': 'inv-1',
            'number': 'SO-0001',
            'lines': [
                {'id': 'inv-line-1', 'skuId': 'size-sand-l', 'qty': 5, 'unitPrice': 55},
                {'id': 'inv-line-2', 'skuId': 'size-sand-m', 'qty': 3, 'unitPrice': 50},
            ],
        }

    async def create_product(self, access_token: str, tenant_id: str | None, payload: dict[str, object]):
        del access_token, tenant_id
        self.payloads.append(payload)
        return {'ok': True, 'payload': payload}

    async def create_location(self, access_token: str, tenant_id: str | None, payload: dict[str, object]):
        del access_token, tenant_id
        self.location_payloads.append(payload)
        return {'ok': True, 'payload': payload}

    async def update_location(
        self, access_token: str, tenant_id: str | None, location_id: str, payload: dict[str, object]
    ):
        del access_token, tenant_id
        self.location_updates.append((location_id, payload))
        return {'ok': True, 'locationId': location_id, 'payload': payload}

    async def delete_location(self, access_token: str, tenant_id: str | None, location_id: str):
        del access_token, tenant_id
        self.deleted_locations.append(location_id)
        return {'ok': True}

    async def create_invoice(self, access_token: str, tenant_id: str | None, payload: dict[str, object]):
        del access_token, tenant_id
        self.invoice_payloads.append(payload)
        return {'ok': True, 'payload': payload}

    async def dispatch_invoice(
        self, access_token: str, tenant_id: str | None, invoice_id: str, payload: dict[str, object]
    ):
        del access_token, tenant_id
        self.invoice_dispatch_payloads.append((invoice_id, payload))
        return {'ok': True, 'invoiceId': invoice_id, 'payload': payload}

    async def update_invoice(
        self, access_token: str, tenant_id: str | None, invoice_id: str, payload: dict[str, object]
    ):
        del access_token, tenant_id
        self.invoice_updates.append((invoice_id, payload))
        return {'ok': True, 'invoiceId': invoice_id, 'payload': payload}

    async def cancel_invoice(self, access_token: str, tenant_id: str | None, invoice_id: str):
        del access_token, tenant_id
        self.invoice_cancel_ids.append(invoice_id)
        return {'ok': True, 'invoiceId': invoice_id}

    async def create_po(self, access_token: str, tenant_id: str | None, payload: dict[str, object]):
        del access_token, tenant_id
        self.po_payloads.append(payload)
        return {'ok': True, 'payload': payload}

    async def update_po(
        self, access_token: str, tenant_id: str | None, po_id: str, payload: dict[str, object]
    ):
        del access_token, tenant_id
        self.po_updates.append((po_id, payload))
        return {'ok': True, 'poId': po_id, 'payload': payload}

    async def receive_po(
        self, access_token: str, tenant_id: str | None, po_id: str, payload: dict[str, object]
    ):
        del access_token, tenant_id
        self.po_receive_payloads.append((po_id, payload))
        return {'ok': True, 'poId': po_id, 'payload': payload}

    async def close_po(self, access_token: str, tenant_id: str | None, po_id: str):
        del access_token, tenant_id
        self.po_close_ids.append(po_id)
        return {'ok': True, 'poId': po_id}

    async def cancel_po(self, access_token: str, tenant_id: str | None, po_id: str):
        del access_token, tenant_id
        self.po_cancel_ids.append(po_id)
        return {'ok': True, 'poId': po_id}

    async def receive_stock(self, access_token: str, tenant_id: str | None, payload: dict[str, object]):
        del access_token, tenant_id
        self.receipt_payloads.append(payload)
        return {'ok': True, 'payload': payload}

    async def write_off_stock(self, access_token: str, tenant_id: str | None, payload: dict[str, object]):
        del access_token, tenant_id
        self.write_off_payloads.append(payload)
        return {'ok': True, 'payload': payload}

    async def create_supplier(self, access_token: str, tenant_id: str | None, payload: dict[str, object]):
        del access_token, tenant_id
        self.supplier_payloads.append(payload)
        return {'ok': True, 'payload': payload}

    async def update_supplier(
        self, access_token: str, tenant_id: str | None, supplier_id: str, payload: dict[str, object]
    ):
        del access_token, tenant_id
        self.supplier_updates.append((supplier_id, payload))
        return {'ok': True, 'supplierId': supplier_id, 'payload': payload}

    async def delete_supplier(self, access_token: str, tenant_id: str | None, supplier_id: str):
        del access_token, tenant_id
        self.deleted_suppliers.append(supplier_id)
        return {'ok': True}

    async def create_customer(self, access_token: str, tenant_id: str | None, payload: dict[str, object]):
        del access_token, tenant_id
        self.customer_payloads.append(payload)
        return {'ok': True, 'payload': payload}

    async def update_customer(
        self, access_token: str, tenant_id: str | None, customer_id: str, payload: dict[str, object]
    ):
        del access_token, tenant_id
        self.customer_updates.append((customer_id, payload))
        return {'ok': True, 'customerId': customer_id, 'payload': payload}

    async def delete_customer(self, access_token: str, tenant_id: str | None, customer_id: str):
        del access_token, tenant_id
        self.deleted_customers.append(customer_id)
        return {'ok': True}

    async def list_locations(self, access_token: str, tenant_id: str | None):
        del access_token, tenant_id
        self.list_call_counts['locations'] += 1
        return self.locations

    async def list_suppliers(self, access_token: str, tenant_id: str | None):
        del access_token, tenant_id
        self.list_call_counts['suppliers'] += 1
        return self.suppliers

    async def list_customers(self, access_token: str, tenant_id: str | None):
        del access_token, tenant_id
        self.list_call_counts['customers'] += 1
        return self.customers

    async def list_categories(self, access_token: str, tenant_id: str | None):
        del access_token, tenant_id
        self.list_call_counts['categories'] += 1
        return self.categories

    async def search_products(self, access_token: str, tenant_id: str | None, q: str | None = None, **kwargs):
        del access_token, tenant_id, kwargs
        if not q:
            return self.products
        return [product for product in self.products if q.lower() in str(product['name']).lower()]

    async def get_product(self, access_token: str, tenant_id: str | None, product_id: str):
        del access_token, tenant_id
        assert product_id == 'prod-1'
        return self.product_detail

    async def list_pos(self, access_token: str, tenant_id: str | None, params: dict[str, object] | None = None):
        del access_token, tenant_id
        self.po_list_params.append(params)
        return {'items': self.purchase_orders}

    async def get_po(self, access_token: str, tenant_id: str | None, po_id: str):
        del access_token, tenant_id
        assert po_id == 'po-1'
        return self.purchase_order_detail

    async def list_invoices(self, access_token: str, tenant_id: str | None, params: dict[str, object] | None = None):
        del access_token, tenant_id
        self.invoice_list_params.append(params)
        return {'items': self.invoices}

    async def get_invoice(self, access_token: str, tenant_id: str | None, invoice_id: str):
        del access_token, tenant_id
        assert invoice_id == 'inv-1'
        return self.invoice_detail


class PaginatedProductBackendClient(FakeBackendClient):
    async def search_products(self, access_token: str, tenant_id: str | None, q: str | None = None, **kwargs):
        del access_token, tenant_id, kwargs
        if not q:
            return {'items': self.products, 'pagination': {'page': 1, 'pageSize': 50, 'total': len(self.products)}}
        items = [product for product in self.products if q.lower() in str(product['name']).lower()]
        return {'items': items, 'pagination': {'page': 1, 'pageSize': 50, 'total': len(items)}}


class AmbiguousReferenceBackendClient(FakeBackendClient):
    def __init__(self) -> None:
        super().__init__()
        self.suppliers = [
            {'id': 'sup-1', 'name': 'Acme Supply', 'code': 'ACME'},
            {'id': 'sup-3', 'name': 'Acme Source', 'code': 'ACMESRC'},
        ]
        self.customers = [
            {'id': 'cust-2', 'name': 'Bob Smith', 'email': 'bob@example.com', 'code': 'BOB'},
            {'id': 'cust-3', 'name': 'Bob Stone', 'email': 'bob.stone@example.com', 'code': 'BOBSTONE'},
        ]
        self.purchase_orders = [
            {'id': 'po-1', 'number': 'PO-0001', 'supplierName': 'Acme Supply'},
            {'id': 'po-2', 'number': 'PO-0002', 'supplierName': 'Acme Supply'},
        ]
        self.invoices = [
            {'id': 'inv-1', 'number': 'SO-0001', 'customerName': 'Bob Smith'},
            {'id': 'inv-2', 'number': 'SO-0002', 'customerName': 'Bob Smith'},
        ]


def make_auth() -> AuthContext:
    return AuthContext(
        id='user-1',
        tenant_id='tenant-1',
        role_id='role-1',
        email='ops@example.com',
        permissions=['chat.use'],
        access_token='token',
    )


async def test_product_tool_normalizes_flat_variant_payload_for_backend_compose():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'products.create_product',
        {
            'styleCode': 'SMAPLE-001',
            'name': 'sample shirt',
            'basePrice': 100,
            'variants': [{'color': 'blue', 'size': 'xl'}],
        },
    )

    assert result['result']['ok'] is True
    assert backend.payloads == [
        {
            'product': {
                'styleCode': 'SMAPLE-001',
                'name': 'sample shirt',
                'category': '',
                'brand': '',
                'basePrice': 100,
                'priceVisible': True,
                'inventoryMode': 'local',
                'maxBackorderQty': None,
                'pickupEnabled': False,
                'categoryId': None,
                'status': 'active',
            },
            'styleMedia': [],
            'variants': [
                {
                    'colorName': 'Blue',
                    'sizes': [{'sizeLabel': 'XL'}],
                }
            ],
        }
    ]


async def test_product_tool_preserves_backend_native_compose_payload():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]
    payload = {
        'product': {
            'styleCode': 'TEE-001',
            'name': 'Sample Tee',
            'category': '',
            'brand': '',
            'basePrice': 100,
            'priceVisible': True,
            'inventoryMode': 'local',
            'maxBackorderQty': None,
            'pickupEnabled': False,
            'categoryId': None,
            'status': 'active',
        },
        'styleMedia': [],
        'variants': [{'colorName': 'Blue', 'sizes': [{'sizeLabel': 'XL'}]}],
    }

    await catalog.invoke('products.create_product', payload)

    assert backend.payloads == [payload]


async def test_product_tool_normalizes_nested_approval_style_payload():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'products.create_product',
        {
            'product': {
                'styleCode': 'FFS-001',
                'name': 'Field Fresh Short',
                'category': 'Shirts',
                'categoryId': 'Shirts',
                'basePrice': 100,
                'status': 'active',
            },
            'styleMedia': [],
            'variants': [
                {
                    'colorName': 'Sand',
                    'sizes': [
                        {'size': 'm', 'locationId': 'loc-1', 'quantity': 5},
                        {'sizeLabel': 'L', 'stockByLocation': [{'locationId': 'loc-1', 'quantity': 5}]},
                    ],
                }
            ],
        },
    )

    assert result['result']['ok'] is True
    assert backend.payloads == [
        {
            'product': {
                'styleCode': 'FFS-001',
                'name': 'Field Fresh Short',
                'category': 'Shirts',
                'brand': '',
                'basePrice': 100,
                'priceVisible': True,
                'inventoryMode': 'local',
                'maxBackorderQty': None,
                'pickupEnabled': False,
                'categoryId': 'cat-1',
                'status': 'active',
            },
            'styleMedia': [],
            'variants': [
                {
                    'colorName': 'Sand',
                    'sizes': [
                        {'sizeLabel': 'M', 'stockByLocation': [{'locationId': 'loc-1', 'quantity': 5}]},
                        {'sizeLabel': 'L', 'stockByLocation': [{'locationId': 'loc-1', 'quantity': 5}]},
                    ],
                }
            ],
        }
    ]


async def test_purchase_order_create_normalizes_name_based_lines_for_backend():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'purchasing.create_po',
        {
            'supplierId': 'Acme Supply',
            'lines': [
                {
                    'productName': 'Field Fresh Short',
                    'colorName': 'Sand',
                    'sizeLabel': 'L',
                    'quantity': 5,
                    'unitCost': 21,
                },
                {
                    'productName': 'Field Fresh Short',
                    'colorName': 'Clay',
                    'sizeLabel': 'M',
                    'quantity': 7,
                    'unitCost': 18,
                },
            ],
        },
    )

    assert result['result']['ok'] is True
    assert backend.po_payloads == [
        {
            'supplierId': 'sup-1',
            'lines': [
                {'sizeId': 'size-sand-l', 'qty': 5, 'unitCost': 21},
                {'sizeId': 'size-clay-m', 'qty': 7, 'unitCost': 18},
            ],
        }
    ]


async def test_purchase_order_create_accepts_paginated_product_search_results():
    backend = PaginatedProductBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'purchasing.create_po',
        {
            'supplierId': 'Acme Supply',
            'lines': [
                {
                    'productName': 'Field Fresh Short',
                    'colorName': 'Sand',
                    'sizeLabel': 'L',
                    'quantity': 5,
                    'unitCost': 21,
                }
            ],
        },
    )

    assert result['result']['ok'] is True
    assert backend.po_payloads == [
        {
            'supplierId': 'sup-1',
            'lines': [{'sizeId': 'size-sand-l', 'qty': 5, 'unitCost': 21}],
        }
    ]


async def test_purchase_order_create_defaults_missing_unit_cost_from_product_base_price():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'purchasing.create_po',
        {
            'supplierId': 'Acme Supply',
            'lines': [
                {
                    'productName': 'Field Fresh Short',
                    'colorName': 'Sand',
                    'sizeLabel': 'L',
                    'quantity': 5,
                }
            ],
        },
    )

    assert result['result']['ok'] is True
    assert backend.po_payloads == [
        {
            'supplierId': 'sup-1',
            'lines': [{'sizeId': 'size-sand-l', 'qty': 5, 'unitCost': 42}],
        }
    ]


async def test_purchase_order_create_requests_variant_when_multiple_variants_exist():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    with pytest.raises(ToolPreparationError) as excinfo:
        await catalog.prepare(
            'purchasing.create_po',
            {
                'supplierId': 'Acme Supply',
                'lines': [
                    {
                        'productName': 'Field Fresh Short',
                        'quantity': 5,
                    }
                ],
            },
        )

    assert 'Which variant should I use?' in excinfo.value.prompt
    assert 'Sand / L' in excinfo.value.prompt
    assert 'Clay / M' in excinfo.value.prompt


async def test_purchase_order_create_requests_supplier_disambiguation_when_name_is_ambiguous():
    backend = AmbiguousReferenceBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    with pytest.raises(ToolPreparationError) as excinfo:
        await catalog.prepare(
            'purchasing.create_po',
            {
                'supplierId': 'Acme S',
                'lines': [
                    {
                        'productName': 'Field Fresh Short',
                        'colorName': 'Sand',
                        'sizeLabel': 'L',
                        'quantity': 5,
                        'unitCost': 21,
                    }
                ],
            },
        )

    assert 'multiple suppliers' in excinfo.value.prompt.lower()
    assert 'Acme Supply' in excinfo.value.prompt
    assert 'Acme Source' in excinfo.value.prompt


async def test_purchase_order_get_resolves_order_number():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke('purchasing.get_po', {'poId': 'PO-0001'})

    assert result['result']['id'] == 'po-1'


async def test_purchase_order_list_resolves_supplier_filter():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke('purchasing.list_pos', {'status': 'draft', 'supplierId': 'Acme Supply'})

    assert result['result']['items'] == backend.purchase_orders
    assert backend.po_list_params == [{'status': 'draft', 'supplierId': 'sup-1'}]


async def test_purchase_order_get_prefers_exact_number_when_other_rows_share_supplier_name():
    backend = AmbiguousReferenceBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke('purchasing.get_po', {'poId': 'PO-0001'})

    assert result['result']['id'] == 'po-1'


async def test_purchase_order_update_normalizes_header_patch_and_line_ops():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'purchasing.update_po',
        {
            'poId': 'PO-0001',
            'expectedDate': '2026-06-10T00:00:00Z',
            'lineOps': [
                {
                    'op': 'change_qty',
                    'lineRef': {'skuCode': 'sku-sand', 'sizeLabel': 'L'},
                    'qty': 12,
                },
                {
                    'op': 'add',
                    'values': {
                        'productName': 'Field Fresh Short',
                        'colorName': 'Clay',
                        'sizeLabel': 'M',
                        'quantity': 4,
                        'unitCost': 18,
                    },
                },
            ],
        },
    )

    assert result['result']['ok'] is True
    assert backend.po_updates == [
        (
            'po-1',
            {
                'headerPatch': {'expectedDate': '2026-06-10T00:00:00Z'},
                'lineOps': [
                    {
                        'op': 'change_qty',
                        'lineRef': {'skuCode': 'sku-sand', 'sizeLabel': 'L'},
                        'qty': 12,
                    },
                    {
                        'op': 'add',
                        'values': {'sizeId': 'size-clay-m', 'qty': 4, 'unitCost': 18},
                    },
                ],
            },
        )
    ]


async def test_purchase_order_update_resolves_line_number_refs():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'purchasing.update_po',
        {
            'poId': 'PO-0001',
            'lineOps': [
                {
                    'op': 'remove',
                    'lineRef': {'lineNumber': 2},
                },
            ],
        },
    )

    assert result['result']['ok'] is True
    assert backend.po_updates == [
        (
            'po-1',
            {
                'lineOps': [
                    {
                        'op': 'remove',
                        'lineRef': {'sizeId': 'size-clay-m'},
                    },
                ],
            },
        )
    ]


async def test_purchase_order_cancel_resolves_order_number():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke('purchasing.cancel_po', {'poId': 'PO-0001'})

    assert result['result']['poId'] == 'po-1'
    assert backend.po_cancel_ids == ['po-1']


async def test_sales_create_invoice_normalizes_name_based_lines_for_backend():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'sales.create_invoice',
        {
            'customerId': 'bob@example.com',
            'lines': [
                {'productName': 'Field Fresh Short', 'colorName': 'Sand', 'sizeLabel': 'L', 'quantity': 5},
                {'productName': 'Field Fresh Short', 'colorName': 'Sand', 'sizeLabel': 'M', 'quantity': 5},
                {'productName': 'Field Fresh Short', 'colorName': 'Clay', 'sizeLabel': 'L', 'quantity': 5},
                {'productName': 'Field Fresh Short', 'colorName': 'Clay', 'sizeLabel': 'M', 'quantity': 5},
            ],
        },
    )

    assert result['result']['ok'] is True
    assert backend.invoice_payloads == [
        {
            'customerId': 'cust-2',
            'lines': [
                {'sizeId': 'size-sand-l', 'qty': 5, 'unitPrice': 55},
                {'sizeId': 'size-sand-m', 'qty': 5, 'unitPrice': 50},
                {'sizeId': 'size-clay-l', 'qty': 5, 'unitPrice': 44},
                {'sizeId': 'size-clay-m', 'qty': 5, 'unitPrice': 42},
            ],
        }
    ]


async def test_sales_create_invoice_requires_color_and_size_when_product_is_ambiguous():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    with pytest.raises(ToolPreparationError, match='Which variant should I use'):
        await catalog.invoke(
            'sales.create_invoice',
            {
                'customerId': 'bob@example.com',
                'lines': [
                    {'productName': 'Field Fresh Short', 'quantity': 5},
                ],
            },
        )


async def test_sales_get_invoice_resolves_order_number():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke('sales.get_invoice', {'invoiceId': 'SO-0001'})

    assert result['result']['id'] == 'inv-1'


async def test_sales_cancel_invoice_requests_order_disambiguation_when_customer_matches_multiple_orders():
    backend = AmbiguousReferenceBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    with pytest.raises(ToolPreparationError) as excinfo:
        await catalog.prepare('sales.cancel_invoice', {'invoiceId': 'Bob Smith'})

    assert 'multiple sales orders' in excinfo.value.prompt.lower()
    assert 'SO-0001' in excinfo.value.prompt
    assert 'SO-0002' in excinfo.value.prompt


async def test_sales_list_invoices_resolves_customer_filter():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke('sales.list_invoices', {'status': 'draft', 'customerId': 'bob@example.com'})

    assert result['result']['items'] == backend.invoices
    assert backend.invoice_list_params == [{'status': 'draft', 'customerId': 'cust-2'}]


async def test_sales_update_invoice_normalizes_line_ops():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'sales.update_invoice',
        {
            'invoiceId': 'SO-0001',
            'lineOps': [
                {
                    'op': 'change_qty',
                    'lineRef': {'skuCode': 'sku-sand', 'sizeLabel': 'M'},
                    'qty': 15,
                },
                {
                    'op': 'change_price',
                    'lineRef': {'skuCode': 'sku-sand', 'sizeLabel': 'L'},
                    'unitPrice': 60,
                },
            ],
        },
    )

    assert result['result']['ok'] is True
    assert backend.invoice_updates == [
        (
            'inv-1',
            {
                'lineOps': [
                    {
                        'op': 'change_qty',
                        'lineRef': {'skuCode': 'sku-sand', 'sizeLabel': 'M'},
                        'qty': 15,
                    },
                    {
                        'op': 'change_price',
                        'lineRef': {'skuCode': 'sku-sand', 'sizeLabel': 'L'},
                        'unitPrice': 60,
                    },
                ]
            },
        )
    ]


async def test_sales_update_invoice_resolves_line_number_refs():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'sales.update_invoice',
        {
            'invoiceId': 'SO-0001',
            'lineOps': [
                {
                    'op': 'change_qty',
                    'lineRef': {'lineNumber': 2},
                    'qty': 9,
                },
            ],
        },
    )

    assert result['result']['ok'] is True
    assert backend.invoice_updates == [
        (
            'inv-1',
            {
                'lineOps': [
                    {
                        'op': 'change_qty',
                        'lineRef': {'lineId': 'inv-line-2'},
                        'qty': 9,
                    },
                ]
            },
        )
    ]


async def test_products_get_product_variants_lists_color_size_rows():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke('products.get_product_variants', {'product': 'Field Fresh Short'})

    assert result['rows'] == [
        {'sizeId': 'size-sand-l', 'skuId': 'sku-sand', 'colorName': 'Sand', 'sizeLabel': 'L'},
        {'sizeId': 'size-sand-m', 'skuId': 'sku-sand', 'colorName': 'Sand', 'sizeLabel': 'M'},
        {'sizeId': 'size-clay-l', 'skuId': 'sku-clay', 'colorName': 'Clay', 'sizeLabel': 'L'},
        {'sizeId': 'size-clay-m', 'skuId': 'sku-clay', 'colorName': 'Clay', 'sizeLabel': 'M'},
    ]


async def test_entity_resolver_caches_repeated_customer_and_location_lookups():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    await catalog.prepare(
        'sales.dispatch_invoice',
        {
            'invoiceId': 'SO-0001',
            'locationId': 'Main Warehouse',
        },
    )
    await catalog.prepare(
        'master.delete_customer',
        {
            'customerId': 'bob@example.com',
        },
    )
    await catalog.prepare(
        'master.update_customer',
        {
            'customerId': 'bob@example.com',
            'patch': {'phone': '12345'},
        },
    )

    assert backend.list_call_counts['locations'] == 1
    assert backend.list_call_counts['customers'] == 1


async def test_inventory_receive_stock_expands_all_sizes_for_a_color():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'inventory.receive_stock',
        {
            'locationId': 'Main Warehouse',
            'productName': 'Field Fresh Short',
            'colorName': 'Sand',
            'allSizes': True,
            'quantity': 100,
        },
    )

    assert result['result']['lineCount'] == 2
    assert backend.receipt_payloads == [
        {'locationId': 'loc-1', 'sizeId': 'size-sand-l', 'quantity': 100, 'reason': '', 'confirm': True},
        {'locationId': 'loc-1', 'sizeId': 'size-sand-m', 'quantity': 100, 'reason': '', 'confirm': True},
    ]


async def test_inventory_write_off_resolves_natural_references_and_confirms():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'inventory.write_off_stock',
        {
            'locationId': 'Main Warehouse',
            'productName': 'Field Fresh Short',
            'colorName': 'Sand',
            'sizeLabel': 'L',
            'quantity': 3,
            'reason': 'Damaged',
        },
    )

    assert result['result']['ok'] is True
    assert backend.write_off_payloads == [
        {
            'locationId': 'loc-1',
            'sizeId': 'size-sand-l',
            'quantity': 3,
            'reason': 'Damaged',
            'confirm': True,
        }
    ]


async def test_purchase_order_receive_defaults_to_remaining_lines():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'purchasing.receive_po',
        {
            'poId': 'PO-0001',
            'locationId': 'Main Warehouse',
        },
    )

    assert result['result']['ok'] is True
    assert backend.po_receive_payloads == [
        (
            'po-1',
            {
                'locationId': 'loc-1',
                'lines': [
                    {'sizeId': 'size-sand-l', 'qty': 3, 'unitCost': 21},
                    {'sizeId': 'size-clay-m', 'qty': 7, 'unitCost': 18},
                ],
                'confirm': True,
            },
        )
    ]


async def test_sales_dispatch_resolves_order_and_location():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'sales.dispatch_invoice',
        {
            'invoiceId': 'SO-0001',
            'locationId': 'Outlet Store',
        },
    )

    assert result['result']['ok'] is True
    assert backend.invoice_dispatch_payloads == [
        (
            'inv-1',
            {
                'locationId': 'loc-2',
                'confirm': True,
            },
        )
    ]


async def test_master_create_supplier_requires_name_and_keeps_optional_fields():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'master.create_supplier',
        {'name': 'Acme Supply', 'email': 'ops@acme.example', 'phone': '555-0101'},
    )

    assert result['result']['ok'] is True
    assert backend.supplier_payloads == [{'name': 'Acme Supply', 'email': 'ops@acme.example', 'phone': '555-0101'}]


async def test_master_create_supplier_normalizes_markdown_mailto_email():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'master.create_supplier',
        {'name': 'Raghu', 'email': '[raghu@bez.com](mailto:raghu@bez.com)'},
    )

    assert result['result']['ok'] is True
    assert backend.supplier_payloads == [{'name': 'Raghu', 'email': 'raghu@bez.com'}]


async def test_master_create_location_requires_core_fields_and_keeps_optional_fields():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'master.create_location',
        {'name': 'London DC', 'code': 'LON-DC', 'type': 'warehouse', 'address': 'London'},
    )

    assert result['result']['ok'] is True
    assert backend.location_payloads == [
        {'name': 'London DC', 'code': 'LON-DC', 'type': 'warehouse', 'address': 'London'}
    ]


async def test_master_create_customer_accepts_optional_fields():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'master.create_customer',
        {'name': 'Helen Barrows', 'email': 'helen41@yahoo.com', 'address': 'London'},
    )

    assert result['result']['ok'] is True
    assert backend.customer_payloads == [{'name': 'Helen Barrows', 'email': 'helen41@yahoo.com', 'address': 'London'}]


async def test_master_create_customer_normalizes_markdown_mailto_email():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'master.create_customer',
        {'name': 'Helen Barrows', 'email': '[helen41@yahoo.com](mailto:helen41@yahoo.com)'},
    )

    assert result['result']['ok'] is True
    assert backend.customer_payloads == [{'name': 'Helen Barrows', 'email': 'helen41@yahoo.com'}]


async def test_master_update_supplier_resolves_name_and_accepts_partial_patch():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'master.update_supplier',
        {'supplierId': 'Acme Supply', 'patch': {'phone': '555-0101'}},
    )

    assert result['result']['ok'] is True
    assert backend.supplier_updates == [('sup-1', {'phone': '555-0101'})]


async def test_master_update_location_resolves_name_and_accepts_partial_patch():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'master.update_location',
        {'locationId': 'Main Warehouse', 'patch': {'status': 'inactive'}},
    )

    assert result['result']['ok'] is True
    assert backend.location_updates == [('loc-1', {'status': 'inactive'})]


async def test_master_update_customer_resolves_email_and_accepts_partial_patch():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'master.update_customer',
        {'customerId': 'bob@example.com', 'patch': {'phone': '555-0202'}},
    )

    assert result['result']['ok'] is True
    assert backend.customer_updates == [('cust-2', {'phone': '555-0202'})]


async def test_master_delete_supplier_resolves_by_name():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke('master.delete_supplier', {'supplierId': 'Acme Supply'})

    assert result['result']['ok'] is True
    assert backend.deleted_suppliers == ['sup-1']


async def test_master_delete_location_resolves_code():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke('master.delete_location', {'locationId': 'OUT'})

    assert result['result']['ok'] is True
    assert backend.deleted_locations == ['loc-2']


async def test_master_delete_customer_accepts_uuid():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'master.delete_customer',
        {'customerId': '123e4567-e89b-42d3-a456-426614174000'},
    )

    assert result['result']['ok'] is True
    assert backend.deleted_customers == ['123e4567-e89b-42d3-a456-426614174000']


@pytest.mark.parametrize(
    ('tool_name', 'payload', 'message'),
    [
        (
            'master.create_location',
            {'code': 'LON-DC', 'type': 'warehouse'},
            'Please provide the location name. Optional: address and status.',
        ),
        ('master.create_supplier', {'email': 'ops@acme.example'}, 'What supplier name should I create?'),
        ('master.create_customer', {'email': 'helen41@yahoo.com'}, 'What customer name should I create?'),
        ('master.update_location', {'locationId': 'Main Warehouse'}, 'What location details should I change?'),
        ('master.update_supplier', {'supplierId': 'Acme Supply'}, 'What supplier details should I change?'),
        ('master.update_customer', {'customerId': 'bob@example.com'}, 'What customer details should I change?'),
        ('master.delete_location', {}, 'Which location should I delete?'),
        ('master.delete_supplier', {}, 'Which supplier should I delete?'),
        ('master.delete_customer', {}, 'Which customer should I delete?'),
    ],
)
async def test_master_write_tools_reject_missing_required_fields(
    tool_name: str,
    payload: dict[str, object],
    message: str,
):
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    with pytest.raises(ToolPreparationError, match=message):
        await catalog.invoke(tool_name, payload)


@pytest.mark.parametrize(
    ('tool_name', 'query', 'expected'),
    [
        ('master.search_locations', 'warehouse', [{'id': 'loc-1', 'name': 'Main Warehouse', 'code': 'WH1'}]),
        ('master.search_suppliers', 'acme', [{'id': 'sup-1', 'name': 'Acme Supply', 'code': 'ACME'}]),
        (
            'master.search_customers',
            'bob@example.com',
            [{'id': 'cust-2', 'name': 'Bob Smith', 'email': 'bob@example.com', 'code': 'BOB'}],
        ),
        ('master.search_categories', 'shoe', [{'id': 'cat-2', 'name': 'Shoes'}]),
    ],
)
async def test_master_search_tools_return_filtered_rows(tool_name: str, query: str, expected: list[dict[str, object]]):
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(tool_name, {'query': query})

    assert result == {'rows': expected}


async def test_catalog_resolves_same_supplier_from_context_for_po_create():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(
        backend=backend,
        auth=make_auth(),
        context_entities={'supplierId': 'sup-1', 'supplierName': 'Acme Supply'},
    )  # type: ignore[arg-type]

    prepared = await catalog.prepare(
        'purchasing.create_po',
        {
            'supplierId': 'same supplier',
            'lines': [{'productName': 'Field Fresh Short', 'colorName': 'Sand', 'sizeLabel': 'M', 'qty': 2}],
        },
    )

    assert prepared['supplierId'] == 'sup-1'


async def test_catalog_resolves_last_po_from_latest_list_item():
    backend = FakeBackendClient()
    backend.purchase_orders = [
        {'id': 'po-9', 'number': 'PO-0009', 'supplierName': 'Beta Goods'},
        {'id': 'po-1', 'number': 'PO-0001', 'supplierName': 'Acme Supply'},
    ]
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    prepared = await catalog.prepare(
        'purchasing.update_po',
        {'poId': 'my last PO', 'expectedDate': '2026-05-30'},
    )

    assert prepared['poId'] == 'po-9'
    assert prepared['headerPatch'] == {'expectedDate': '2026-05-30'}


async def test_catalog_resolves_that_sales_order_from_context():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(
        backend=backend,
        auth=make_auth(),
        context_entities={'invoiceId': 'inv-1', 'invoiceNumber': 'SO-0001'},
    )  # type: ignore[arg-type]

    prepared = await catalog.prepare(
        'sales.dispatch_invoice',
        {'invoiceId': 'that sales order', 'locationId': 'WH1'},
    )

    assert prepared['invoiceId'] == 'inv-1'
    assert prepared['locationId'] == 'loc-1'


async def test_catalog_relative_reference_requires_context_when_missing():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    with pytest.raises(
        ToolPreparationError,
        match='I do not have an active reference for "this sales order". Please specify the exact record.',
    ):
        await catalog.prepare(
            'sales.dispatch_invoice',
            {'invoiceId': 'that sales order', 'locationId': 'WH1'},
        )


async def test_catalog_resolves_last_po_for_supplier_from_latest_matching_item():
    backend = FakeBackendClient()
    backend.purchase_orders = [
        {'id': 'po-9', 'number': 'PO-0009', 'supplierName': 'Beta Goods'},
        {'id': 'po-7', 'number': 'PO-0007', 'supplierName': 'Acme Supply'},
        {'id': 'po-1', 'number': 'PO-0001', 'supplierName': 'Acme Supply'},
    ]
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    prepared = await catalog.prepare(
        'purchasing.cancel_po',
        {'poId': 'last PO for Acme Supply'},
    )

    assert prepared['poId'] == 'po-7'


async def test_catalog_resolves_last_sales_order_for_customer_from_latest_matching_item():
    backend = FakeBackendClient()
    backend.invoices = [
        {'id': 'inv-9', 'number': 'SO-0009', 'customerName': 'Alice Jones'},
        {'id': 'inv-7', 'number': 'SO-0007', 'customerName': 'Bob Smith'},
        {'id': 'inv-1', 'number': 'SO-0001', 'customerName': 'Bob Smith'},
    ]
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    prepared = await catalog.prepare(
        'sales.cancel_invoice',
        {'invoiceId': 'last sales order for Bob Smith'},
    )

    assert prepared['invoiceId'] == 'inv-7'


async def test_catalog_scoped_latest_reference_is_ambiguous_for_partial_party_match():
    backend = FakeBackendClient()
    backend.invoices = [
        {'id': 'inv-7', 'number': 'SO-0007', 'customerName': 'Bob Smith'},
        {'id': 'inv-6', 'number': 'SO-0006', 'customerName': 'Bob Stone'},
    ]
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    with pytest.raises(
        ToolPreparationError,
        match='I found multiple sales orders matching "Bob". Which sales order should I use\\?',
    ):
        await catalog.prepare(
            'sales.cancel_invoice',
            {'invoiceId': 'last sales order for Bob'},
        )
