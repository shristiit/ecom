import { Request, Response } from 'express';
import { z } from 'zod';
import { query } from '@backend/db/pool.js';

const readOnlyActions = new Set([
  'stock_query',
  'reporting_query',
  'navigation_help',
]);

const evaluateSchema = z.object({
  actionType: z.string().min(1),
  quantity: z.number().int().nonnegative().optional(),
});

const createRequestSchema = z.object({
  actionType: z.string().min(1),
  toolName: z.string().min(1),
  conversationId: z.string().uuid().optional().nullable(),
  workflowId: z.string().uuid().optional().nullable(),
  summary: z.string().optional().default(''),
  reason: z.string().optional().default(''),
  preview: z.record(z.string(), z.unknown()).optional().default({}),
  executionPayload: z.record(z.string(), z.unknown()).optional().default({}),
});

const approvalDecisionSchema = z.object({
  approve: z.boolean(),
});

function approvalReason(actionType: string) {
  if (readOnlyActions.has(actionType)) {
    return {
      requiresApproval: false,
      reason: 'Read-only actions do not require approval.',
    };
  }

  return {
    requiresApproval: true,
    reason: 'Phase 1 requires approval for every write action.',
  };
}

export async function evaluateAction(req: Request, res: Response) {
  const parsed = evaluateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  return res.json(approvalReason(parsed.data.actionType));
}

export async function createApprovalRequest(req: Request, res: Response) {
  const parsed = createRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  const decision = approvalReason(parsed.data.actionType);
  if (!decision.requiresApproval) {
    return res.status(400).json({ message: 'Approval request is only valid for governed actions' });
  }

  const result = await query(
    `INSERT INTO ai_action_requests
     (tenant_id, conversation_id, workflow_id, requested_by, action_type, tool_name, status, summary, reason, preview, execution_payload)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $10)
     RETURNING id, status, conversation_id, workflow_id, action_type, tool_name, summary, reason, preview, execution_payload, requested_by, approved_by, created_at, updated_at`,
    [
      req.user!.tenantId,
      parsed.data.conversationId ?? null,
      parsed.data.workflowId ?? null,
      req.user!.id,
      parsed.data.actionType,
      parsed.data.toolName,
      parsed.data.summary,
      parsed.data.reason,
      parsed.data.preview,
      parsed.data.executionPayload,
    ]
  );

  return res.status(201).json(result.rows[0]);
}

export async function getApprovalRequest(req: Request, res: Response) {
  const result = await query(
    `SELECT
       ar.id,
       ar.status,
       ar.conversation_id,
       ar.workflow_id,
       ar.action_type,
       ar.tool_name,
       ar.summary,
       ar.reason,
       ar.preview,
       ar.execution_payload,
       ar.result,
       ar.requested_by,
       ar.approved_by,
       ar.created_at,
       ar.updated_at
     FROM ai_action_requests ar
     WHERE ar.id = $1 AND ar.tenant_id = $2`,
    [req.params.id, req.user!.tenantId]
  );

  if (result.rowCount === 0) return res.status(404).json({ message: 'Approval request not found' });
  return res.json(result.rows[0]);
}

export async function listApprovals(req: Request, res: Response) {
  const rows = await query(
    `SELECT
       ar.id,
       ar.status,
       ar.id AS transaction_spec_id,
       COALESCE(requested_user.email, ar.requested_by::text) AS requested_by,
       COALESCE(approved_user.email, ar.approved_by::text) AS approved_by,
       ar.created_at,
       ar.action_type AS intent,
       NULL::real AS confidence,
       ar.conversation_id,
       ar.workflow_id,
       ar.summary,
       ar.reason
     FROM ai_action_requests ar
     LEFT JOIN users requested_user ON requested_user.id = ar.requested_by
     LEFT JOIN users approved_user ON approved_user.id = ar.approved_by
     WHERE ar.tenant_id = $1
     ORDER BY ar.created_at DESC
     LIMIT 300`,
    [req.user!.tenantId]
  );

  res.json(rows.rows);
}

export async function decideApproval(req: Request, res: Response) {
  const parsed = approvalDecisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  const status = parsed.data.approve ? 'approved' : 'rejected';

  const result = await query(
    `UPDATE ai_action_requests
     SET status = $1, approved_by = $2, updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4`,
    [status, req.user!.id, req.params.id, req.user!.tenantId]
  );

  if (result.rowCount === 0) return res.status(404).json({ message: 'Approval request not found' });

  res.json({ status });
}
