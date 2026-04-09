from __future__ import annotations

from uuid import UUID, uuid4

from psycopg import Connection
from psycopg.types.json import Jsonb

from conversational_engine.contracts.runs import RunEvent, RunSummary, RunTraceRecord, TrainingDatasetSummary


def create_run(
    conn: Connection,
    *,
    tenant_id: str,
    conversation_id: UUID,
    workflow_id: UUID | None,
    user_message: str,
) -> RunSummary:
    run_id = uuid4()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ai_runs (id, tenant_id, conversation_id, workflow_id, status, user_message)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, conversation_id, workflow_id, status, user_message, created_at, updated_at
            """,
            (run_id, tenant_id, conversation_id, workflow_id, 'running', user_message),
        )
        row = cur.fetchone()
    return RunSummary.model_validate(row)


def finish_run(
    conn: Connection,
    *,
    tenant_id: str,
    run_id: UUID,
    status: str,
    error_message: str | None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE ai_runs
            SET status = %s, error_message = %s, updated_at = now()
            WHERE tenant_id = %s AND id = %s
            """,
            (status, error_message, tenant_id, run_id),
        )


def append_run_event(
    conn: Connection,
    *,
    tenant_id: str,
    run_id: UUID,
    conversation_id: UUID,
    workflow_id: UUID | None,
    sequence: int,
    event_type: str,
    payload: dict[str, object],
) -> RunEvent:
    event_id = uuid4()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ai_run_events (
              id,
              tenant_id,
              run_id,
              conversation_id,
              workflow_id,
              sequence,
              event_type,
              payload
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING run_id, conversation_id, workflow_id, sequence, event_type, payload
            """,
            (
                event_id,
                tenant_id,
                run_id,
                conversation_id,
                workflow_id,
                sequence,
                event_type,
                Jsonb(payload),
            ),
        )
        row = cur.fetchone()
    return RunEvent.model_validate(
        {
            'type': row['event_type'],
            'runId': row['run_id'],
            'conversationId': row['conversation_id'],
            'workflowId': row['workflow_id'],
            'sequence': row['sequence'],
            'payload': row['payload'] or {},
        }
    )


def record_trace(
    conn: Connection,
    *,
    tenant_id: str,
    run_id: UUID,
    agent_role: str,
    provider_name: str,
    model_name: str,
    stage: str,
    payload: dict[str, object],
    redacted_payload: dict[str, object],
) -> RunTraceRecord:
    trace_id = uuid4()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ai_traces (
              id,
              tenant_id,
              run_id,
              agent_role,
              provider_name,
              model_name,
              stage,
              payload,
              redacted_payload
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING
              id,
              run_id,
              stage,
              agent_role,
              provider_name,
              model_name,
              payload,
              redacted_payload,
              created_at
            """,
            (
                trace_id,
                tenant_id,
                run_id,
                agent_role,
                provider_name,
                model_name,
                stage,
                Jsonb(payload),
                Jsonb(redacted_payload),
            ),
        )
        row = cur.fetchone()
    return RunTraceRecord.model_validate(row)


def list_recent_trace_examples(conn: Connection, tenant_id: str, *, limit: int) -> list[dict[str, object]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT agent_role, stage, redacted_payload, created_at
            FROM ai_traces
            WHERE tenant_id = %s
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (tenant_id, limit),
        )
        rows = cur.fetchall()
    return [
        {
            'agentRole': row['agent_role'],
            'stage': row['stage'],
            'payload': row['redacted_payload'] or {},
            'createdAt': row['created_at'].isoformat(),
        }
        for row in rows
    ]


def create_training_dataset(
    conn: Connection,
    *,
    tenant_id: str,
    name: str,
    version: str,
    status: str,
) -> dict[str, object]:
    dataset_id = uuid4()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ai_training_datasets (id, tenant_id, name, version, status)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, name, version, status, example_count, created_at, updated_at
            """,
            (dataset_id, tenant_id, name, version, status),
        )
        row = cur.fetchone()
    dataset = TrainingDatasetSummary.model_validate(row)
    return dataset.model_dump(by_alias=True, mode='json')
