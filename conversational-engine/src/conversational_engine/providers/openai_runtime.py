from __future__ import annotations

import json
from typing import Any

import httpx

from conversational_engine.providers.runtime import ProviderMessage, ProviderResponse, RuntimeProvider


class OpenAICompatibleRuntimeProvider(RuntimeProvider):
    def __init__(self, *, name: str, base_url: str, api_key: str) -> None:
        self.name = name
        self._base_url = base_url.rstrip('/')
        self._api_key = api_key

    def _headers(self) -> dict[str, str]:
        return {
            'Authorization': f'Bearer {self._api_key}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }

    @staticmethod
    def _serialize_messages(messages: list[ProviderMessage]) -> list[dict[str, object]]:
        result: list[dict[str, object]] = []
        for msg in messages:
            if msg.image_data_urls:
                content: list[dict[str, object]] = [{'type': 'text', 'text': msg.content}]
                for url in msg.image_data_urls:
                    content.append({'type': 'image_url', 'image_url': {'url': url, 'detail': 'auto'}})
                result.append({'role': msg.role, 'content': content})
            else:
                result.append({'role': msg.role, 'content': msg.content})
        return result

    async def complete_text(
        self,
        *,
        model: str,
        messages: list[ProviderMessage],
        max_tokens: int = 600,
    ) -> ProviderResponse:
        payload: dict[str, object] = {
            'model': model,
            'temperature': 0,
            'max_tokens': max_tokens,
            'messages': self._serialize_messages(messages),
        }
        async with httpx.AsyncClient(timeout=40.0) as client:
            response = await client.post(f'{self._base_url}/chat/completions', headers=self._headers(), json=payload)
            response.raise_for_status()
            data = response.json()

        content = data.get('choices', [{}])[0].get('message', {}).get('content')
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError(f'{self.name} returned an empty text response')

        return ProviderResponse(
            provider_name=self.name,
            model_name=model,
            content=content,
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
        payload: dict[str, object] = {
            'model': model,
            'temperature': 0,
            'max_tokens': max_tokens,
            'messages': self._serialize_messages(messages),
            'response_format': {
                'type': 'json_schema',
                'json_schema': {
                    'name': 'structured_output',
                    'strict': True,
                    'schema': json_schema,
                },
            },
        }
        async with httpx.AsyncClient(timeout=40.0) as client:
            response = await client.post(f'{self._base_url}/chat/completions', headers=self._headers(), json=payload)
            if response.status_code == 400:
                fallback_payload = dict(payload)
                fallback_messages = self._serialize_messages(messages)
                fallback_messages.insert(
                    0,
                    {
                        'role': 'system',
                        'content': 'Return exactly one valid JSON object and no surrounding markdown.',
                    },
                )
                fallback_payload['response_format'] = {'type': 'json_object'}
                fallback_payload['messages'] = fallback_messages
                response = await client.post(
                    f'{self._base_url}/chat/completions',
                    headers=self._headers(),
                    json=fallback_payload,
                )
            if response.is_error:
                detail = response.text.strip()
                raise RuntimeError(
                    f'{self.name} JSON completion failed with status {response.status_code}: {detail or "no response body"}'
                )
            data = response.json()

        raw = data.get('choices', [{}])[0].get('message', {}).get('content')
        if not isinstance(raw, str) or not raw.strip():
            raise RuntimeError(f'{self.name} returned an empty JSON response')

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f'{self.name} returned invalid JSON: {exc}') from exc
        if not isinstance(parsed, dict):
            raise RuntimeError(f'{self.name} returned a non-object JSON payload')

        return ProviderResponse(
            provider_name=self.name,
            model_name=model,
            content=raw,
            parsed=parsed,
            raw_payload=data if isinstance(data, dict) else {},
        )
