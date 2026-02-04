import { Request, Response } from 'express';
import { z } from 'zod';
import fetch from 'node-fetch';
import { CONVERSATIONAL_ENGINE_URL } from '../../config/env.js';
import { query } from '../../db/pool.js';

const interpretSchema = z.object({
  text: z.string().min(1),
  conversationId: z.string().uuid().optional(),
});

const confirmSchema = z.object({
  transactionSpecId: z.string().uuid(),
  confirm: z.boolean(),
});

const approveSchema = z.object({
  approvalId: z.string().uuid(),
  approve: z.boolean(),
});

export async function interpret(req: Request, res: Response) {
  const parsed = interpretSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const { text, conversationId } = parsed.data;

  const convoId = conversationId ?? (await createConversation(req.user!.tenantId, req.user!.id));

  await query(
    `INSERT INTO conversation_turns (tenant_id, conversation_id, role, content)
     VALUES ($1,$2,'user',$3)`,
    [req.user!.tenantId, convoId, text]
  );

  const response = await fetch(`${CONVERSATIONAL_ENGINE_URL}/interpret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, tenantId: req.user!.tenantId }),
  });

  if (!response.ok) return res.status(502).json({ message: 'Conversational engine error' });
  const spec = await response.json();

  const specRes = await query(
    `INSERT INTO transaction_specs (tenant_id, intent, entities, quantities, constraints, confidence, governance_decision, status, created_by, conversation_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'proposed',$8,$9) RETURNING id`,
    [
      req.user!.tenantId,
      spec.intent,
      spec.entities ?? {},
      spec.quantities ?? {},
      spec.constraints ?? {},
      spec.confidence ?? 0,
      spec.governanceDecision ?? {},
      req.user!.id,
      convoId,
    ]
  );

  await query(
    `INSERT INTO conversation_turns (tenant_id, conversation_id, role, content, metadata)
     VALUES ($1,$2,'assistant',$3,$4)`,
    [req.user!.tenantId, convoId, spec.summary ?? 'Proposed action', spec]
  );

  res.json({ conversationId: convoId, transactionSpecId: specRes.rows[0].id, spec });
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

async function createConversation(tenantId: string, userId: string) {
  const res = await query(
    `INSERT INTO conversations (tenant_id, created_by) VALUES ($1,$2) RETURNING id`,
    [tenantId, userId]
  );
  return res.rows[0].id;
}
