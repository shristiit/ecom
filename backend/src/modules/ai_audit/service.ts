import { Request, Response } from 'express';
import { z } from 'zod';
import { query } from '@backend/db/pool.js';

const auditEventSchema = z.object({
  conversationId: z.string().uuid().optional().nullable(),
  workflowId: z.string().uuid().optional().nullable(),
  approvalRequestId: z.string().uuid().optional().nullable(),
  eventType: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
});

export async function recordEvent(req: Request, res: Response) {
  const parsed = auditEventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  const result = await query(
    `INSERT INTO ai_audit_events
     (tenant_id, conversation_id, workflow_id, approval_request_id, actor_id, event_type, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, event_type, created_at`,
    [
      req.user!.tenantId,
      parsed.data.conversationId ?? null,
      parsed.data.workflowId ?? null,
      parsed.data.approvalRequestId ?? null,
      req.user!.id,
      parsed.data.eventType,
      parsed.data.payload,
    ]
  );

  return res.status(201).json(result.rows[0]);
}

export async function listHistory(req: Request, res: Response) {
  const rows = await query(
    `SELECT *
     FROM (
       SELECT
         ae.id,
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
         END AS transaction_id,
         COALESCE(
           ae.payload->>'requestText',
           ar.summary,
           ar.reason,
           ae.payload->>'summary',
           ae.event_type
         ) AS request_text,
         COALESCE(ae.payload->>'summary', ar.summary, ar.reason, ae.payload->>'message') AS why,
         ae.created_at,
         COALESCE(ae.payload->>'actionType', ar.action_type, ae.event_type) AS movement_type,
         CASE
           WHEN (ae.payload->>'quantity') ~ '^[0-9]+$' THEN (ae.payload->>'quantity')::int
           WHEN (ae.payload->'executionPayload'->>'quantity') ~ '^[0-9]+$' THEN (ae.payload->'executionPayload'->>'quantity')::int
           WHEN (ar.execution_payload->>'quantity') ~ '^[0-9]+$' THEN (ar.execution_payload->>'quantity')::int
           ELSE NULL
         END AS quantity,
         ae.created_at AS recorded_time,
         'ai'::text AS source,
         COALESCE(requested_user.email, ar.requested_by::text) AS requested_by,
         COALESCE(approved_user.email, ar.approved_by::text) AS approved_by,
         CASE
           WHEN ae.event_type = 'execution_result' THEN COALESCE(executor.email, ae.actor_id::text)
           ELSE NULL
         END AS executed_by,
         COALESCE(ae.payload->>'toolName', ar.tool_name) AS tool_name,
         COALESCE(
           ae.payload->>'status',
           CASE
             WHEN ae.event_type = 'approval_requested' THEN 'pending'
             WHEN ae.event_type = 'approval_decision' THEN 'approved'
             ELSE 'success'
           END
         ) AS status
       FROM ai_audit_events ae
       LEFT JOIN ai_action_requests ar ON ar.id = ae.approval_request_id
       LEFT JOIN users requested_user ON requested_user.id = ar.requested_by
       LEFT JOIN users approved_user ON approved_user.id = ar.approved_by
       LEFT JOIN users executor ON executor.id = ae.actor_id
       WHERE ae.tenant_id = $1
         AND ae.event_type IN ('approval_requested', 'approval_decision', 'execution_result')

       UNION ALL

       SELECT
         ar.id,
         ar.transaction_id::text,
         ar.request_text,
         ar.why,
         ar.created_at,
         it.type::text AS movement_type,
         it.quantity,
         it.recorded_time,
         'inventory'::text AS source,
         NULL::text AS requested_by,
         NULL::text AS approved_by,
         NULL::text AS executed_by,
         NULL::text AS tool_name,
         'success'::text AS status
       FROM audit_records ar
       LEFT JOIN inventory_transactions it ON it.id = ar.transaction_id
       WHERE ar.tenant_id = $1
     ) history
     ORDER BY created_at DESC
     LIMIT 500`,
    [req.user!.tenantId]
  );

  res.json(rows.rows);
}
