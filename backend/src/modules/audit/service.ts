import { Request, Response } from 'express';
import { query } from '@backend/db/pool.js';

const unifiedAuditQuery = `
  SELECT
    audit_events.id,
    audit_events.source,
    audit_events.action,
    audit_events.module,
    audit_events.entity_type,
    audit_events.entity_id,
    audit_events.result,
    audit_events.actor_id,
    audit_events.actor_email,
    audit_events.request_text,
    audit_events.why,
    audit_events.metadata,
    audit_events.created_at
  FROM (
    SELECT
      ar.id,
      'inventory'::text AS source,
      COALESCE(ar.why, 'inventory.transaction') AS action,
      'inventory'::text AS module,
      'inventory_transaction'::text AS entity_type,
      ar.transaction_id::text AS entity_id,
      'success'::text AS result,
      ar.who::text AS actor_id,
      actor.email AS actor_email,
      COALESCE(ar.request_text, '') AS request_text,
      ar.why,
      jsonb_strip_nulls(
        jsonb_build_object(
          'source', 'inventory',
          'requestText', COALESCE(ar.request_text, ''),
          'beforeAfter', COALESCE(ar.before_after, '{}'::jsonb),
          'transactionId', ar.transaction_id,
          'requestedById', ar.who,
          'requestedByEmail', actor.email,
          'approvedById', ar.approver,
          'approvedByEmail', approver.email
        )
      ) AS metadata,
      ar.created_at
    FROM audit_records ar
    LEFT JOIN users actor ON actor.id = ar.who
    LEFT JOIN users approver ON approver.id = ar.approver
    WHERE ar.tenant_id = $1
      AND ($2::uuid IS NULL OR ar.transaction_id IN (SELECT id FROM inventory_transactions WHERE size_id = $2))
      AND ($3::timestamptz IS NULL OR ar.created_at >= $3)
      AND ($4::timestamptz IS NULL OR ar.created_at <= $4)

    UNION ALL

    SELECT
      ae.id,
      'ai'::text AS source,
      COALESCE(arq.action_type, ae.payload->>'actionType', ae.event_type) AS action,
      'ai'::text AS module,
      CASE
        WHEN ae.event_type = 'execution_result' THEN 'ai_execution'
        ELSE 'approval_request'
      END AS entity_type,
      CASE
        WHEN ae.event_type = 'execution_result' THEN COALESCE(
          ae.payload->>'transactionId',
          ae.payload->>'resultId',
          ae.payload->>'productId',
          ae.payload->>'invoiceId',
          ae.payload->>'poId',
          ae.approval_request_id::text,
          ae.id::text
        )
        ELSE COALESCE(ae.approval_request_id::text, ae.id::text)
      END AS entity_id,
      CASE
        WHEN ae.event_type = 'approval_requested' THEN 'warning'
        WHEN COALESCE(ae.payload->>'status', 'success') IN ('failed', 'failure', 'error') THEN 'failure'
        WHEN COALESCE(ae.payload->>'status', '') = 'warning' THEN 'warning'
        ELSE 'success'
      END AS result,
      CASE
        WHEN ae.event_type = 'approval_requested' THEN COALESCE(arq.requested_by::text, ae.actor_id::text)
        WHEN ae.event_type = 'approval_decision' THEN COALESCE(arq.approved_by::text, ae.actor_id::text)
        ELSE ae.actor_id::text
      END AS actor_id,
      CASE
        WHEN ae.event_type = 'approval_requested' THEN COALESCE(requested_user.email, event_actor.email)
        WHEN ae.event_type = 'approval_decision' THEN COALESCE(approved_user.email, event_actor.email)
        ELSE event_actor.email
      END AS actor_email,
      COALESCE(
        ae.payload->>'requestText',
        arq.summary,
        arq.reason,
        ae.payload->>'summary',
        ae.event_type
      ) AS request_text,
      COALESCE(ae.payload->>'summary', arq.summary, arq.reason, ae.payload->>'message') AS why,
      jsonb_strip_nulls(
        jsonb_build_object(
          'source', 'ai',
          'eventType', ae.event_type,
          'status', COALESCE(ae.payload->>'status', 'success'),
          'message', ae.payload->>'message',
          'requestText', COALESCE(
            ae.payload->>'requestText',
            arq.summary,
            arq.reason,
            ae.payload->>'summary',
            ae.event_type
          ),
          'summary', COALESCE(ae.payload->>'summary', arq.summary),
          'toolName', COALESCE(ae.payload->>'toolName', arq.tool_name),
          'actionType', COALESCE(ae.payload->>'actionType', arq.action_type),
          'approvalRequestId', ae.approval_request_id,
          'conversationId', COALESCE(ae.conversation_id, arq.conversation_id),
          'workflowId', COALESCE(ae.workflow_id, arq.workflow_id),
          'requestedById', arq.requested_by,
          'requestedByEmail', requested_user.email,
          'approvedById', arq.approved_by,
          'approvedByEmail', approved_user.email,
          'decisionAt', arq.updated_at,
          'executedById', CASE WHEN ae.event_type = 'execution_result' THEN ae.actor_id ELSE NULL END,
          'executedByEmail', CASE WHEN ae.event_type = 'execution_result' THEN event_actor.email ELSE NULL END,
          'preview', arq.preview,
          'executionPayload', COALESCE(ae.payload->'executionPayload', arq.execution_payload, '{}'::jsonb),
          'resultPayload', ae.payload
        )
      ) AS metadata,
      ae.created_at
    FROM ai_audit_events ae
    LEFT JOIN ai_action_requests arq ON arq.id = ae.approval_request_id
    LEFT JOIN users requested_user ON requested_user.id = arq.requested_by
    LEFT JOIN users approved_user ON approved_user.id = arq.approved_by
    LEFT JOIN users event_actor ON event_actor.id = ae.actor_id
    WHERE ae.tenant_id = $1
      AND ae.event_type IN ('approval_requested', 'approval_decision', 'execution_result')
      AND ($3::timestamptz IS NULL OR ae.created_at >= $3)
      AND ($4::timestamptz IS NULL OR ae.created_at <= $4)
  ) audit_events
`;

