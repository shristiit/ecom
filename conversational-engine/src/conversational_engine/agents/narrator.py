from __future__ import annotations

from collections.abc import Callable
import json
from typing import Any

from conversational_engine.providers.router import ProviderRouter, ProviderTrace
from conversational_engine.providers.runtime import ProviderMessage

NARRATOR_SCHEMA = {
    'type': 'object',
    'additionalProperties': False,
    'properties': {
        'message': {'type': 'string'},
    },
    'required': ['message'],
}


class NarratorAgent:
    def __init__(self, router: ProviderRouter) -> None:
        self._router = router

    async def write_message(
        self,
        *,
        user_message: str,
        directive: str,
        supporting_context: dict[str, Any],
        fallback_message: str | None = None,
        trace_callback: Callable[[str, ProviderTrace], None] | None = None,
    ) -> str:
        for attempt in range(2):
            response = await self._router.complete_json(
                role='narrator',
                messages=self._build_messages(
                    user_message=user_message,
                    directive=directive,
                    supporting_context=supporting_context,
                    retrying=attempt > 0,
                ),
                json_schema=NARRATOR_SCHEMA,
                max_tokens=300,
                trace_callback=trace_callback,
            )
            message = response.parsed.get('message') if response.parsed else None
            if not isinstance(message, str) or not message.strip():
                continue
            cleaned = message.strip()
            if self._looks_like_internal_instruction(cleaned, directive):
                continue
            return cleaned

        recovery = await self._router.complete_text(
            role='narrator',
            messages=self._build_recovery_messages(
                user_message=user_message,
                directive=directive,
                supporting_context=supporting_context,
            ),
            max_tokens=120,
            trace_callback=trace_callback,
        )
        recovered_message = self._extract_message_text(recovery.content)
        if recovered_message and not self._looks_like_internal_instruction(recovered_message, directive):
            return recovered_message

        return fallback_message or 'How can I help?'

    @staticmethod
    def _build_messages(
        *,
        user_message: str,
        directive: str,
        supporting_context: dict[str, Any],
        retrying: bool,
    ) -> list[ProviderMessage]:
        retry_instruction = ''
        if retrying:
            retry_instruction = (
                ' Your previous draft exposed an internal instruction. '
                'Rewrite it as the exact assistant message only, without mentioning directives or internal guidance.'
            )
        return [
            ProviderMessage(
                role='system',
                content=(
                    'You are the user-facing response writer for an internal inventory AI runtime. '
                    'Write natural, direct assistant messages for the user. '
                    'Do not expose internal planning language, reasoning labels, or agent roles.'
                    f'{retry_instruction}'
                ),
            ),
            ProviderMessage(
                role='user',
                content=(
                    f'Original user message:\n{user_message}\n\n'
                    f'Directive for what to communicate:\n{directive}\n\n'
                    f'Supporting context:\n{supporting_context}'
                ),
            ),
        ]

    @staticmethod
    def _build_recovery_messages(
        *,
        user_message: str,
        directive: str,
        supporting_context: dict[str, Any],
    ) -> list[ProviderMessage]:
        return [
            ProviderMessage(
                role='system',
                content=(
                    'Write the exact assistant reply to send to the user. '
                    'Return plain text only. '
                    'Do not repeat instructions, labels, directives, or internal guidance.'
                ),
            ),
            ProviderMessage(
                role='user',
                content=(
                    f'User message: {user_message}\n'
                    f'Response goal: {directive}\n'
                    f'Context: {supporting_context}\n'
                    'Assistant reply:'
                ),
            ),
        ]

    @staticmethod
    def _extract_message_text(content: str) -> str:
        cleaned = content.strip()
        if not cleaned:
            return ''
        try:
            payload = json.loads(cleaned)
        except json.JSONDecodeError:
            return cleaned
        if isinstance(payload, dict):
            message = payload.get('message')
            if isinstance(message, str):
                return message.strip()
        return cleaned

    @staticmethod
    def _looks_like_internal_instruction(message: str, directive: str) -> bool:
        normalized_message = ' '.join(message.split()).strip().lower()
        normalized_directive = ' '.join(directive.split()).strip().lower()
        if not normalized_message:
            return True
        if normalized_message == normalized_directive:
            return True
        if normalized_message.startswith('reply naturally to the user'):
            return True
        if normalized_message.startswith('directive for what to communicate'):
            return True
        return False
