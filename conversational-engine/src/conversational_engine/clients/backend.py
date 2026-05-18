from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from hashlib import sha256
import json
import random

import anyio
import httpx

from conversational_engine.contracts.api import (
    ApprovalDecisionResponse,
    ApprovalItem,
    ApprovalRequestStatus,
    GovernanceEvaluationResponse,
    HistoryItem,
)
from conversational_engine.contracts.auth import AuthContext

_IDEMPOTENCY_KEY: ContextVar[str | None] = ContextVar('backend_idempotency_key', default=None)


class BackendRequestError(RuntimeError):
    def __init__(
        self,
        *,
        status_code: int,
        message: str,
        details: list[str] | None = None,
        body: object | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.details = details or []
        self.body = body

    @property
    def user_message(self) -> str:
        if self.details:
            return '; '.join(self.details)
        return self.message


class BackendValidationError(BackendRequestError):
    pass


@contextmanager
def idempotency_scope(key: str):
    token = _IDEMPOTENCY_KEY.set(key)
    try:
        yield
    finally:
        _IDEMPOTENCY_KEY.reset(token)


class BackendClient:
    def __init__(
        self,
        base_url: str,
        *,
        max_connections: int = 20,
        max_keepalive_connections: int = 10,
        retry_attempts: int = 3,
    ) -> None:
        self._base_url = base_url.rstrip('/')
        self._retry_attempts = max(1, retry_attempts)
        self._client = httpx.AsyncClient(
            timeout=20.0,
            limits=httpx.Limits(
                max_connections=max_connections,
                max_keepalive_connections=max_keepalive_connections,
            ),
        )

    def _headers(self, access_token: str, tenant_id: str | None) -> dict[str, str]:
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Accept': 'application/json',
        }
        if tenant_id:
            headers['x-tenant-id'] = tenant_id
        return headers

    async def _request(
        self,
        method: str,
        path: str,
        access_token: str,
        tenant_id: str | None,
        *,
        json: dict[str, object] | None = None,
        params: dict[str, object] | None = None,
    ) -> object:
        normalized_method = method.upper()
        headers = self._headers(access_token, tenant_id)
        if normalized_method in {'POST', 'PATCH', 'PUT', 'DELETE'}:
            headers['Idempotency-Key'] = self._idempotency_key(
                method=normalized_method,
                path=path,
                tenant_id=tenant_id,
                json_payload=json,
                params=params,
            )
        response = await self._request_with_retry(
            normalized_method,
            path,
            headers=headers,
            json=json,
            params=params,
        )
        if response.is_success:
            if not response.content:
                return {}
            return response.json()
        raise self._error_from_response(response)

    async def aclose(self) -> None:
        await self._client.aclose()

    def _idempotency_key(
        self,
        *,
        method: str,
        path: str,
        tenant_id: str | None,
        json_payload: dict[str, object] | None,
        params: dict[str, object] | None,
    ) -> str:
        scoped = _IDEMPOTENCY_KEY.get()
        if scoped:
            return scoped
        fingerprint = json.dumps(
            {
                'method': method,
                'path': path,
                'tenantId': tenant_id,
                'json': json_payload or {},
                'params': params or {},
            },
            sort_keys=True,
            separators=(',', ':'),
        )
        return f'auto:{sha256(fingerprint.encode("utf-8")).hexdigest()}'

    def _error_from_response(self, response: httpx.Response) -> BackendRequestError:
        body: object | None
        try:
            body = response.json()
        except ValueError:
            body = response.text.strip() or None

        details = self._extract_error_details(body)
        message = details[0] if details else f'Backend request failed with status {response.status_code}'
        if response.status_code in {400, 409, 422}:
            return BackendValidationError(
                status_code=response.status_code,
                message=message,
                details=details,
                body=body,
            )
        return BackendRequestError(
            status_code=response.status_code,
            message=message,
            details=details,
            body=body,
        )

    def _extract_error_details(self, body: object | None) -> list[str]:
        if isinstance(body, dict):
            message = body.get('message')
            if isinstance(message, str) and message.strip():
                details = [message.strip()]
            else:
                details = []

            for key in ('errors', 'issues', 'details'):
                raw = body.get(key)
                if isinstance(raw, list):
                    details.extend(self._flatten_error_items(raw))
                elif isinstance(raw, dict):
                    details.extend(self._flatten_error_items([raw]))

            return list(dict.fromkeys(detail for detail in details if detail))

        if isinstance(body, str) and body:
            return [body]

        return []

    def _flatten_error_items(self, items: list[object]) -> list[str]:
        flattened: list[str] = []
        for item in items:
            if isinstance(item, str) and item.strip():
                flattened.append(item.strip())
                continue
            if not isinstance(item, dict):
                continue
            path = item.get('path')
            message = item.get('message')
            if isinstance(path, list):
                rendered_path = '.'.join(str(part) for part in path if str(part))
            elif isinstance(path, str):
                rendered_path = path
            else:
                rendered_path = ''
            if isinstance(message, str) and message.strip():
                flattened.append(f'{rendered_path}: {message}'.strip(': '))
        return flattened

    async def _request_with_retry(
        self,
        method: str,
        path: str,
        *,
        headers: dict[str, str],
        json: dict[str, object] | None,
        params: dict[str, object] | None,
    ) -> httpx.Response:
        can_retry = method in {'GET', 'HEAD'} or bool(headers.get('Idempotency-Key'))
        last_exc: Exception | None = None

        for attempt in range(1, self._retry_attempts + 1):
            try:
                response = await self._client.request(
                    method,
                    f'{self._base_url}{path}',
                    headers=headers,
                    json=json,
                    params=params,
                )
            except httpx.TransportError as exc:
                last_exc = exc
                if not can_retry or attempt >= self._retry_attempts:
                    raise RuntimeError(f'Backend transport failed: {exc}') from exc
                await self._sleep_before_retry(attempt)
                continue

            if response.status_code < 500 or not can_retry or attempt >= self._retry_attempts:
                return response

            await self._sleep_before_retry(attempt)

        if last_exc is not None:
            raise RuntimeError(f'Backend transport failed: {last_exc}') from last_exc
        raise RuntimeError('Backend request failed after retries.')

    async def _sleep_before_retry(self, attempt: int) -> None:
        base_delay = min(1.5, 0.15 * (2 ** (attempt - 1)))
        await anyio.sleep(base_delay + random.uniform(0.0, 0.1))

    async def resolve_auth_context(self, access_token: str, tenant_id: str | None) -> AuthContext:
        payload = await self._request('GET', '/auth/me', access_token, tenant_id)
        return AuthContext.model_validate(payload)

    async def list_locations(self, access_token: str, tenant_id: str) -> list[dict[str, object]]:
        return await self._request('GET', '/master/locations', access_token, tenant_id)

    async def create_location(self, access_token: str, tenant_id: str, payload: dict[str, object]) -> dict[str, object]:
        return await self._request('POST', '/master/locations', access_token, tenant_id, json=payload)

    async def update_location(
        self,
        access_token: str,
        tenant_id: str,
        location_id: str,
        payload: dict[str, object],
    ) -> dict[str, object]:
        return await self._request('PATCH', f'/master/locations/{location_id}', access_token, tenant_id, json=payload)

    async def delete_location(self, access_token: str, tenant_id: str, location_id: str) -> dict[str, object]:
        return await self._request('DELETE', f'/master/locations/{location_id}', access_token, tenant_id, json={})

    async def list_suppliers(self, access_token: str, tenant_id: str) -> list[dict[str, object]]:
        return await self._request('GET', '/master/suppliers', access_token, tenant_id)

    async def create_supplier(self, access_token: str, tenant_id: str, payload: dict[str, object]) -> dict[str, object]:
        return await self._request('POST', '/master/suppliers', access_token, tenant_id, json=payload)

    async def update_supplier(
        self,
        access_token: str,
        tenant_id: str,
        supplier_id: str,
        payload: dict[str, object],
    ) -> dict[str, object]:
        return await self._request('PATCH', f'/master/suppliers/{supplier_id}', access_token, tenant_id, json=payload)

    async def delete_supplier(self, access_token: str, tenant_id: str, supplier_id: str) -> dict[str, object]:
        return await self._request('DELETE', f'/master/suppliers/{supplier_id}', access_token, tenant_id, json={})

    async def list_customers(self, access_token: str, tenant_id: str) -> list[dict[str, object]]:
        return await self._request('GET', '/master/customers', access_token, tenant_id)

    async def create_customer(self, access_token: str, tenant_id: str, payload: dict[str, object]) -> dict[str, object]:
        return await self._request('POST', '/master/customers', access_token, tenant_id, json=payload)

    async def update_customer(
        self,
        access_token: str,
        tenant_id: str,
        customer_id: str,
        payload: dict[str, object],
    ) -> dict[str, object]:
        return await self._request('PATCH', f'/master/customers/{customer_id}', access_token, tenant_id, json=payload)

    async def delete_customer(self, access_token: str, tenant_id: str, customer_id: str) -> dict[str, object]:
        return await self._request('DELETE', f'/master/customers/{customer_id}', access_token, tenant_id, json={})

    async def list_categories(self, access_token: str, tenant_id: str) -> list[dict[str, object]]:
        return await self._request('GET', '/master/categories', access_token, tenant_id)

    async def list_products(self, access_token: str, tenant_id: str) -> list[dict[str, object]]:
        payload = await self._request('GET', '/products', access_token, tenant_id)
        return self._product_items(payload)

    async def search_products(
        self,
        access_token: str,
        tenant_id: str,
        q: str | None = None,
        color: str | None = None,
        category: str | None = None,
        brand: str | None = None,
    ) -> list[dict[str, object]]:
        params = {k: v for k, v in {'q': q, 'color': color, 'category': category, 'brand': brand}.items() if v}
        payload = await self._request('GET', '/products', access_token, tenant_id, params=params or None)
        return self._product_items(payload)

    async def get_product(self, access_token: str, tenant_id: str, product_id: str) -> dict[str, object]:
        payload = await self._request('GET', f'/products/{product_id}', access_token, tenant_id)
        return payload

    @staticmethod
    def _product_items(payload: object) -> list[dict[str, object]]:
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        if isinstance(payload, dict):
            items = payload.get('items')
            if isinstance(items, list):
                return [item for item in items if isinstance(item, dict)]
        return []

    async def create_product(self, access_token: str, tenant_id: str, payload: dict[str, object]) -> dict[str, object]:
        return await self._request('POST', '/products/compose', access_token, tenant_id, json=payload)

    async def update_product(
        self, access_token: str, tenant_id: str, product_id: str, payload: dict[str, object]
    ) -> dict[str, object]:
        return await self._request('PATCH', f'/products/{product_id}', access_token, tenant_id, json=payload)

    async def search_skus(self, access_token: str, tenant_id: str, query: str) -> list[dict[str, object]]:
        return await self._request('GET', '/products/skus/search', access_token, tenant_id, params={'q': query})

    async def create_sku(
        self, access_token: str, tenant_id: str, product_id: str, payload: dict[str, object]
    ) -> dict[str, object]:
        return await self._request('POST', f'/products/{product_id}/skus', access_token, tenant_id, json=payload)

    async def update_sku(
        self, access_token: str, tenant_id: str, sku_id: str, payload: dict[str, object]
    ) -> dict[str, object]:
        return await self._request('PATCH', f'/products/skus/{sku_id}', access_token, tenant_id, json=payload)

    async def create_sku_size(
        self, access_token: str, tenant_id: str, sku_id: str, payload: dict[str, object]
    ) -> dict[str, object]:
        return await self._request('POST', f'/products/skus/{sku_id}/sizes', access_token, tenant_id, json=payload)

    async def update_sku_size(
        self, access_token: str, tenant_id: str, size_id: str, payload: dict[str, object]
    ) -> dict[str, object]:
        return await self._request('PATCH', f'/products/sizes/{size_id}', access_token, tenant_id, json=payload)

    async def upsert_product_location(
        self,
        access_token: str,
        tenant_id: str,
        product_id: str,
        payload: dict[str, object],
    ) -> dict[str, object]:
        return await self._request('POST', f'/products/{product_id}/locations', access_token, tenant_id, json=payload)

    async def stock_on_hand(
        self,
        access_token: str,
        tenant_id: str,
        params: dict[str, object],
    ) -> object:
        return await self._request('GET', '/inventory/stock-on-hand', access_token, tenant_id, params=params)

    async def movements(self, access_token: str, tenant_id: str, params: dict[str, object]) -> list[dict[str, object]]:
        return await self._request('GET', '/inventory/movements', access_token, tenant_id, params=params)

    async def list_receipts(self, access_token: str, tenant_id: str) -> list[dict[str, object]]:
        return await self._request('GET', '/inventory/receipts', access_token, tenant_id)

    async def receive_stock(self, access_token: str, tenant_id: str, payload: dict[str, object]) -> dict[str, object]:
        return await self._request('POST', '/inventory/receive', access_token, tenant_id, json=payload)

    async def adjust_stock(self, access_token: str, tenant_id: str, payload: dict[str, object]) -> dict[str, object]:
        return await self._request('POST', '/inventory/adjust', access_token, tenant_id, json=payload)

    async def transfer_stock(self, access_token: str, tenant_id: str, payload: dict[str, object]) -> dict[str, object]:
        return await self._request('POST', '/inventory/transfer', access_token, tenant_id, json=payload)

    async def write_off_stock(self, access_token: str, tenant_id: str, payload: dict[str, object]) -> dict[str, object]:
        return await self._request('POST', '/inventory/write-off', access_token, tenant_id, json=payload)

    async def cycle_count(self, access_token: str, tenant_id: str, payload: dict[str, object]) -> dict[str, object]:
        return await self._request('POST', '/inventory/cycle-count', access_token, tenant_id, json=payload)

    async def list_pos(
        self,
        access_token: str,
        tenant_id: str,
        params: dict[str, object] | None = None,
    ) -> dict[str, object]:
        payload = await self._request('GET', '/purchasing/po', access_token, tenant_id, params=params)
        return payload

    async def get_po(self, access_token: str, tenant_id: str, po_id: str) -> dict[str, object]:
        payload = await self._request('GET', f'/purchasing/po/{po_id}', access_token, tenant_id)
        return payload

    async def create_po(self, access_token: str, tenant_id: str, payload: dict[str, object]) -> dict[str, object]:
        return await self._request('POST', '/purchasing/po', access_token, tenant_id, json=payload)

    async def update_po(
        self, access_token: str, tenant_id: str, po_id: str, payload: dict[str, object]
    ) -> dict[str, object]:
        return await self._request('PATCH', f'/purchasing/po/{po_id}', access_token, tenant_id, json=payload)

    async def receive_po(
        self, access_token: str, tenant_id: str, po_id: str, payload: dict[str, object]
    ) -> dict[str, object]:
        return await self._request('POST', f'/purchasing/po/{po_id}/receive', access_token, tenant_id, json=payload)

    async def close_po(self, access_token: str, tenant_id: str, po_id: str) -> dict[str, object]:
        return await self._request(
            'POST',
            f'/purchasing/po/{po_id}/close',
            access_token,
            tenant_id,
            json={'confirm': True},
        )

    async def cancel_po(self, access_token: str, tenant_id: str, po_id: str) -> dict[str, object]:
        return await self._request(
            'POST',
            f'/purchasing/po/{po_id}/cancel',
            access_token,
            tenant_id,
            json={'confirm': True},
        )

    async def list_invoices(
        self,
        access_token: str,
        tenant_id: str,
        params: dict[str, object] | None = None,
    ) -> dict[str, object]:
        payload = await self._request('GET', '/sales/invoice', access_token, tenant_id, params=params)
        return payload

    async def get_invoice(self, access_token: str, tenant_id: str, invoice_id: str) -> dict[str, object]:
        payload = await self._request('GET', f'/sales/invoice/{invoice_id}', access_token, tenant_id)
        return payload

    async def create_invoice(self, access_token: str, tenant_id: str, payload: dict[str, object]) -> dict[str, object]:
        return await self._request('POST', '/sales/invoice', access_token, tenant_id, json=payload)

    async def update_invoice(
        self, access_token: str, tenant_id: str, invoice_id: str, payload: dict[str, object]
    ) -> dict[str, object]:
        return await self._request('PATCH', f'/sales/invoice/{invoice_id}', access_token, tenant_id, json=payload)

    async def dispatch_invoice(
        self, access_token: str, tenant_id: str, invoice_id: str, payload: dict[str, object]
    ) -> dict[str, object]:
        return await self._request(
            'POST',
            f'/sales/invoice/{invoice_id}/dispatch',
            access_token,
            tenant_id,
            json=payload,
        )

    async def cancel_invoice(self, access_token: str, tenant_id: str, invoice_id: str) -> dict[str, object]:
        return await self._request(
            'POST',
            f'/sales/invoice/{invoice_id}/cancel',
            access_token,
            tenant_id,
            json={'confirm': True},
        )

    async def reporting_stock_summary(
        self, access_token: str, tenant_id: str, params: dict[str, object]
    ) -> list[dict[str, object]]:
        return await self._request('GET', '/reporting/stock-summary', access_token, tenant_id, params=params)

    async def reporting_movement_summary(
        self, access_token: str, tenant_id: str, params: dict[str, object]
    ) -> list[dict[str, object]]:
        return await self._request('GET', '/reporting/movement-summary', access_token, tenant_id, params=params)

    async def reporting_po_summary(
        self, access_token: str, tenant_id: str, params: dict[str, object]
    ) -> list[dict[str, object]]:
        return await self._request('GET', '/reporting/po-summary', access_token, tenant_id, params=params)

    async def reporting_receipt_summary(
        self, access_token: str, tenant_id: str, params: dict[str, object]
    ) -> list[dict[str, object]]:
        return await self._request('GET', '/reporting/receipt-summary', access_token, tenant_id, params=params)

    async def evaluate_approval(
        self,
        access_token: str,
        tenant_id: str,
        action_type: str,
        quantity: int | None = None,
    ) -> GovernanceEvaluationResponse:
        payload: dict[str, object] = {'actionType': action_type}
        if quantity is not None:
            payload['quantity'] = quantity
        payload = await self._request(
            'POST',
            '/ai-governance/evaluate',
            access_token,
            tenant_id,
            json=payload,
        )
        return GovernanceEvaluationResponse.model_validate(payload)

    async def create_approval_request(
        self,
        access_token: str,
        tenant_id: str,
        payload: dict[str, object],
    ) -> ApprovalRequestStatus:
        result = await self._request('POST', '/ai-governance/requests', access_token, tenant_id, json=payload)
        return ApprovalRequestStatus.model_validate(result)

    async def update_approval_request(
        self,
        access_token: str,
        tenant_id: str,
        approval_id: str,
        payload: dict[str, object],
    ) -> ApprovalRequestStatus:
        result = await self._request(
            'PATCH',
            f'/ai-governance/requests/{approval_id}',
            access_token,
            tenant_id,
            json=payload,
        )
        return ApprovalRequestStatus.model_validate(result)

    async def get_approval_request(
        self,
        access_token: str,
        tenant_id: str,
        approval_id: str,
    ) -> ApprovalRequestStatus:
        result = await self._request('GET', f'/ai-governance/requests/{approval_id}', access_token, tenant_id)
        return ApprovalRequestStatus.model_validate(result)

    async def list_approvals(self, access_token: str, tenant_id: str) -> list[ApprovalItem]:
        payload = await self._request('GET', '/ai-governance/approvals', access_token, tenant_id)
        return [ApprovalItem.model_validate(item) for item in payload]

    async def decide_approval(
        self,
        access_token: str,
        tenant_id: str,
        approval_id: str,
        approve: bool,
    ) -> ApprovalDecisionResponse:
        payload = await self._request(
            'POST',
            f'/ai-governance/approvals/{approval_id}/decision',
            access_token,
            tenant_id,
            json={'approve': approve},
        )
        return ApprovalDecisionResponse.model_validate(payload)

    async def list_history(self, access_token: str, tenant_id: str) -> list[HistoryItem]:
        payload = await self._request('GET', '/ai-audit/history', access_token, tenant_id)
        return [HistoryItem.model_validate(item) for item in payload]

    async def record_audit_event(
        self,
        access_token: str,
        tenant_id: str,
        payload: dict[str, object],
    ) -> dict[str, object]:
        result = await self._request('POST', '/ai-audit/events', access_token, tenant_id, json=payload)
        return result

    async def check_ai_usage_quota(
        self,
        access_token: str,
        tenant_id: str,
        requested_tokens: int,
    ) -> dict[str, object]:
        result = await self._request(
            'POST',
            '/billing/ai-usage/check',
            access_token,
            tenant_id,
            json={'requestedTokens': requested_tokens},
        )
        return result

    async def record_ai_usage(
        self,
        access_token: str,
        tenant_id: str,
        entries: list[dict[str, object]],
    ) -> dict[str, object]:
        result = await self._request(
            'POST',
            '/billing/ai-usage',
            access_token,
            tenant_id,
            json={'entries': entries},
        )
        return result

    async def analytics_low_stock(
        self, access_token: str, tenant_id: str, params: dict[str, object]
    ) -> list[dict[str, object]]:
        return await self._request('GET', '/analytics/low-stock', access_token, tenant_id, params=params)

    async def analytics_top_selling(
        self, access_token: str, tenant_id: str, params: dict[str, object]
    ) -> list[dict[str, object]]:
        return await self._request('GET', '/analytics/top-selling', access_token, tenant_id, params=params)

    async def analytics_slow_moving(
        self, access_token: str, tenant_id: str, params: dict[str, object]
    ) -> list[dict[str, object]]:
        return await self._request('GET', '/analytics/slow-moving', access_token, tenant_id, params=params)

    async def analytics_out_of_stock(
        self, access_token: str, tenant_id: str, params: dict[str, object]
    ) -> list[dict[str, object]]:
        return await self._request('GET', '/analytics/out-of-stock', access_token, tenant_id, params=params)

    async def analytics_reorder_needed(
        self, access_token: str, tenant_id: str, params: dict[str, object]
    ) -> list[dict[str, object]]:
        return await self._request('GET', '/analytics/reorder-needed', access_token, tenant_id, params=params)

    async def analytics_stock_value(
        self, access_token: str, tenant_id: str, params: dict[str, object]
    ) -> list[dict[str, object]]:
        return await self._request('GET', '/analytics/stock-value', access_token, tenant_id, params=params)

    async def analytics_no_recent_sales(
        self, access_token: str, tenant_id: str, params: dict[str, object]
    ) -> list[dict[str, object]]:
        return await self._request('GET', '/analytics/no-recent-sales', access_token, tenant_id, params=params)

    async def analytics_high_demand_low_stock(
        self, access_token: str, tenant_id: str, params: dict[str, object]
    ) -> list[dict[str, object]]:
        return await self._request('GET', '/analytics/high-demand-low-stock', access_token, tenant_id, params=params)

    async def analytics_recently_added(
        self, access_token: str, tenant_id: str, params: dict[str, object]
    ) -> list[dict[str, object]]:
        return await self._request('GET', '/analytics/recently-added', access_token, tenant_id, params=params)

    async def analytics_data_quality(
        self, access_token: str, tenant_id: str, params: dict[str, object]
    ) -> list[dict[str, object]]:
        return await self._request('GET', '/analytics/data-quality', access_token, tenant_id, params=params)

    async def analytics_variant_availability(
        self, access_token: str, tenant_id: str, params: dict[str, object]
    ) -> list[dict[str, object]]:
        return await self._request('GET', '/analytics/variant-availability', access_token, tenant_id, params=params)
