import { get, post } from '@/lib/api';
import type { AIApproval, AIHistoryItem, AIInterpretResponse, AINavigationResponse, AISendResponse, AIThread, AIThreadSummary } from '../types';

type ThreadSummaryRow = {
  id: string;
  created_by: string;
  created_at: string;
  last_message_at?: string | null;
  last_assistant_message?: string | null;
  turn_count: number;
};

type ApprovalRow = {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  transaction_spec_id: string;
  requested_by: string;
  approved_by?: string | null;
  created_at: string;
  intent?: string;
  confidence?: number;
  conversation_id?: string;
};

type HistoryRow = {
  id: string;
  transaction_id: string;
  request_text: string;
  why?: string;
  created_at: string;
  movement_type?: string;
  quantity?: number;
  recorded_time?: string;
};

type ThreadResponse = {
  conversation: {
    id: string;
    created_by: string;
    created_at: string;
  };
  turns: Array<{
    role: string;
    content: string;
    metadata?: Record<string, unknown>;
    created_at: string;
  }>;
};

export const aiService = {
  async listThreads() {
    const payload = await get<ThreadSummaryRow[]>('/chat/threads');
    return payload.map(
      (row) =>
        ({
          id: row.id,
          createdBy: row.created_by,
          createdAt: row.created_at,
          lastMessageAt: row.last_message_at ?? null,
          lastAssistantMessage: row.last_assistant_message ?? null,
          turnCount: Number(row.turn_count ?? 0),
        }) satisfies AIThreadSummary,
    );
  },

  async getThread(id: string) {
    const payload = await get<ThreadResponse>(`/chat/thread/${id}`);
    return {
      conversation: {
        id: payload.conversation.id,
        createdBy: payload.conversation.created_by,
        createdAt: payload.conversation.created_at,
      },
      turns: payload.turns.map((turn) => ({
        role: turn.role,
        content: turn.content,
        metadata: turn.metadata,
        createdAt: turn.created_at,
      })),
    } satisfies AIThread;
  },

  async listApprovals() {
    const payload = await get<ApprovalRow[]>('/chat/approvals');
    return payload.map(
      (row) =>
        ({
          id: row.id,
          status: row.status,
          transactionSpecId: row.transaction_spec_id,
          requestedBy: row.requested_by,
          approvedBy: row.approved_by,
          createdAt: row.created_at,
          intent: row.intent,
          confidence: row.confidence,
          conversationId: row.conversation_id,
        }) satisfies AIApproval,
    );
  },

  async listHistory() {
    const payload = await get<HistoryRow[]>('/chat/history');
    return payload.map(
      (row) =>
        ({
          id: row.id,
          transactionId: row.transaction_id,
          requestText: row.request_text,
          why: row.why,
          createdAt: row.created_at,
          movementType: row.movement_type,
          quantity: row.quantity,
          recordedTime: row.recorded_time,
        }) satisfies AIHistoryItem,
    );
  },

  interpret: (input: { text: string; conversationId?: string }) =>
    post<AIInterpretResponse, { text: string; conversationId?: string }>('/chat/interpret', input),

  navigate: (input: { text: string; conversationId?: string }) =>
    post<AINavigationResponse, { text: string; conversationId?: string }>('/chat/navigate', input),

  send: (input: { text: string; conversationId?: string }) =>
    post<AISendResponse, { text: string; conversationId?: string }>('/chat/respond', input),

  confirm: (input: { transactionSpecId: string; confirm: boolean }) =>
    post<{ status: string }, { transactionSpecId: string; confirm: boolean }>('/chat/confirm', input),

  approve: (input: { approvalId: string; approve: boolean }) =>
    post<{ status: string }, { approvalId: string; approve: boolean }>('/chat/approve', input),

  execute: (input: { transactionSpecId: string }) =>
    post<{ executed: boolean; result: Record<string, unknown> }, { transactionSpecId: string }>('/chat/execute', input),
};
