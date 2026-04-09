from __future__ import annotations

import pytest

from conversational_engine.agents.executor import ExecutorAgent
from conversational_engine.providers.runtime import ProviderResponse

pytestmark = pytest.mark.anyio


class FakeRouter:
    async def complete_json(self, **kwargs):
        del kwargs
        return ProviderResponse(
            provider_name='openai',
            model_name='gpt-4.1-mini',
            content='{}',
            parsed={
                'action': 'tool',
                'assistantMessage': 'Fetching stock summary.',
                'toolName': 'reporting.stock_summary',
                'toolArgumentsJson': '{"locationId": null, "status": null, "from": null}',
                'requiredInputs': [],
            },
            raw_payload={},
        )


async def test_executor_parses_tool_arguments_json():
    agent = ExecutorAgent(FakeRouter())  # type: ignore[arg-type]

    proposal = await agent.propose(
        user_message='give me the overview of current stock levels',
        plan={'action': 'tool'},
        tools=[],
        history=[],
    )

    assert proposal['toolName'] == 'reporting.stock_summary'
    assert proposal['toolArguments'] == {'locationId': None, 'status': None, 'from': None}
