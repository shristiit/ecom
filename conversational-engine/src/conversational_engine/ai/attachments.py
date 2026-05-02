from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import re
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from conversational_engine.ai.repository import AIRepository
from conversational_engine.config.settings import Settings
from conversational_engine.contracts.common import AttachmentMetadata, MessageAttachmentRef

logger = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = {
    'text/plain',
    'text/csv',
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
}
TEXT_CONTENT_TYPES = {'text/plain', 'text/csv'}
IMAGE_CONTENT_TYPES = {'image/jpeg', 'image/png', 'image/webp'}
SAFE_FILENAME_RE = re.compile(r'[^A-Za-z0-9._-]+')
PREVIEW_TEXT_LIMIT = 4000


@dataclass(slots=True)
class AttachmentRuntimePayload:
    attachment_refs: list[MessageAttachmentRef]
    prompt_prefixes: list[str]
    image_data_urls: tuple[str, ...]


class S3AttachmentService:
    def __init__(self, repository: AIRepository, settings: Settings, s3_client) -> None:
        self._repository = repository
        self._settings = settings
        self._s3_client = s3_client

    async def upload_attachment(
        self,
        *,
        tenant_id: str,
        conversation_id: str,
        uploaded_by: str,
        file: UploadFile,
        message_id: str | None = None,
    ) -> AttachmentMetadata:
        if not self._settings.aws_region or not self._settings.s3_chat_attachments_bucket:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='S3 attachments are not configured.')

        content = await file.read()
        content_type = (file.content_type or 'application/octet-stream').split(';')[0].strip().lower()
        if content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f'Unsupported file type: {content_type}',
            )
        if len(content) > self._settings.chat_attachment_max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f'File exceeds {self._settings.chat_attachment_max_bytes} bytes limit.',
            )

        attachment_id = str(uuid4())
        filename = self._safe_filename(file.filename or 'attachment')
        s3_key = f'tenants/{tenant_id}/conversations/{conversation_id}/attachments/{attachment_id}/{filename}'
        sha256 = hashlib.sha256(content).hexdigest()
        metadata = self._build_metadata(content_type=content_type, content=content)

        await asyncio.to_thread(
            self._upload_bytes_sync,
            self._settings.s3_chat_attachments_bucket,
            s3_key,
            content,
            content_type,
        )

        doc = await self._repository.create_attachment_metadata(
            tenant_id=tenant_id,
            payload={
                '_id': attachment_id,
                'conversationId': conversation_id,
                'messageId': message_id,
                'uploadedBy': uploaded_by,
                'filename': filename,
                'contentType': content_type,
                'sizeBytes': len(content),
                's3Bucket': self._settings.s3_chat_attachments_bucket,
                's3Key': s3_key,
                'sha256': sha256,
                'status': 'uploaded',
                'metadata': metadata,
            },
        )
        return AttachmentMetadata.model_validate({'id': doc['_id'], **doc})

    async def prepare_runtime_attachments(
        self,
        *,
        tenant_id: str,
        conversation_id: str,
        attachment_ids: list[str],
    ) -> AttachmentRuntimePayload:
        docs = await self._repository.list_attachments_by_ids(
            tenant_id=tenant_id,
            conversation_id=conversation_id,
            attachment_ids=attachment_ids,
        )
        refs: list[MessageAttachmentRef] = []
        prompt_prefixes: list[str] = []
        image_data_urls: list[str] = []
        for doc in docs:
            refs.append(
                MessageAttachmentRef(
                    attachment_id=doc['_id'],
                    filename=doc['filename'],
                    content_type=doc['contentType'],
                    size_bytes=int(doc['sizeBytes']),
                    status=doc.get('status', 'uploaded'),
                )
            )
            metadata = doc.get('metadata') or {}
            if doc['contentType'] in TEXT_CONTENT_TYPES:
                preview_text = str(metadata.get('previewText') or '').strip()
                if preview_text:
                    prompt_prefixes.append(f'[File: {doc["filename"]}]\n---\n{preview_text}\n---')
                else:
                    prompt_prefixes.append(f'[File attached: {doc["filename"]}]')
            elif doc['contentType'] in IMAGE_CONTENT_TYPES:
                try:
                    data = await asyncio.to_thread(self._download_bytes_sync, doc['s3Bucket'], doc['s3Key'])
                    image_data_urls.append(
                        f'data:{doc["contentType"]};base64,{base64.b64encode(data).decode("utf-8")}'
                    )
                except Exception:  # pragma: no cover - network/storage failure
                    logger.exception('Failed to load image attachment %s', doc['_id'])
            else:
                prompt_prefixes.append(f'[File attached: {doc["filename"]} ({doc["contentType"]})]')
        return AttachmentRuntimePayload(
            attachment_refs=refs,
            prompt_prefixes=prompt_prefixes,
            image_data_urls=tuple(image_data_urls),
        )

    async def build_presigned_download_url(self, attachment: dict[str, Any], expires_seconds: int = 900) -> str:
        return await asyncio.to_thread(
            self._s3_client.generate_presigned_url,
            'get_object',
            Params={'Bucket': attachment['s3Bucket'], 'Key': attachment['s3Key']},
            ExpiresIn=expires_seconds,
        )

    @staticmethod
    def _safe_filename(filename: str) -> str:
        cleaned = SAFE_FILENAME_RE.sub('-', filename.strip()).strip('-')
        return cleaned or 'attachment'

    @staticmethod
    def _build_metadata(*, content_type: str, content: bytes) -> dict[str, Any]:
        metadata: dict[str, Any] = {}
        if content_type in TEXT_CONTENT_TYPES:
            metadata['previewText'] = content.decode('utf-8', errors='replace')[:PREVIEW_TEXT_LIMIT]
        return metadata

    def _upload_bytes_sync(self, bucket: str, key: str, body: bytes, content_type: str) -> None:
        self._s3_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=body,
            ContentType=content_type,
            ServerSideEncryption='AES256',
        )

    def _download_bytes_sync(self, bucket: str, key: str) -> bytes:
        response = self._s3_client.get_object(Bucket=bucket, Key=key)
        return response['Body'].read()
