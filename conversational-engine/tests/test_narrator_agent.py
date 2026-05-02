from __future__ import annotations

import pytest

from conversational_engine.agents.narrator import NarratorAgent
from conversational_engine.providers.runtime import ProviderResponse

pytestmark = pytest.mark.anyio


class FakeRouter:
    def __init__(self, response: ProviderResponse) -> None:
        self._response = response

    async def complete_json(self, **kwargs):
        del kwargs
        return self._response

    async def complete_text(self, **kwargs):
        del kwargs
        return self._response


class FakeRouterSequence:
    def __init__(
        self,
        json_responses: list[ProviderResponse],
        text_response: ProviderResponse | None = None,
    ) -> None:
        self._json_responses = json_responses
        self._text_response = text_response or json_responses[-1]
        self.json_calls = 0
        self.text_calls = 0

    async def complete_json(self, **kwargs):
        del kwargs
        index = min(self.json_calls, len(self._json_responses) - 1)
        self.json_calls += 1
        return self._json_responses[index]

    async def complete_text(self, **kwargs):
        del kwargs
        self.text_calls += 1
        return self._text_response


async def test_narrator_agent_uses_fallback_when_model_echoes_directive():
    agent = NarratorAgent(
        FakeRouter(
            ProviderResponse(
                provider_name='openai',
                model_name='gpt-test',
                content='{"message":"Reply naturally to the user and invite them to continue."}',
                parsed={'message': 'Reply naturally to the user and invite them to continue.'},
                raw_payload={},
            )
        )  # type: ignore[arg-type]
    )

    message = await agent.write_message(
        user_message='hello',
        directive='Reply naturally to the user and invite them to continue.',
        supporting_context={},
        fallback_message='Hi. How can I help?',
    )

    assert message == 'Hi. How can I help?'


async def test_narrator_agent_retries_when_model_echoes_directive():
    router = FakeRouterSequence(
        json_responses=[
            ProviderResponse(
                provider_name='openai',
                model_name='gpt-test',
                content='{"message":"Reply naturally to the user and invite them to continue."}',
                parsed={'message': 'Reply naturally to the user and invite them to continue.'},
                raw_payload={},
            ),
            ProviderResponse(
                provider_name='openai',
                model_name='gpt-test',
                content='{"message":"Hello. What can I help you with?"}',
                parsed={'message': 'Hello. What can I help you with?'},
                raw_payload={},
            ),
        ],
    )
    agent = NarratorAgent(router)  # type: ignore[arg-type]

    message = await agent.write_message(
        user_message='hello',
        directive='Reply naturally to the user and invite them to continue.',
        supporting_context={},
    )

    assert message == 'Hello. What can I help you with?'
    assert router.json_calls == 2
    assert router.text_calls == 0


async def test_narrator_agent_uses_text_recovery_before_exposing_directive():
    router = FakeRouterSequence(
        json_responses=[
            ProviderResponse(
                provider_name='openai',
                model_name='gpt-test',
                content='{"message":"Reply to the user in one short sentence that matches their tone, acknowledges their message, and invites them to continue."}',
                parsed={
                    'message': 'Reply to the user in one short sentence that matches their tone, acknowledges their message, and invites them to continue.'
                },
                raw_payload={},
            ),
            ProviderResponse(
                provider_name='openai',
                model_name='gpt-test',
                content='{"message":"Reply to the user in one short sentence that matches their tone, acknowledges their message, and invites them to continue."}',
                parsed={
                    'message': 'Reply to the user in one short sentence that matches their tone, acknowledges their message, and invites them to continue.'
                },
                raw_payload={},
            ),
        ],
        text_response=ProviderResponse(
            provider_name='openai',
            model_name='gpt-test',
            content='Hello. What can I help you with?',
            parsed=None,
            raw_payload={},
        ),
    )
    agent = NarratorAgent(router)  # type: ignore[arg-type]

    message = await agent.write_message(
        user_message='hello',
        directive='Reply to the user in one short sentence that matches their tone, acknowledges their message, and invites them to continue.',
        supporting_context={},
    )

    assert message == 'Hello. What can I help you with?'
    assert router.json_calls == 2
    assert router.text_calls == 1


async def test_narrator_agent_returns_model_message_when_valid():
    agent = NarratorAgent(
        FakeRouter(
            ProviderResponse(
                provider_name='openai',
                model_name='gpt-test',
                content='{"message":"Hey there! How can I help you today?"}',
                parsed={'message': 'Hey there! How can I help you today?'},
                raw_payload={},
            )
        )  # type: ignore[arg-type]
    )

    message = await agent.write_message(
        user_message='hello',
        directive='Reply naturally to the user and invite them to continue.',
        supporting_context={},
        fallback_message='Hi. How can I help?',
    )

    assert message == 'Hey there! How can I help you today?'
