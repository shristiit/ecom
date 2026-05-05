from __future__ import annotations

import httpx
import pytest

from conversational_engine.clients.backend import BackendClient

pytestmark = pytest.mark.anyio


async def test_backend_client_retries_transient_get_failures() -> None:
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise httpx.ConnectError('temporary outage', request=request)
        return httpx.Response(200, json=[{'id': 'loc-1'}])

    client = BackendClient('http://backend.test', retry_attempts=3)
    original_client = client._client
    client._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    await original_client.aclose()
    try:
        payload = await client.list_locations('token', 'tenant-1')
    finally:
        await client.aclose()

    assert attempts == 3
    assert payload == [{'id': 'loc-1'}]


async def test_backend_client_retries_mutations_with_stable_idempotency_key() -> None:
    seen_keys: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen_keys.append(request.headers['Idempotency-Key'])
        if len(seen_keys) == 1:
            return httpx.Response(503, json={'message': 'unavailable'})
        return httpx.Response(200, json={'id': 'customer-1'})

    client = BackendClient('http://backend.test', retry_attempts=2)
    original_client = client._client
    client._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    await original_client.aclose()
    try:
        payload = await client.create_customer('token', 'tenant-1', {'name': 'Acme'})
    finally:
        await client.aclose()

    assert payload == {'id': 'customer-1'}
    assert len(seen_keys) == 2
    assert seen_keys[0] == seen_keys[1]