export async function queryAudit(req: Request, res: Response) {
  const { sizeId, from, to } = req.query as Record<string, string | undefined>;
  const rows = await query(
    `${unifiedAuditQuery}
     ORDER BY created_at DESC
     LIMIT 500`,
    [req.user!.tenantId, sizeId ?? null, from ?? null, to ?? null]
  );
  res.json(rows.rows);
}

export async function getAuditEvent(req: Request, res: Response) {
  const row = await query(
    `${unifiedAuditQuery}
     WHERE id = $5
     LIMIT 1`,
    [req.user!.tenantId, null, null, null, req.params.id]
  );
  if (row.rowCount === 0) return res.status(404).json({ message: 'Not found' });
  res.json(row.rows[0]);
}

export async function exportCsv(req: Request, res: Response) {
  const rows = await query(
    `${unifiedAuditQuery}
     ORDER BY created_at DESC
     LIMIT 10000`,
    [req.user!.tenantId, null, null, null]
  );

  const header =
    'id,source,action,module,entity_type,entity_id,result,actor_id,actor_email,request_text,why,created_at,metadata\n';
  const csv = rows.rows
    .map((row) =>
      [
        row.id,
        row.source ?? '',
        row.action ?? '',
        row.module ?? '',
        row.entity_type ?? '',
        row.entity_id ?? '',
        row.result ?? '',
        row.actor_id ?? '',
        row.actor_email ?? '',
        JSON.stringify(row.request_text ?? ''),
        JSON.stringify(row.why ?? ''),
        row.created_at,
        JSON.stringify(row.metadata ?? {}),
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.send(header + csv);
}

export async function exportPdf(_req: Request, res: Response) {
  res.status(501).json({ message: 'PDF export not implemented yet' });
}
