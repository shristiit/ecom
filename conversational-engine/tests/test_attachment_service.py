from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from io import BytesIO

from fastapi import UploadFile

from conversational_engine.ai.attachments import S3AttachmentService
from conversational_engine.config.settings import Settings


class FakeRepository:
    def __init__(self) -> None:
        self.last_payload: dict | None = None

    async def create_attachment_metadata(self, *, tenant_id: str, payload: dict[str, object]) -> dict[str, object]:
        now = datetime.now(UTC)
        self.last_payload = {'tenantId': tenant_id, 'createdAt': now, 'updatedAt': now, **payload}
        return self.last_payload

    async def list_attachments_by_ids(self, *, tenant_id: str, conversation_id: str, attachment_ids: list[str]):
        del tenant_id, conversation_id, attachment_ids
        return []


class FakeS3Client:
    def __init__(self) -> None:
        self.put_calls: list[dict[str, object]] = []

    def put_object(self, **kwargs) -> None:
        self.put_calls.append(kwargs)


def test_attachment_service_uploads_bytes_and_stores_metadata():
    async def run():
        settings = Settings.model_construct(
            mongo_uri='mongodb://localhost:27017',
            aws_region='eu-west-2',
            s3_chat_attachments_bucket='chat-bucket',
            chat_attachment_max_bytes=10 * 1024 * 1024,
        )
        repository = FakeRepository()
        s3_client = FakeS3Client()
        service = S3AttachmentService(repository, settings, s3_client)

        upload = UploadFile(
            filename='report.csv',
            file=BytesIO(b'name,qty\ncoat,12\n'),
            headers={'content-type': 'text/csv'},
        )

        attachment = await service.upload_attachment(
            tenant_id='tenant-1',
            conversation_id='conversation-1',
            uploaded_by='user-1',
            file=upload,
        )

        assert attachment.tenant_id == 'tenant-1'
        assert attachment.conversation_id == 'conversation-1'
        assert attachment.filename == 'report.csv'
        assert repository.last_payload is not None
        assert repository.last_payload['metadata']['previewText'].startswith('name,qty')
        assert s3_client.put_calls[0]['Bucket'] == 'chat-bucket'

    asyncio.run(run())
