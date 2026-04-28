from __future__ import annotations

import pytest

from conversational_engine.runtime.state_update import resolve_state_update

pytestmark = pytest.mark.anyio


class FakeRetrievalService:
    async def resolve_navigation(self, query: str):
        del query
        return []


@pytest.mark.parametrize(
    ('message', 'expected_intent'),
    [
        ('add a new vendor called Acme Supply', 'master.create_supplier'),
        ('update supplier Acme Supply phone number', 'master.update_supplier'),
        ('remove customer Helen Barrows', 'master.delete_customer'),
        ('create a client named Helen Barrows', 'master.create_customer'),
    ],
)
async def test_state_update_detects_master_data_mutation_intents(message: str, expected_intent: str):
    state = await resolve_state_update(
        user_message=message,
        extracted_entities={},
        recent_messages=[],
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
        state_updater=None,
    )

    assert state.primary_route == 'mutation'
    assert state.primary_intent == expected_intent
