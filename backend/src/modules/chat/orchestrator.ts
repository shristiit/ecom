import fetch from 'node-fetch';
import { OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL } from '@backend/config/env.js';
import { query } from '@backend/db/pool.js';
import { logger } from '@backend/utils/logger.js';
import { resolveNavigation } from '@backend/modules/chat/navigation.js';
import { interpretTransaction } from '@backend/modules/chat/transaction-tool.js';

type OrchestratorInput = {
  text: string;
  tenantId: string;
  userId: string;
  conversationId?: string;
};

type ToolSelection = {
  tool: 'navigate_to_page' | 'interpret_transaction';
  reasoning: string;
};

type AgentResponse =
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

const TOOL_SELECTION_SCHEMA = {
  name: 'chat_tool_selection',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      tool: {
        type: 'string',
        enum: ['navigate_to_page', 'interpret_transaction'],
      },
      reasoning: { type: 'string' },
    },
    required: ['tool', 'reasoning'],
  },
} as const;

const ORCHESTRATOR_TIMEOUT_MS = 4_500;
const MAX_CONTEXT_TURNS = 8;

async function getConversationContext(tenantId: string, conversationId?: string) {
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

async function selectToolWithOpenAI(input: OrchestratorInput): Promise<ToolSelection> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const context = await getConversationContext(input.tenantId, input.conversationId);
  const prompt = `You are an orchestration layer for an admin AI copilot.

Choose exactly one tool for the current user request.

Available tools:
- navigate_to_page: use this when the main intent is to open or move to an admin page or workspace.
- interpret_transaction: use this when the user wants the system to understand an operational task, create a transaction spec, or continue a task-oriented AI conversation.

Guidelines:
- Choose navigate_to_page for requests like "go to products", "take me to transfers", or context-dependent follow-ups like "take me there".
- Choose interpret_transaction for requests like "transfer 5 units", "create a sales order", "receive stock", or any non-navigation business operation.
- If the user mentions both navigation and action, choose the primary immediate intent.

Conversation context:
${context.length > 0 ? context.join('\n') : 'No previous context.'}

Current user message:
${input.text}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ORCHESTRATOR_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        max_tokens: 80,
        messages: [
          {
            role: 'system',
            content: 'Select the best tool for the admin copilot request.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: TOOL_SELECTION_SCHEMA,
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const details = await response.text();
    logger.warn({ status: response.status, details }, 'chat orchestrator tool selection failed');
    throw new Error('Chat orchestrator tool selection failed');
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('Chat orchestrator returned an empty tool selection');
  }

  return JSON.parse(raw) as ToolSelection;
}

async function selectToolDeterministically(input: OrchestratorInput): Promise<ToolSelection> {
  const navigation = await resolveNavigation({
    text: input.text,
    tenantId: input.tenantId,
    conversationId: input.conversationId,
  });

  if (navigation.matched && navigation.href) {
    return {
      tool: 'navigate_to_page',
      reasoning: 'Selected navigation tool from deterministic route resolution fallback.',
    };
  }

  return {
    tool: 'interpret_transaction',
    reasoning: 'Selected transaction interpretation because no safe navigation target matched.',
  };
}

export async function orchestrateChat(input: OrchestratorInput): Promise<AgentResponse> {
  let selection: ToolSelection;
  try {
    selection = await selectToolWithOpenAI(input);
  } catch (error) {
    selection = await selectToolDeterministically(input);
    logger.warn(
      {
        error: error instanceof Error ? { name: error.name, message: error.message } : { message: 'Unknown error' },
        selectedTool: selection.tool,
      },
      'chat orchestrator fell back to deterministic tool selection'
    );
  }

  if (selection.tool === 'navigate_to_page') {
    const navigation = await resolveNavigation({
      text: input.text,
      tenantId: input.tenantId,
      conversationId: input.conversationId,
    });

    if (navigation.matched && navigation.href) {
      return {
        kind: 'navigation',
        tool: 'navigate_to_page',
        href: navigation.href,
        label: navigation.label,
        reasoning: selection.reasoning || navigation.reasoning,
      };
    }
  }

  const transaction = await interpretTransaction({
    text: input.text,
    tenantId: input.tenantId,
    userId: input.userId,
    conversationId: input.conversationId,
  });

  return {
    kind: 'transaction',
    tool: 'interpret_transaction',
    conversationId: transaction.conversationId,
    transactionSpecId: transaction.transactionSpecId,
    spec: transaction.spec,
    reasoning: selection.reasoning,
  };
}
