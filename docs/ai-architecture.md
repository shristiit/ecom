# AI Architecture

## Overview

The conversational stack is split by responsibility:

- PostgreSQL remains the source of truth for all business data.
- The Python conversational engine owns all AI APIs and all AI persistence.
- MongoDB Atlas stores conversation state, workflow state, traces, memory, training datasets, help-doc retrieval data, and semantic memory.
- Redis stores active workflow cache, short-lived locks, and run stream state.
- S3 stores chat attachment bytes. Mongo stores only attachment metadata.

Node does not connect to MongoDB.

## Storage Responsibilities

### PostgreSQL

Business truth stays in PostgreSQL through backend APIs:
- tenants
- users
- roles
- permissions
- suppliers
- customers
- products
- SKUs
- stock
- purchase orders
- sales orders
- invoices
- payments
- approvals
- audit records

### MongoDB

AI-only collections:
- `ai_conversations`
- `ai_conversation_messages`
- `ai_workflows`
- `ai_workflow_memory`
- `ai_runs`
- `ai_run_events`
- `ai_traces`
- `ai_entity_memory`
- `ai_business_memory`
- `ai_user_memory`
- `ai_conversation_summaries`
- `ai_training_datasets`
- `ai_training_examples`
- `ai_semantic_memory`
- `ai_tenant_settings`
- `ai_attachments`
- `ai_help_documents`
- `ai_help_chunks`

Mongo is never the source of truth for real business facts or mutations.

## Redis Cache Design

Redis is optional. If `REDIS_URL` is missing, the engine logs that cache is disabled and falls back to Mongo-only reads.

Key patterns:

- `ai:{tenantId}:workflow:{workflowId}:state`
- `ai:{tenantId}:run:{runId}:stream`
- `ai:{tenantId}:lock:{workflowId}`

Defaults:

- workflow state TTL: 24h
- stream state TTL: 1h
- lock TTL: 60s

Write-through pattern:

1. Save authoritative workflow state to Mongo.
2. Best-effort refresh Redis.
3. Read Redis first, then Mongo on miss, then repopulate Redis.

## S3 Attachment Design

Allowed content types:

- `text/plain`
- `text/csv`
- `application/pdf`
- `image/jpeg`
- `image/png`
- `image/webp`

Key format:

`tenants/{tenantId}/conversations/{conversationId}/attachments/{attachmentId}/{safeFilename}`

Flow:

1. Authenticated user uploads to `/api/chat/attachments`.
2. Engine validates type and size.
3. Bytes are uploaded to S3.
4. Attachment metadata is written to `ai_attachments`.
5. Chat requests reference attachment IDs.
6. The runtime loads attachment metadata from Mongo and downloads image bytes from S3 when it needs inline multimodal input.

Use presigned URLs for reads. Do not use public S3 objects.

## Retention

Retention is tenant-specific and stored in `ai_tenant_settings`.

Defaults:

- raw messages: `730` days
- traces: `90` days
- run events: `90` days
- attachments: `730` days
- summaries: no expiry
- long-term memory: no expiry

The engine computes `expiresAt` at write time and relies on Mongo TTL indexes to expire data.

## Tenant Isolation

Rules:

- every Mongo query includes `tenantId`
- every Redis key includes `tenantId`
- every S3 object key includes `tenantId`
- no direct AI lookup by ID without tenant scope
- no access tokens or raw authorization headers are stored in Mongo

## Context Construction

The layered context passed into the runtime includes:

- `session`
- `workflow`
- `recentMessages`
- `latestSummary`
- `recentEntities`
- `businessMemory`
- `userMemory`
- `semanticMemory`

Recent message loading is bounded by:

- `CHAT_RECENT_MESSAGE_LIMIT`
- `CHAT_MAX_CONTEXT_MESSAGES`
- `CHAT_SUMMARY_TRIGGER_MESSAGES`

Full conversation history is not loaded on hot paths.

## Vector Search

Feature flag:

- `AI_VECTOR_SEARCH_ENABLED=true|false`

Semantic memory uses `ai_semantic_memory`.

Expected Atlas setup:

- collection: `ai_semantic_memory`
- index name: `ai_semantic_memory_embedding`
- field: `embedding`
- dimensions: match the embedding model
- similarity: cosine

If embedding generation fails or no embedding provider is configured, the runtime logs and continues without blocking the chat request.

## Environment Variables

Required:

```bash
AI_MEMORY_BACKEND=mongo
MONGO_URI=
MONGO_DATABASE=ecom_ai
REDIS_URL=
AWS_REGION=
S3_CHAT_ATTACHMENTS_BUCKET=
AI_VECTOR_SEARCH_ENABLED=false
```

Useful runtime tuning:

```bash
CHAT_ATTACHMENT_MAX_BYTES=10485760
CHAT_RECENT_MESSAGE_LIMIT=20
CHAT_MAX_CONTEXT_MESSAGES=30
CHAT_SUMMARY_TRIGGER_MESSAGES=40
MONGO_MAX_POOL_SIZE=100
MONGO_MIN_POOL_SIZE=0
MONGO_SERVER_SELECTION_TIMEOUT_MS=5000
```

## Local Setup

1. Start MongoDB locally or point to Atlas.
2. Start Redis locally or leave `REDIS_URL` empty.
3. Create an S3 bucket or point to a development bucket.
4. Configure `.env`.
5. Start the Node backend.
6. Start the conversational engine.

## AWS Production Notes

Recommended setup:

- MongoDB Atlas deployed in an AWS region near the app runtime
- AWS Secrets Manager for `MONGO_URI`, `REDIS_URL`, provider keys, and backend secrets
- ElastiCache Redis for Redis
- S3 bucket for chat attachments
- optional CloudFront for controlled attachment delivery
- ECS, EKS, or EC2 for runtime
- CloudWatch logs
- VPC and security-group restrictions
- S3 lifecycle policies aligned with tenant retention
- Atlas IP allowlists or private endpoints where available

## Troubleshooting

- Missing `MONGO_URI`: the app startup will fail when Mongo is the selected AI backend.
- Redis disabled: workflow cache misses will fall back to Mongo.
- Missing S3 config: `/api/chat/attachments` will reject uploads.
- Vector search empty: verify the Atlas vector index and the embedding provider configuration.
- Slow context loads: check message limits, summary generation, and Redis connectivity.
