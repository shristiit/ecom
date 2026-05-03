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
                'toolArguments': None,
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


class AlternateShapeRouter:
    async def complete_json(self, **kwargs):
        del kwargs
        return ProviderResponse(
            provider_name='openai',
            model_name='gpt-4.1-mini',
            content='{}',
            parsed={
                'action': 'tool',
                'assistantMessage': 'Fetching stock summary.',
                'tool': 'reporting.stock_summary',
                'arguments': {'locationId': None, 'status': None, 'from': None},
                'requiredInputs': [],
            },
            raw_payload={},
        )


async def test_executor_accepts_common_openai_compatible_field_names():
    agent = ExecutorAgent(AlternateShapeRouter())  # type: ignore[arg-type]

    proposal = await agent.propose(
        user_message='give me the overview of current stock levels',
        plan={'action': 'tool'},
        tools=[],
        history=[],
    )

    assert proposal['toolName'] == 'reporting.stock_summary'
    assert proposal['toolArguments'] == {'locationId': None, 'status': None, 'from': None}


class DirectArgumentsRouter:
    async def complete_json(self, **kwargs):
        del kwargs
        return ProviderResponse(
            provider_name='openai',
            model_name='gpt-4.1-mini',
            content='{}',
            parsed={
                'action': 'tool',
                'assistantMessage': 'Checking stock.',
                'toolName': 'inventory.stock_on_hand',
                'toolArguments': {'productName': 'Monarch Tasty Parka'},
                'toolArgumentsJson': None,
                'requiredInputs': [],
            },
            raw_payload={},
        )


async def test_executor_accepts_native_tool_arguments_object():
    agent = ExecutorAgent(DirectArgumentsRouter())  # type: ignore[arg-type]

    proposal = await agent.propose(
        user_message='how much stock do we have for Monarch Tasty Parka',
        plan={'action': 'tool'},
        tools=[],
        history=[],
    )

    assert proposal['toolName'] == 'inventory.stock_on_hand'
    assert proposal['toolArguments'] == {'productName': 'Monarch Tasty Parka'}


class NoisyJsonRouter:
    async def complete_json(self, **kwargs):
        del kwargs
        return ProviderResponse(
            provider_name='openai',
            model_name='gpt-4.1-mini',
            content='{}',
            parsed={
                'action': 'tool',
                'assistantMessage': 'Creating product.',
                'toolName': 'products.create_product',
                'toolArguments': None,
                'toolArgumentsJson': (
                    'Arguments: {"styleCode":"SAI-12","name":"sai","basePrice":21,'
                    '"variants":[{"color":"red","size":"xl"}]}'
                ),
                'requiredInputs': [],
            },
            raw_payload={},
        )


async def test_executor_extracts_object_from_noisy_tool_arguments_json():
    agent = ExecutorAgent(NoisyJsonRouter())  # type: ignore[arg-type]

    proposal = await agent.propose(
        user_message='create a product',
        plan={'action': 'tool'},
        tools=[],
        history=[],
    )

    assert proposal['toolName'] == 'products.create_product'
    assert proposal['toolArguments'] == {
        'styleCode': 'SAI-12',
        'name': 'sai',
        'basePrice': 21,
        'variants': [{'color': 'red', 'size': 'xl'}],
    }


class ParametersRouter:
    async def complete_json(self, **kwargs):
        del kwargs
        return ProviderResponse(
            provider_name='openai',
            model_name='gpt-4.1-mini',
            content='{}',
            parsed={
                'action': 'tool',
                'assistantMessage': 'Creating product.',
                'tool': 'products.create_product',
                'parameters': {
                    'name': 'sai',
                    'styleCode': 'sai-12',
                    'basePrice': 21,
                    'variants': [{'sizeLabel': 'XL', 'colorName': 'red'}],
                },
                'requiredInputs': [],
            },
            raw_payload={},
        )


async def test_executor_accepts_parameters_alias():
    agent = ExecutorAgent(ParametersRouter())  # type: ignore[arg-type]

    proposal = await agent.propose(
        user_message='create a product name : sai, code: sai-12, xl, red, base price: 21',
        plan={'action': 'tool'},
        tools=[],
        history=[],
    )

    assert proposal['toolName'] == 'products.create_product'
    assert proposal['toolArguments'] == {
        'name': 'sai',
        'styleCode': 'sai-12',
        'basePrice': 21,
        'variants': [{'sizeLabel': 'XL', 'colorName': 'red'}],
    }


class MarkdownFenceRouter:
    async def complete_json(self, **kwargs):
        del kwargs
        return ProviderResponse(
            provider_name='openai',
            model_name='gpt-4.1-mini',
            content='{}',
            parsed={
                'action': 'tool',
                'assistantMessage': 'Creating product.',
                'toolName': 'products.create_product',
                'toolArguments': None,
                'toolArgumentsJson': '```json\n{"styleCode":"SAI-12","name":"sai","basePrice":21}\n```',
                'requiredInputs': [],
            },
            raw_payload={},
        )


async def test_executor_strips_markdown_fences_from_tool_arguments_json():
    agent = ExecutorAgent(MarkdownFenceRouter())  # type: ignore[arg-type]

    proposal = await agent.propose(
        user_message='create a product',
        plan={'action': 'tool'},
        tools=[],
        history=[],
    )

    assert proposal['toolArguments'] == {
        'styleCode': 'SAI-12',
        'name': 'sai',
        'basePrice': 21,
    }
