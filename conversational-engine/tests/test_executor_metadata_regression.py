from __future__ import annotations

import pytest

from conversational_engine.agents.executor import ExecutorAgent
from conversational_engine.providers.runtime import ProviderResponse

pytestmark = pytest.mark.anyio


class TopLevelMetadataRouter:
    async def complete_json(self, **kwargs):
        del kwargs
        return ProviderResponse(
            provider_name='openai',
            model_name='gpt-4.1-mini',
            content='{}',
            parsed={
                'action': 'tool',
                'assistantMessage': 'Searching.',
                'toolName': 'navigation.find_screen',
                'toolArguments': None,
                'description': 'Find the purchase order screen.',
                'inputSchema': {'type': 'object'},
                'riskLevel': 'low',
                'sideEffect': False,
                'requiredInputs': [],
            },
            raw_payload={},
        )


class NestedMetadataRouter:
    async def complete_json(self, **kwargs):
        del kwargs
        return ProviderResponse(
            provider_name='openai',
            model_name='gpt-4.1-mini',
            content='{}',
            parsed={
                'action': 'tool',
                'assistantMessage': 'Searching.',
                'toolName': 'navigation.find_screen',
                'toolArguments': {
                    'query': 'purchase orders',
                    'description': 'Find purchase orders.',
                    'inputSchema': {'type': 'object'},
                    'riskLevel': 'low',
                    'sideEffect': False,
                },
                'requiredInputs': [],
            },
            raw_payload={},
        )


async def test_executor_ignores_top_level_catalog_metadata_when_recovering_arguments():
    agent = ExecutorAgent(TopLevelMetadataRouter())  # type: ignore[arg-type]

    proposal = await agent.propose(
        user_message='open purchase orders',
        plan={'action': 'tool'},
        tools=[],
        history=[],
        expected_tool_name='navigation.find_screen',
    )

    assert proposal['toolName'] == 'navigation.find_screen'
    assert proposal['toolArguments'] is None


async def test_executor_strips_catalog_metadata_from_tool_arguments():
    agent = ExecutorAgent(NestedMetadataRouter())  # type: ignore[arg-type]

    proposal = await agent.propose(
        user_message='open purchase orders',
        plan={'action': 'tool'},
        tools=[],
        history=[],
    )

    assert proposal['toolName'] == 'navigation.find_screen'
    assert proposal['toolArguments'] == {'query': 'purchase orders'}
