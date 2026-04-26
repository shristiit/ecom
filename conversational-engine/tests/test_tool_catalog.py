from __future__ import annotations

import pytest

from conversational_engine.contracts.auth import AuthContext
from conversational_engine.tools.catalog import SemanticToolCatalog

pytestmark = pytest.mark.anyio


class FakeBackendClient:
    def __init__(self) -> None:
        self.payloads: list[dict[str, object]] = []
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

    async def create_product(self, access_token: str, tenant_id: str | None, payload: dict[str, object]):
        del access_token, tenant_id
        self.payloads.append(payload)
        return {'ok': True, 'payload': payload}

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
            'status': 'active',
        },
        'styleMedia': [],
        'variants': [{'colorName': 'Blue', 'sizes': [{'sizeLabel': 'XL'}]}],
    }

    await catalog.invoke('products.create_product', payload)

    assert backend.payloads == [payload]


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
