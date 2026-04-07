import { logger } from '@backend/utils/logger.js';
import { resolveNavigation } from '@backend/modules/chat/navigation.js';
import { interpretTransaction } from '@backend/modules/chat/transaction-tool.js';
import { selectToolDeterministically, selectToolWithOpenAI } from '@backend/modules/chat/tool-selection.js';

import { AgentResponse, OrchestratorInput, ToolSelection } from '@backend/modules/chat/types.js';

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
