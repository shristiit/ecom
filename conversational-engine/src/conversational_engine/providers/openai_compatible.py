from __future__ import annotations

import json
from typing import Any

import httpx

from conversational_engine.providers.base import (
    ChatProvider,
    ClassificationResult,
    EmbeddingsProvider,
    IntentClassifier,
    ProviderMessage,
)


class OpenAICompatibleChatProvider(ChatProvider):
    def __init__(self, *, base_url: str, api_key: str) -> None:
        self._base_url = base_url.rstrip('/')
        self._api_key = api_key

    def _headers(self) -> dict[str, str]:
        return {
            'Authorization': f'Bearer {self._api_key}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }

    async def complete_text(self, *, model: str, messages: list[ProviderMessage]) -> str:
        serialized_messages = [{'role': message.role, 'content': message.content} for message in messages]
        payload: dict[str, object] = {
            'model': model,
            'temperature': 0,
            'messages': serialized_messages,
        }
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(f'{self._base_url}/chat/completions', headers=self._headers(), json=payload)
            response.raise_for_status()
            data = response.json()
        content = data.get('choices', [{}])[0].get('message', {}).get('content')
        if not isinstance(content, str):
            raise RuntimeError('LLM returned empty content')
        return content

    async def complete_json(
        self,
        *,
        model: str,
        messages: list[ProviderMessage],
        json_schema: dict[str, Any],
        max_tokens: int = 400,
    ) -> dict[str, Any]:
        serialized_messages = [{'role': message.role, 'content': message.content} for message in messages]
        payload: dict[str, object] = {
            'model': model,
            'temperature': 0,
            'max_tokens': max_tokens,
            'messages': serialized_messages,
            'response_format': {
                'type': 'json_schema',
                'json_schema': {
                    'name': 'structured_output',
                    'strict': True,
                    'schema': json_schema,
                },
            },
        }
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(f'{self._base_url}/chat/completions', headers=self._headers(), json=payload)
            if response.status_code == 400:
                # Some OpenAI-compatible providers reject json_schema; retry with json_object.
                fallback_payload = dict(payload)
                fallback_payload['response_format'] = {'type': 'json_object'}
                response = await client.post(
                    f'{self._base_url}/chat/completions',
                    headers=self._headers(),
                    json=fallback_payload,
                )
            if not response.is_success:
                raise RuntimeError(f'LLM request failed: {response.status_code} {response.text}')
            data = response.json()
        raw = data.get('choices', [{}])[0].get('message', {}).get('content')
        if not isinstance(raw, str) or not raw.strip():
            raise RuntimeError('LLM returned empty JSON content')
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f'LLM returned invalid JSON: {exc}') from exc
        if not isinstance(parsed, dict):
            raise RuntimeError('LLM JSON output was not an object')
        return parsed


class OpenAICompatibleEmbeddingsProvider(EmbeddingsProvider):
    def __init__(self, *, base_url: str, api_key: str) -> None:
        self._base_url = base_url.rstrip('/')
        self._api_key = api_key

    def _headers(self) -> dict[str, str]:
        return {
            'Authorization': f'Bearer {self._api_key}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }

    async def embed(self, *, model: str, texts: list[str]) -> list[list[float]]:
        payload: dict[str, object] = {'model': model, 'input': texts}
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(f'{self._base_url}/embeddings', headers=self._headers(), json=payload)
            response.raise_for_status()
            data = response.json()
        items = data.get('data')
        if not isinstance(items, list):
            raise RuntimeError('Embeddings response missing data')
        vectors: list[list[float]] = []
        for item in items:
            embedding = item.get('embedding') if isinstance(item, dict) else None
            if not isinstance(embedding, list):
                raise RuntimeError('Embeddings response missing vector')
            vectors.append([float(value) for value in embedding])
        return vectors


class OpenAICompatibleIntentClassifier(IntentClassifier):
    def __init__(self, *, chat_provider: ChatProvider) -> None:
        self._chat_provider = chat_provider

    async def classify(self, *, model: str, text: str, intents: list[str]) -> ClassificationResult:
        schema = {
            'type': 'object',
            'additionalProperties': False,
            'properties': {
                'intent': {'type': 'string', 'enum': intents},
                'confidence': {'type': 'number'},
            },
            'required': ['intent', 'confidence'],
        }
        messages = [
            ProviderMessage(
                role='system',
                content=(
                    'You are an intent classifier for an inventory management assistant. '
                    'Return the single best intent and a confidence between 0 and 1.'
                ),
            ),
            ProviderMessage(role='user', content=text),
        ]
        result = await self._chat_provider.complete_json(
            model=model,
            messages=messages,
            json_schema=schema,
            max_tokens=120,
        )
        intent = result.get('intent')
        confidence = result.get('confidence')
        if not isinstance(intent, str):
            raise RuntimeError('Classifier returned invalid intent')
        try:
            confidence_value = float(confidence)
        except (TypeError, ValueError) as exc:
            raise RuntimeError('Classifier returned invalid confidence') from exc
        return ClassificationResult(intent=intent, confidence=max(0.0, min(1.0, confidence_value)))
