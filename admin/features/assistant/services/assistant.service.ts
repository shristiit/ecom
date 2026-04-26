import { engineGet, enginePost, engineStream } from '@admin/lib/engine-client';
import type {
  AssistantApproval,
  AssistantConversation,
  AssistantConversationSummary,
  AssistantDecisionResponse,
  AssistantHistoryItem,
  AssistantRunEvent,
} from '../types/assistant.types';

type ConversationSummaryRow = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview?: string | null;
  lastRole?: string | null;
};

type ConversationListResponse = {
  items: ConversationSummaryRow[];
};

type ApprovalRow = {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  transactionSpecId: string;
  requestedBy: string;
  approvedBy?: string | null;
  createdAt: string;
  intent?: string | null;
  confidence?: number | null;
  conversationId?: string | null;
};

type HistoryRow = {
  id: string;
  transactionId: string;
  requestText: string;
  why?: string | null;
  createdAt: string;
  movementType?: string | null;
  quantity?: number | null;
  recordedTime?: string | null;
  source?: string | null;
  requestedBy?: string | null;
  approvedBy?: string | null;
  executedBy?: string | null;
  toolName?: string | null;
  status?: string | null;
};

export const assistantService = {
  async listConversations() {
    const payload = await engineGet<ConversationListResponse>('/api/chat/conversations');
    return payload.items.map(
      (item) =>
        ({
          id: item.id,
          title: item.title,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          lastMessagePreview: item.lastMessagePreview ?? null,
          lastRole: item.lastRole ?? null,
        }) satisfies AssistantConversationSummary,
    );
  },

  getConversation(id: string) {
    return engineGet<AssistantConversation>(`/api/chat/conversations/${id}`);
  },

  createConversation(input: { title?: string; initialMessage?: string | null }) {
    return enginePost<AssistantConversation, { title?: string; initialMessage?: string | null }>(
      '/api/chat/conversations',
      input,
    );
  },

  sendMessage(input: { conversationId: string; content: string }) {
    return enginePost<AssistantConversation, { content: string }>(
      `/api/chat/conversations/${input.conversationId}/messages`,
      { content: input.content },
    );
  },

  async streamRun(
    input: { conversationId?: string; title?: string | null; content: string; attachments?: Array<{ dataUrl: string; filename?: string }> },
    onEvent: (event: AssistantRunEvent) => void | Promise<void>,
  ): Promise<{ runId: string | null; conversationId: string | null; workflowId: string | null }> {
    let latestEvent: AssistantRunEvent | null = null;
    await engineStream<AssistantRunEvent, typeof input>(
      '/api/chat/runs/stream',
      input,
      async (event) => {
        latestEvent = event;
        await onEvent(event);
      },
    );
    const finalEvent = latestEvent as AssistantRunEvent | null;
    return {
      runId: finalEvent?.runId ?? null,
      conversationId: finalEvent?.conversationId ?? input.conversationId ?? null,
      workflowId: finalEvent?.workflowId ?? null,
    };
  },

  decide(input: { workflowId: string; decision: string; note?: string }) {
    return enginePost<AssistantDecisionResponse, { decision: string; note?: string }>(
      `/api/chat/workflows/${input.workflowId}/decision`,
      { decision: input.decision, note: input.note },
    );
  },

  async listApprovals() {
    const payload = await engineGet<ApprovalRow[]>('/api/chat/approvals');
    return payload.map(
      (item) =>
        ({
          id: item.id,
          status: item.status,
          transactionSpecId: item.transactionSpecId,
          requestedBy: item.requestedBy,
          approvedBy: item.approvedBy ?? null,
          createdAt: item.createdAt,
          intent: item.intent ?? null,
          confidence: item.confidence ?? null,
          conversationId: item.conversationId ?? null,
        }) satisfies AssistantApproval,
    );
  },

  decideApproval(input: { approvalId: string; approve: boolean }) {
    return enginePost<{ status: string }, { approve: boolean }>(
      `/api/chat/approvals/${input.approvalId}/decision`,
      { approve: input.approve },
    );
  },

  async listHistory() {
    const payload = await engineGet<HistoryRow[]>('/api/chat/history');
    return payload.map(
      (item) =>
        ({
          id: item.id,
          transactionId: item.transactionId,
          requestText: item.requestText,
          why: item.why ?? null,
          createdAt: item.createdAt,
          movementType: item.movementType ?? null,
          quantity: item.quantity ?? null,
          recordedTime: item.recordedTime ?? null,
          source: item.source ?? null,
          requestedBy: item.requestedBy ?? null,
          approvedBy: item.approvedBy ?? null,
          executedBy: item.executedBy ?? null,
          toolName: item.toolName ?? null,
          status: item.status ?? null,
        }) satisfies AssistantHistoryItem,
    );
  },
};
