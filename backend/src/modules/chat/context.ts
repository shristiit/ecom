import { query } from '@backend/db/pool.js';

const MAX_CONTEXT_TURNS = 8;

export async function getConversationContext(tenantId: string, conversationId?: string) {
  if (!conversationId) return [];
  const turns = await query<{ role: string; content: string }>(
    `SELECT role, content
     FROM conversation_turns
     WHERE tenant_id = $1 AND conversation_id = $2
     ORDER BY created_at DESC
     LIMIT ${MAX_CONTEXT_TURNS}`,
    [tenantId, conversationId]
  );
  return turns.rows.reverse().map((turn) => `${turn.role}: ${turn.content}`);
}
