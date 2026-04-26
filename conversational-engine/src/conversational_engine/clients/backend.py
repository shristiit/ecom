from __future__ import annotations

from uuid import uuid4

import httpx

from conversational_engine.contracts.api import (
    ApprovalDecisionResponse,
    ApprovalItem,
    ApprovalRequestStatus,
    GovernanceEvaluationResponse,
    HistoryItem,
)
from conversational_engine.contracts.auth import AuthContext


class BackendClient:
    def __init__(self, base_url: str) -> None:
        self._base_url = base_url.rstrip('/')

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
        async with httpx.AsyncClient(timeout=20.0) as client:
            headers = self._headers(access_token, tenant_id)
            if method.upper() in {'POST', 'PATCH', 'PUT', 'DELETE'}:
                headers['Idempotency-Key'] = str(uuid4())
            response = await client.request(
                method,
                f'{self._base_url}{path}',
                headers=headers,
                json=json,
                params=params,
            )
            response.raise_for_status()
        return response.json()

    async def resolve_auth_context(self, access_token: str, tenant_id: str | None) -> AuthContext:
        payload = await self._request('GET', '/auth/me', access_token, tenant_id)
        return AuthContext.model_validate(payload)

    async def list_locations(self, access_token: str, tenant_id: str) -> list[dict[str, object]]:
        return await self._request('GET', '/master/locations', access_token, tenant_id)

    async def list_suppliers(self, access_token: str, tenant_id: str) -> list[dict[str, object]]:
        return await self._request('GET', '/master/suppliers', access_token, tenant_id)

    async def list_customers(self, access_token: str, tenant_id: str) -> list[dict[str, object]]:
        return await self._request('GET', '/master/customers', access_token, tenant_id)

    async def list_categories(self, access_token: str, tenant_id: str) -> list[dict[str, object]]:
        return await self._request('GET', '/master/categories', access_token, tenant_id)

    async def list_products(self, access_token: str, tenant_id: str) -> list[dict[str, object]]:
        return await self._request('GET', '/products', access_token, tenant_id)

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
        return await self._request('GET', '/products', access_token, tenant_id, params=params or None)

    async def get_product(self, access_token: str, tenant_id: str, product_id: str) -> dict[str, object]:
        payload = await self._request('GET', f'/products/{product_id}', access_token, tenant_id)
        return payload

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
        return await self._request('POST', f'/purchasing/po/{po_id}/close', access_token, tenant_id, json={})

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
        return await self._request('POST', f'/sales/invoice/{invoice_id}/cancel', access_token, tenant_id, json={})

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
