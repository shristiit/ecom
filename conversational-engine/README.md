# Conversational Engine

Mongo-first AI conversation service for StockAisle.

## Responsibilities

The Python conversational engine owns:
- chat APIs
- AI conversations, messages, workflows, runs, traces, summaries, memory, training datasets
- Redis-backed active workflow cache
- S3-backed chat attachments
- Mongo-backed help retrieval content and semantic memory

The service does not own:
- business truth
- direct business-table writes
- Node/backend business persistence

All business reads and mutations still flow through backend HTTP APIs backed by PostgreSQL.

## Storage Split

- PostgreSQL: tenants, users, roles, permissions, suppliers, customers, products, SKUs, stock, orders, invoices, payments, approvals, audits
- MongoDB Atlas: all AI/conversation/memory data
- Redis: active workflow state, run stream cache, short-lived locks
- S3: uploaded chat attachment bytes

See [docs/ai-architecture.md](/Users/Apple/Desktop/ecom/docs/ai-architecture.md) for the full design.

## Environment

Copy `.env.example` and set:
- `CONVERSATIONAL_ENGINE_AI_MEMORY_BACKEND=mongo`
- `CONVERSATIONAL_ENGINE_MONGO_URI`
- `CONVERSATIONAL_ENGINE_MONGO_DATABASE=ecom_ai`
- `CONVERSATIONAL_ENGINE_REDIS_URL`
- `CONVERSATIONAL_ENGINE_AWS_REGION`
- `CONVERSATIONAL_ENGINE_S3_CHAT_ATTACHMENTS_BUCKET`
- `CONVERSATIONAL_ENGINE_AI_VECTOR_SEARCH_ENABLED=false`
- `CONVERSATIONAL_ENGINE_BACKEND_BASE_URL`
- provider credentials as needed

## Local Development

```bash
cd /Users/Apple/Desktop/ecom/conversational-engine
uv sync --dev
pnpm dev
```

Health check:

```bash
curl http://localhost:8000/health
```

## Scripts

```bash
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm format
```

## API

- `GET /health`
- `GET /api/chat/conversations`
- `GET /api/chat/conversations/{conversation_id}`
- `POST /api/chat/conversations`
- `POST /api/chat/conversations/{conversation_id}/messages`
- `POST /api/chat/runs/stream`
- `POST /api/chat/workflows/{workflow_id}/decision`
- `GET /api/chat/approvals`
- `POST /api/chat/approvals/{approval_id}/decision`
- `POST /api/chat/attachments`

## Notes

- Mongo indexes are created idempotently before repository use.
- Redis is optional; when disabled the engine falls back to Mongo only.
- Attachment IDs are the preferred contract. Inline image `dataUrl` payloads remain temporarily supported on `/api/chat/runs/stream`.
- Legacy Postgres AI schema files remain in the repo for compatibility only and are no longer part of the runtime path.
