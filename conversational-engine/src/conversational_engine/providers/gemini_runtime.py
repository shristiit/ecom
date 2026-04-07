from __future__ import annotations

import json
from typing import Any

import httpx

from conversational_engine.providers.runtime import ProviderMessage, ProviderResponse, RuntimeProvider


class GeminiRuntimeProvider(RuntimeProvider):
    name = 'gemini'

    def __init__(self, *, base_url: str, api_key: str) -> None:
        self._base_url = base_url.rstrip('/')
        self._api_key = api_key

    def _headers(self) -> dict[str, str]:
        return {
            'x-goog-api-key': self._api_key,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }

    @staticmethod
    def _flatten(messages: list[ProviderMessage]) -> str:
        return '\n\n'.join(f'{message.role.upper()}:\n{message.content}' for message in messages)

    @staticmethod
    def _extract_text(payload: dict[str, Any]) -> str:
        candidates = payload.get('candidates')
        if not isinstance(candidates, list) or not candidates:
            raise RuntimeError('gemini returned no candidates')
        parts = candidates[0].get('content', {}).get('parts', [])
        if not isinstance(parts, list):
            raise RuntimeError('gemini returned invalid parts payload')
        text = ''.join(str(part.get('text') or '') for part in parts if isinstance(part, dict))
        if not text.strip():
            raise RuntimeError('gemini returned empty content')
        return text

    async def complete_text(
        self,
        *,
        model: str,
        messages: list[ProviderMessage],
        max_tokens: int = 600,
    ) -> ProviderResponse:
        payload = {
            'contents': [{'parts': [{'text': self._flatten(messages)}]}],
            'generationConfig': {
                'temperature': 0,
                'maxOutputTokens': max_tokens,
            },
        }
        async with httpx.AsyncClient(timeout=40.0) as client:
            response = await client.post(
                f'{self._base_url}/models/{model}:generateContent',
                headers=self._headers(),
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
        text = self._extract_text(data if isinstance(data, dict) else {})
        return ProviderResponse(
            provider_name=self.name,
            model_name=model,
            content=text,
            raw_payload=data if isinstance(data, dict) else {},
        )

    async def complete_json(
        self,
        *,
        model: str,
        messages: list[ProviderMessage],
        json_schema: dict[str, Any],
        max_tokens: int = 600,
    ) -> ProviderResponse:
        payload = {
            'contents': [{'parts': [{'text': self._flatten(messages)}]}],
            'generationConfig': {
                'temperature': 0,
                'maxOutputTokens': max_tokens,
                'responseMimeType': 'application/json',
                'responseJsonSchema': json_schema,
            },
        }
        async with httpx.AsyncClient(timeout=40.0) as client:
            response = await client.post(
                f'{self._base_url}/models/{model}:generateContent',
                headers=self._headers(),
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
        raw = self._extract_text(data if isinstance(data, dict) else {})
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f'gemini returned invalid JSON: {exc}') from exc
        if not isinstance(parsed, dict):
            raise RuntimeError('gemini returned a non-object JSON payload')
        return ProviderResponse(
            provider_name=self.name,
            model_name=model,
            content=raw,
            parsed=parsed,
            raw_payload=data if isinstance(data, dict) else {},
        )
