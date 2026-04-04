from __future__ import annotations

from fastapi import Header, HTTPException, status

from conversational_engine.app.dependency_providers import get_backend_client
from conversational_engine.schemas.auth_schemas import AuthContext


async def require_auth_context(
    authorization: str | None = Header(default=None),
    x_tenant_id: str | None = Header(default=None),
) -> AuthContext:
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Missing bearer token')

    access_token = authorization.removeprefix('Bearer ').strip()
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Missing bearer token')

    backend_client = get_backend_client()

    try:
        context = await backend_client.resolve_auth_context(access_token, x_tenant_id)
        return context.model_copy(update={'access_token': access_token})
    except Exception as exc:  # pragma: no cover - network/auth failure path
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid session') from exc
