import { Request, Response } from 'express';
import { query } from '@backend/db/pool.js';
import { logger } from '@backend/utils/logger.js';
import { executeSpec } from '@backend/modules/chat/execute.js';
import { resolveNavigation } from '@backend/modules/chat/navigation.js';
import { orchestrateChat } from '@backend/modules/chat/orchestrator.js';
import { interpretTransaction } from '@backend/modules/chat/transaction-tool.js';
import {
  approveSchema,
  confirmSchema,
  executeSchema,
  interpretSchema,
  navigateSchema,
  respondSchema,
} from '@backend/modules/chat/schemas.js';

export async function listThreads(req: Request, res: Response) {
  const rows = await query(
    `SELECT
       c.id,
       c.created_by,
       c.created_at,
       MAX(t.created_at) AS last_message_at,
       MAX(CASE WHEN t.role = 'assistant' THEN t.content ELSE '' END) AS last_assistant_message,
       COUNT(t.id)::int AS turn_count
     FROM conversations c
     LEFT JOIN conversation_turns t ON t.conversation_id = c.id AND t.tenant_id = c.tenant_id
     WHERE c.tenant_id = $1
     GROUP BY c.id, c.created_by, c.created_at
     ORDER BY MAX(t.created_at) DESC NULLS LAST
     LIMIT 200`,
    [req.user!.tenantId]
  );
  res.json(rows.rows);
}

export async function listApprovals(req: Request, res: Response) {
  const rows = await query(
    `SELECT
       a.id,
       a.status,
       a.transaction_spec_id,
       a.requested_by,
       a.approved_by,
       a.created_at,
       ts.intent,
       ts.confidence,
       ts.conversation_id
     FROM approvals a
     JOIN transaction_specs ts ON ts.id = a.transaction_spec_id
     WHERE a.tenant_id = $1
     ORDER BY a.created_at DESC
     LIMIT 300`,
    [req.user!.tenantId]
  );
  res.json(rows.rows);
}

export async function listHistory(req: Request, res: Response) {
  const rows = await query(
    `SELECT
       ar.id,
       ar.transaction_id,
       ar.request_text,
       ar.why,
       ar.created_at,
       it.type AS movement_type,
       it.quantity,
       it.recorded_time
     FROM audit_records ar
     LEFT JOIN inventory_transactions it ON it.id = ar.transaction_id
     WHERE ar.tenant_id = $1
     ORDER BY ar.created_at DESC
     LIMIT 500`,
    [req.user!.tenantId]
  );
  res.json(rows.rows);
}

export async function navigate(req: Request, res: Response) {
  try {
    const parsed = navigateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
    const result = await resolveNavigation({
      text: parsed.data.text,
      tenantId: req.user!.tenantId,
      conversationId: parsed.data.conversationId,
    });
    res.json(result);
  } catch (error) {
    logger.error({ error }, 'chat navigate failed');
    return res.status(502).json({ message: 'Failed to resolve navigation request' });
  }
}

export async function respond(req: Request, res: Response) {
  try {
    const parsed = respondSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

    const result = await orchestrateChat({
      text: parsed.data.text,
      tenantId: req.user!.tenantId,
      userId: req.user!.id,
      conversationId: parsed.data.conversationId,
    });

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'chat respond failed');
    return res.status(502).json({ message: error instanceof Error ? error.message : 'Failed to process prompt' });
  }
}

export async function interpret(req: Request, res: Response) {
  try {
    const parsed = interpretSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
    const result = await interpretTransaction({
      text: parsed.data.text,
      tenantId: req.user!.tenantId,
      userId: req.user!.id,
      conversationId: parsed.data.conversationId,
    });
    res.json(result);
  } catch (error) {
    logger.error({ error }, 'chat interpret failed');
    return res.status(502).json({ message: error instanceof Error ? error.message : 'Failed to interpret prompt' });
  }
}

export async function confirm(req: Request, res: Response) {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const { transactionSpecId, confirm } = parsed.data;

  const status = confirm ? 'confirmed' : 'rejected';
  await query(
    `UPDATE transaction_specs SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
    [status, transactionSpecId, req.user!.tenantId]
  );
  res.json({ status });
}

export async function approve(req: Request, res: Response) {
  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const { approvalId, approve } = parsed.data;

  const status = approve ? 'approved' : 'rejected';
  await query(
    `UPDATE approvals SET status = $1, approved_by = $2, updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4`,
    [status, req.user!.id, approvalId, req.user!.tenantId]
  );
  if (approve) {
    await query(
      `UPDATE transaction_specs SET status = 'approved', updated_at = NOW()
       WHERE id = (SELECT transaction_spec_id FROM approvals WHERE id = $1)`,
      [approvalId]
    );
  }
  res.json({ status });
}

export async function thread(req: Request, res: Response) {
  const convo = await query(
    `SELECT id, created_by, created_at FROM conversations WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.user!.tenantId]
  );
  if (convo.rowCount === 0) return res.status(404).json({ message: 'Not found' });
  const turns = await query(
    `SELECT role, content, metadata, created_at FROM conversation_turns
     WHERE conversation_id = $1 AND tenant_id = $2 ORDER BY created_at`,
    [req.params.id, req.user!.tenantId]
  );
  res.json({ conversation: convo.rows[0], turns: turns.rows });
}

export async function execute(req: Request, res: Response) {
  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const { transactionSpecId } = parsed.data;

  const specRes = await query(
    `SELECT id, intent, entities, quantities, constraints, governance_decision, status, conversation_id
     FROM transaction_specs WHERE id = $1 AND tenant_id = $2`,
    [transactionSpecId, req.user!.tenantId]
  );
  if (specRes.rowCount === 0) return res.status(404).json({ message: 'Spec not found' });

  const spec = specRes.rows[0];
  if (spec.status !== 'confirmed' && spec.status !== 'approved') {
    return res.status(409).json({ message: 'Spec not confirmed' });
  }

  if (spec.governance_decision?.requiresApproval && spec.status !== 'approved') {
    return res.status(403).json({ message: 'Approval required' });
  }

  if (spec.governance_decision?.requiresApproval) {
    const approval = await query(
      `SELECT id, status FROM approvals WHERE transaction_spec_id = $1 AND tenant_id = $2`,
      [spec.id, req.user!.tenantId]
    );
    if (approval.rowCount === 0 || approval.rows[0].status !== 'approved') {
      return res.status(403).json({ message: 'Approval required' });
    }
    spec.approvalId = approval.rows[0].id;
  }

  const result = await executeSpec(req.user!.tenantId, req.user!.id, spec);

  // audit binding: store request text if available
  const textRes = await query(
    `SELECT content FROM conversation_turns
     WHERE conversation_id = $1 AND role = 'user'
     ORDER BY created_at ASC LIMIT 1`,
    [spec.conversation_id]
  );

  const transactionId =
    result && typeof result === 'object' && 'transactionId' in result
      ? String((result as { transactionId?: string }).transactionId ?? '')
      : '';

  if (transactionId) {
    await query(
      `INSERT INTO audit_records (tenant_id, transaction_id, request_text, who, approver, before_after, why)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.user!.tenantId, transactionId, textRes.rows[0]?.content ?? '', req.user!.id, null, {}, spec.intent]
    );
  }

  res.json({ executed: true, result });
}
