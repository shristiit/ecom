# Conversational Engine

Production Phase 1 conversational AI service for the inventory management platform.

This service owns:
- chat request normalization
- orchestration and agent routing
- follow-up question handling
- short-term workflow state
- help retrieval orchestration
- structured assistant response formatting

This service does not own:
- business-truth reads for live operational state outside its tool wrappers
- business-rule execution
- direct business-table writes

All inventory, products, purchasing, approvals, audit, and reporting actions must flow through backend APIs.

## Status

This initial slice establishes the production service foundation:
- `uv`-managed Python package
- FastAPI bootstrap
- typed chat contracts
- agent, tool, and provider interfaces
- health endpoint
- chat endpoint skeleton
- Alembic scaffold for engine-owned persistence
- seed help docs folder
- pytest smoke and contract tests

Domain orchestration, backend tool wrapping, approvals, retrieval, and persistence integration are not implemented in this slice yet.

## Layout

```text
src/conversational_engine/
  app/
  config/
  contracts/
  orchestrator/
  agents/
  tools/
  memory/
  retrieval/
  providers/
  prompts/
  approval/
  audit/
  conversations/
  utils/
```

## Environment

Copy `.env.example` and set:
- `CONVERSATIONAL_ENGINE_DATABASE_URL`
- `CONVERSATIONAL_ENGINE_BACKEND_BASE_URL`
- provider credentials as needed

## Local Development

```bash
cd /Users/user/ecom/apps/conversational-engine
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
pnpm migrate
```

## API Skeleton

- `GET /health`
- `GET /api/chat/conversations`
- `GET /api/chat/conversations/{conversation_id}`
- `POST /api/chat/conversations`
- `POST /api/chat/conversations/{conversation_id}/messages`
- `POST /api/chat/workflows/{workflow_id}/decision`

## Persistence Plan

Alembic migrations in this service will own:
- `ai_conversations`
- `ai_conversation_messages`
- `ai_workflows`
- `ai_workflow_memory`
- `ai_help_documents`
- `ai_help_chunks`

The initial migration also enables `pgvector`.
