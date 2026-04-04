import { Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';

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
         COALESCE(ae.payload->>'resultId', ae.payload->>'transactionId', ae.id::text) AS transaction_id,
         COALESCE(ae.payload->>'requestText', ae.payload->>'summary', ae.event_type) AS request_text,
         COALESCE(ae.payload->>'summary', ae.payload->>'message') AS why,
         ae.created_at,
         COALESCE(ae.payload->>'actionType', ae.event_type) AS movement_type,
         CASE
           WHEN (ae.payload->>'quantity') ~ '^[0-9]+$' THEN (ae.payload->>'quantity')::int
           ELSE NULL
         END AS quantity,
         ae.created_at AS recorded_time
       FROM ai_audit_events ae
       WHERE ae.tenant_id = $1
         AND ae.event_type = 'execution_result'

       UNION ALL

       SELECT
         ar.id,
         ar.transaction_id::text,
         ar.request_text,
         ar.why,
         ar.created_at,
         it.type::text AS movement_type,
         it.quantity,
         it.recorded_time
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
