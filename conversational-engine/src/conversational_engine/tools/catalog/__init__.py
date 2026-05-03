from __future__ import annotations

from typing import Any

from conversational_engine.clients.backend import BackendClient
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.tools.definitions import SemanticTool
from conversational_engine.tools.validation import ToolSchemaValidationError, validate_payload
from .commerce import build_commerce_tools
from .inventory import build_inventory_tools
from .products import build_product_tools
from .resolvers import EntityResolver


class SemanticToolCatalog:
    def __init__(self, *, backend: BackendClient, auth: AuthContext) -> None:
        self._backend = backend
        self._auth = auth
        self._tools = self._build_tools()

    def definitions(self) -> list[SemanticTool]:
        return list(self._tools.values())

    def schema_catalog(self) -> list[dict[str, Any]]:
        return [
            {
                'name': tool.name,
                'description': tool.description,
                'inputSchema': tool.input_schema,
                'riskLevel': tool.risk_level,
                'sideEffect': tool.side_effect,
            }
            for tool in self.definitions()
        ]

    def get(self, name: str) -> SemanticTool | None:
        return self._tools.get(name)

    def validate(self, name: str, payload: dict[str, Any]) -> None:
        tool = self.get(name)
        if tool is None:
            raise RuntimeError(f'Unknown semantic tool: {name}')
        issues = validate_payload(tool.input_schema, payload)
        if issues:
            raise ToolSchemaValidationError(issues)

    async def prepare(self, name: str, payload: dict[str, Any]) -> dict[str, Any]:
        tool = self.get(name)
        if tool is None:
            raise RuntimeError(f'Unknown semantic tool: {name}')
        if tool.preparer is None:
            return payload
        return await tool.preparer(payload)

    async def invoke(self, name: str, payload: dict[str, Any]) -> dict[str, Any]:
        tool = self.get(name)
        if tool is None:
            raise RuntimeError(f'Unknown semantic tool: {name}')
        prepared = await self.prepare(name, payload)
        return await tool.executor(prepared)

    def _build_tools(self) -> dict[str, SemanticTool]:
        resolver = EntityResolver(self._backend, self._auth)
        return {
            **build_commerce_tools(self._backend, self._auth, resolver),
            **build_inventory_tools(self._backend, self._auth, resolver),
            **build_product_tools(self._backend, self._auth, resolver),
        }
