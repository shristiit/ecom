export type AssistantPendingActionType = 'confirm' | 'cancel' | 'edit' | 'submit_for_approval';

export type AssistantMessageBlock =
  | {
      type: 'text';
      content: string;
    }
  | {
      type: 'clarification';
      prompt: string;
      requiredFields?: string[];
    }
  | {
      type: 'preview';
      actionType: string;
      actor: string;
      entities?: Array<{ label: string; value: string }>;
      warnings?: string[];
      approvalRequired?: boolean;
      nextStep: string;
    }
  | {
      type: 'confirmation_required';
      prompt: string;
      allowedActions?: AssistantPendingActionType[];
    }
  | {
      type: 'approval_pending' | 'approval_result';
      approvalId: string;
      status: string;
      message: string;
    }
  | {
      type: 'success' | 'error';
      title: string;
      message: string;
    }
  | {
      type: 'navigation';
      label: string;
      href: string;
      description: string;
    }
  | {
      type: 'table_result';
      title: string;
      columns?: Array<{ key: string; label: string }>;
      rows?: Array<Record<string, unknown>>;
    };

export type AssistantMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | string;
  blocks: AssistantMessageBlock[];
  createdAt: string;
};

export type AssistantConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview?: string | null;
  lastRole?: string | null;
};

export type AssistantWorkflowState = {
  id: string;
  status: string;
  currentTask?: string | null;
  extractedEntities?: Record<string, unknown>;
  missingFields?: string[];
  activePreviewId?: string | null;
  activeApprovalId?: string | null;
};

export type AssistantPendingAction = {
  workflowId: string;
  actions: AssistantPendingActionType[];
  prompt: string;
};

export type AssistantConversation = {
  conversation: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  };
  workflow?: AssistantWorkflowState | null;
  messages: AssistantMessage[];
  pendingAction?: AssistantPendingAction | null;
};

export type AssistantDecisionResponse = {
  workflowId: string;
  accepted: boolean;
  message: string;
};

export type AssistantApproval = {
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

export type AssistantHistoryItem = {
  id: string;
  transactionId: string;
  requestText: string;
  why?: string | null;
  createdAt: string;
  movementType?: string | null;
  quantity?: number | null;
  recordedTime?: string | null;
};
