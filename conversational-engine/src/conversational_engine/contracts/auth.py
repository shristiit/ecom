from __future__ import annotations

from conversational_engine.contracts.common import ContractModel


class AuthContext(ContractModel):
    id: str
    tenant_id: str
    role_id: str
    email: str
    permissions: list[str]
    access_token: str | None = None
