from __future__ import annotations

import pytest

from conversational_engine.contracts.auth import AuthContext
from conversational_engine.tools.catalog import SemanticToolCatalog

pytestmark = pytest.mark.anyio


class FakeBackendClient:
    def __init__(self) -> None:
        self.payloads: list[dict[str, object]] = []

    async def create_product(self, access_token: str, tenant_id: str | None, payload: dict[str, object]):
        del access_token, tenant_id
        self.payloads.append(payload)
        return {'ok': True, 'payload': payload}


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
