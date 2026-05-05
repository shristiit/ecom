from __future__ import annotations

import pytest

from conversational_engine.agents.state_updater import _format_recent_messages
from conversational_engine.runtime.state_update import resolve_state_update

pytestmark = pytest.mark.anyio


class FakeRetrievalService:
    async def resolve_navigation(self, query: str):
        del query
        return []


@pytest.mark.parametrize(
    ('message', 'expected_intent'),
    [
        ('create warehouse London DC', 'master.create_location'),
        ('update location Main Warehouse address', 'master.update_location'),
        ('remove warehouse Outlet Store', 'master.delete_location'),
        ('add a new vendor called Acme Supply', 'master.create_supplier'),
        ('update supplier Acme Supply phone number', 'master.update_supplier'),
        ('remove customer Helen Barrows', 'master.delete_customer'),
        ('create a client named Helen Barrows', 'master.create_customer'),
        ('receive purchase order PO-0001 into main warehouse', 'purchasing.receive_po'),
        ('dispatch sales order SO-0001 from outlet store', 'sales.dispatch_invoice'),
        ('write off 3 units of Field Fresh Short size L in Main Warehouse', 'inventory.write_off_stock'),
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


@pytest.mark.parametrize(
    ('message', 'expected_intent'),
    [
        ("what's the status of PO-0001", 'purchasing.get_po'),
        ('list all open POs', 'purchasing.list_pos'),
        ("what's the status of SO-0001", 'sales.get_invoice'),
        ('list open sales orders', 'sales.list_invoices'),
    ],
)
async def test_state_update_detects_commerce_read_intents(message: str, expected_intent: str):
    state = await resolve_state_update(
        user_message=message,
        extracted_entities={},
        recent_messages=[],
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
        state_updater=None,
    )

    assert state.primary_route == 'read'
    assert state.primary_intent == expected_intent


async def test_state_update_reuses_pending_location_creation_for_field_reply():
    state = await resolve_state_update(
        user_message='name : leicester\nlec-01\nwarehosue',
        extracted_entities={
            'taskContext': {
                'primaryRoute': 'mutation',
                'primaryIntent': 'master.create_location',
                'entities': {'type': 'warehouse'},
                'missingFields': ['name', 'code'],
                'postActions': [],
                'clarificationCount': 1,
                'status': 'drafting',
            }
        },
        recent_messages=[],
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
        state_updater=None,
    )

    assert state.is_workflow_edit is True
    assert state.primary_route == 'mutation'
    assert state.primary_intent == 'master.create_location'
    assert state.extracted_entities['name'] == 'leicester'
    assert state.extracted_entities['code'] == 'lec-01'
    assert state.extracted_entities['type'] == 'warehouse'


async def test_state_update_continues_draft_mutation_without_missing_field_aliases():
    state = await resolve_state_update(
        user_message='get it from the products',
        extracted_entities={
            'taskContext': {
                'primaryRoute': 'mutation',
                'primaryIntent': 'purchasing.create_po',
                'entities': {'supplierId': 'sup-1', 'lines': [{'productName': 'SHR-034', 'qty': 10}]},
                'missingFields': [],
                'postActions': [],
                'clarificationCount': 1,
                'status': 'drafting',
            }
        },
        recent_messages=[],
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
        state_updater=None,
    )

    assert state.is_workflow_edit is True
    assert state.primary_route == 'mutation'
    assert state.primary_intent == 'purchasing.create_po'


async def test_state_update_extracts_supplier_phone_and_address_without_overwriting_name():
    state = await resolve_state_update(
        user_message='Phone is 020-765-4321, address 45 Textile Lane, Liverpool.',
        extracted_entities={
            'taskContext': {
                'primaryRoute': 'mutation',
                'primaryIntent': 'master.create_supplier',
                'entities': {
                    'name': 'Eagle Fabrics',
                    'email': 'eagle@example.com',
                },
                'missingFields': ['phone', 'address'],
                'postActions': [],
                'clarificationCount': 1,
                'status': 'drafting',
            }
        },
        recent_messages=[],
        retrieval_service=FakeRetrievalService(),  # type: ignore[arg-type]
        state_updater=None,
    )

    assert state.is_workflow_edit is True
    assert state.primary_route == 'mutation'
    assert state.primary_intent == 'master.create_supplier'
    assert state.extracted_entities['name'] == 'Eagle Fabrics'
    assert state.extracted_entities['email'] == 'eagle@example.com'
    assert state.extracted_entities['phone'] == '020-765-4321'
    assert state.extracted_entities['address'] == '45 Textile Lane, Liverpool.'


def test_state_update_formats_preview_entities_into_recent_message_context():
    formatted = _format_recent_messages(
        [
            {
                'role': 'assistant',
                'blocks': [
                    {
                        'type': 'preview',
                        'actionType': 'Products Create Product',
                        'entities': [
                            {'label': 'name', 'value': 'Field Fresh Short'},
                            {'label': 'variants', 'value': "[{'size': 'XL', 'color': 'Sand'}]"},
                        ],
                    }
                ],
            }
        ]
    )

    assert 'preview: Products Create Product' in formatted
    assert 'name=Field Fresh Short' in formatted
