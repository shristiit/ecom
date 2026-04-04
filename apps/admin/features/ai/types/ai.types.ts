export type AIThreadSummary = {
  id: string;
  createdBy: string;
  createdAt: string;
  lastMessageAt?: string | null;
  lastAssistantMessage?: string | null;
  turnCount: number;
};

export type AIApproval = {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  transactionSpecId: string;
  requestedBy: string;
  approvedBy?: string | null;
  createdAt: string;
  intent?: string;
  confidence?: number;
  conversationId?: string;
};

export type AIHistoryItem = {
  id: string;
  transactionId: string;
  requestText: string;
  why?: string;
  createdAt: string;
  movementType?: string;
  quantity?: number;
  recordedTime?: string;
};

export type AIThreadTurn = {
  role: 'user' | 'assistant' | string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type AIThread = {
  conversation: {
    id: string;
    createdBy: string;
    createdAt: string;
  };
  turns: AIThreadTurn[];
};

export type AIInterpretResponse = {
  conversationId: string;
  transactionSpecId: string;
  spec: Record<string, unknown>;
};

export type AINavigationResponse = {
  matched: boolean;
  href?: string;
  label?: string;
  reasoning: string;
};

export type AISendResponse =
  | {
      kind: 'navigation';
      tool: 'navigate_to_page';
      href: string;
      label?: string;
      reasoning: string;
    }
  | {
      kind: 'transaction';
      tool: 'interpret_transaction';
      conversationId: string;
      transactionSpecId: string;
      spec: Record<string, unknown>;
      reasoning: string;
    };
