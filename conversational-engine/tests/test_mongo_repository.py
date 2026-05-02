from __future__ import annotations

import os

import pytest
from motor.motor_asyncio import AsyncIOMotorClient

from conversational_engine.ai.mongo_repository import MongoAIRepository
from conversational_engine.config.settings import Settings
from conversational_engine.contracts.common import MessageRole, TextBlock

RUN_MONGO_TESTS = os.environ.get('RUN_MONGO_TESTS', '').lower() == 'true'
MONGO_TEST_URI = os.environ.get('MONGO_TEST_URI', 'mongodb://localhost:27017')
MONGO_TEST_DATABASE = os.environ.get('MONGO_TEST_DATABASE', 'ecom_ai_test')

pytestmark = pytest.mark.skipif(not RUN_MONGO_TESTS, reason='Set RUN_MONGO_TESTS=true to run Mongo integration tests')


@pytest.fixture()
async def mongo_repository():
    client = AsyncIOMotorClient(MONGO_TEST_URI, tz_aware=True)
    await client.drop_database(MONGO_TEST_DATABASE)
    repository = MongoAIRepository(
        client,
        Settings(
            mongo_uri=MONGO_TEST_URI,
            mongo_database=MONGO_TEST_DATABASE,
        ),
    )
    await repository.ensure_indexes()
    try:
        yield repository
    finally:
        await client.drop_database(MONGO_TEST_DATABASE)
        client.close()


@pytest.mark.anyio
async def test_mongo_repository_creates_conversation_and_workflow(mongo_repository: MongoAIRepository):
    conversation, workflow = await mongo_repository.create_conversation('tenant-a', 'user-a', 'New conversation')

    assert str(conversation.id)
    assert str(workflow.id)
    loaded = await mongo_repository.get_conversation('tenant-a', conversation.id, message_limit=20)
    assert loaded is not None
    assert loaded.conversation.id == conversation.id
    assert loaded.workflow is not None


@pytest.mark.anyio
async def test_mongo_repository_appends_messages_in_order(mongo_repository: MongoAIRepository):
    conversation, workflow = await mongo_repository.create_conversation('tenant-a', 'user-a', 'Thread')
    await mongo_repository.append_message(
        'tenant-a',
        conversation.id,
        workflow.id,
        MessageRole.USER,
        [TextBlock(content='first')],
        raw_text='first',
    )
    await mongo_repository.append_message(
        'tenant-a',
        conversation.id,
        workflow.id,
        MessageRole.ASSISTANT,
        [TextBlock(content='second')],
        raw_text='second',
    )

    messages = await mongo_repository.list_recent_messages('tenant-a', conversation.id, limit=10)
    assert [message.blocks[0].content for message in messages] == ['first', 'second']


@pytest.mark.anyio
async def test_mongo_repository_enforces_tenant_isolation(mongo_repository: MongoAIRepository):
    conversation, _workflow = await mongo_repository.create_conversation('tenant-a', 'user-a', 'Private thread')

    assert await mongo_repository.get_conversation('tenant-b', conversation.id, message_limit=20) is None


@pytest.mark.anyio
async def test_mongo_repository_sets_retention_expiry(mongo_repository: MongoAIRepository):
    await mongo_repository.upsert_tenant_ai_settings(
        'tenant-a',
        {
            'retention': {
                'rawMessagesDays': 1,
                'tracesDays': 2,
                'runEventsDays': 3,
                'attachmentsDays': 4,
                'summariesDays': None,
                'memoryDays': None,
            }
        },
    )
    conversation, workflow = await mongo_repository.create_conversation('tenant-a', 'user-a', 'Retention thread')
    message = await mongo_repository.append_message(
        'tenant-a',
        conversation.id,
        workflow.id,
        MessageRole.USER,
        [TextBlock(content='hello')],
        raw_text='hello',
    )

    loaded = await mongo_repository.get_message('tenant-a', conversation.id, str(message.id))
    assert loaded is not None
    raw_doc = await mongo_repository.database.ai_conversation_messages.find_one(
        {'tenantId': 'tenant-a', '_id': str(message.id)}
    )
    assert raw_doc is not None
    assert raw_doc['expiresAt'] is not None
