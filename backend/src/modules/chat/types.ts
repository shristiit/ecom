export type OrchestratorInput = {
  text: string;
  tenantId: string;
  userId: string;
  conversationId?: string;
};

export type ToolSelection = {
  tool: 'navigate_to_page' | 'interpret_transaction';
  reasoning: string;
};

export type AgentResponse =
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
