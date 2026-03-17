import fetch from 'node-fetch';
import { CONVERSATIONAL_ENGINE_URL } from '../../config/env.js';
import { query } from '../../db/pool.js';
import { logger } from '../../utils/logger.js';

type InterpretTransactionInput = {
  text: string;
  tenantId: string;
  userId: string;
  conversationId?: string;
};

type InterpretTransactionResult = {
  conversationId: string;
  transactionSpecId: string;
  spec: Record<string, unknown>;
};

export async function interpretTransaction(input: InterpretTransactionInput): Promise<InterpretTransactionResult> {
  const convoId = input.conversationId ?? (await createConversation(input.tenantId, input.userId));

  await query(
    `INSERT INTO conversation_turns (tenant_id, conversation_id, role, content)
     VALUES ($1,$2,'user',$3)`,
    [input.tenantId, convoId, input.text]
  );

  let response;
  try {
    response = await fetch(`${CONVERSATIONAL_ENGINE_URL}/interpret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input.text, tenantId: input.tenantId }),
    });
  } catch (error) {
    logger.warn({ error }, 'conversational engine request failed');
    throw new Error('Conversational engine unavailable. Please try again later.');
  }

  if (!response.ok) {
    throw new Error('Conversational engine error');
  }

  let spec: any;
  try {
    spec = await response.json();
  } catch {
    throw new Error('Conversational engine returned invalid payload');
  }

  const specRes = await query(
    `INSERT INTO transaction_specs (tenant_id, intent, entities, quantities, constraints, confidence, governance_decision, status, created_by, conversation_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'proposed',$8,$9) RETURNING id`,
    [
      input.tenantId,
      spec.intent,
      spec.entities ?? {},
      spec.quantities ?? {},
      spec.constraints ?? {},
      spec.confidence ?? 0,
      spec.governanceDecision ?? {},
      input.userId,
      convoId,
    ]
  );

  await query(
    `INSERT INTO conversation_turns (tenant_id, conversation_id, role, content, metadata)
     VALUES ($1,$2,'assistant',$3,$4)`,
    [input.tenantId, convoId, spec.summary ?? 'Proposed action', spec]
  );

  if (spec.governanceDecision?.requiresApproval) {
    const roleRes = await query(
      `SELECT id FROM roles WHERE tenant_id = $1 AND name = 'admin'`,
      [input.tenantId]
    );
    const requiredRoleId = roleRes.rowCount ? roleRes.rows[0].id : null;
    if (requiredRoleId) {
      await query(
        `INSERT INTO approvals (tenant_id, status, required_role_id, requested_by, transaction_spec_id)
         VALUES ($1,'pending',$2,$3,$4)`,
        [input.tenantId, requiredRoleId, input.userId, specRes.rows[0].id]
      );
    }
  }

  return {
    conversationId: convoId,
    transactionSpecId: specRes.rows[0].id,
    spec,
  };
}

async function createConversation(tenantId: string, userId: string) {
  const res = await query(
    `INSERT INTO conversations (tenant_id, created_by) VALUES ($1,$2) RETURNING id`,
    [tenantId, userId]
  );
  return res.rows[0].id;
}
