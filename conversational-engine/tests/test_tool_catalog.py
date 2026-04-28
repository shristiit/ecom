from __future__ import annotations

import pytest

from conversational_engine.contracts.auth import AuthContext
from conversational_engine.tools.catalog import SemanticToolCatalog
from conversational_engine.tools.catalog.utils import ToolPreparationError

pytestmark = pytest.mark.anyio


class FakeBackendClient:
    def __init__(self) -> None:
        self.payloads: list[dict[str, object]] = []
        self.invoice_payloads: list[dict[str, object]] = []
        self.po_payloads: list[dict[str, object]] = []
        self.receipt_payloads: list[dict[str, object]] = []
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

    async def create_product(self, access_token: str, tenant_id: str | None, payload: dict[str, object]):
        del access_token, tenant_id
        self.payloads.append(payload)
        return {'ok': True, 'payload': payload}

    async def create_invoice(self, access_token: str, tenant_id: str | None, payload: dict[str, object]):
        del access_token, tenant_id
        self.invoice_payloads.append(payload)
        return {'ok': True, 'payload': payload}

    async def create_po(self, access_token: str, tenant_id: str | None, payload: dict[str, object]):
        del access_token, tenant_id
        self.po_payloads.append(payload)
        return {'ok': True, 'payload': payload}

    async def receive_stock(self, access_token: str, tenant_id: str | None, payload: dict[str, object]):
        del access_token, tenant_id
        self.receipt_payloads.append(payload)
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
        return self.locations

    async def list_suppliers(self, access_token: str, tenant_id: str | None):
        del access_token, tenant_id
        return self.suppliers

    async def list_customers(self, access_token: str, tenant_id: str | None):
        del access_token, tenant_id
        return self.customers

    async def list_categories(self, access_token: str, tenant_id: str | None):
        del access_token, tenant_id
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

    with pytest.raises(ToolPreparationError, match='Color is required'):
        await catalog.invoke(
            'sales.create_invoice',
            {
                'customerId': 'bob@example.com',
                'lines': [
                    {'productName': 'Field Fresh Short', 'quantity': 5},
                ],
            },
        )


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
        {'locationId': 'loc-1', 'sizeId': 'size-sand-l', 'quantity': 100, 'reason': ''},
        {'locationId': 'loc-1', 'sizeId': 'size-sand-m', 'quantity': 100, 'reason': ''},
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


async def test_master_create_customer_accepts_optional_fields():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'master.create_customer',
        {'name': 'Helen Barrows', 'email': 'helen41@yahoo.com', 'address': 'London'},
    )

    assert result['result']['ok'] is True
    assert backend.customer_payloads == [{'name': 'Helen Barrows', 'email': 'helen41@yahoo.com', 'address': 'London'}]


async def test_master_update_supplier_resolves_name_and_accepts_partial_patch():
    backend = FakeBackendClient()
    catalog = SemanticToolCatalog(backend=backend, auth=make_auth())  # type: ignore[arg-type]

    result = await catalog.invoke(
        'master.update_supplier',
        {'supplierId': 'Acme Supply', 'patch': {'phone': '555-0101'}},
    )

    assert result['result']['ok'] is True
    assert backend.supplier_updates == [('sup-1', {'phone': '555-0101'})]


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
        ('master.create_supplier', {'email': 'ops@acme.example'}, 'What supplier name should I create?'),
        ('master.create_customer', {'email': 'helen41@yahoo.com'}, 'What customer name should I create?'),
        ('master.update_supplier', {'supplierId': 'Acme Supply'}, 'What supplier details should I change?'),
        ('master.update_customer', {'customerId': 'bob@example.com'}, 'What customer details should I change?'),
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
