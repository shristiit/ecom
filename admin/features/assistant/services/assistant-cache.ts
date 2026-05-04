import type {
  AssistantConversation,
  AssistantConversationSummary,
  AssistantMessage,
  AssistantMessageBlock,
  AssistantMessagePage,
} from '../types/assistant.types';

function dedupeMessages(messages: AssistantMessage[]) {
  const seen = new Set<string>();
  const deduped: AssistantMessage[] = [];

  messages.forEach((message) => {
    if (seen.has(message.id)) return;
    seen.add(message.id);
    deduped.push(message);
  });

  deduped.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  return deduped;
}

function messagePreviewFromBlocks(blocks: AssistantMessageBlock[]) {
  for (const block of blocks) {
    if (block.type === 'text' && block.content.trim()) return block.content.trim();
    if (block.type === 'clarification' && block.prompt.trim()) return block.prompt.trim();
    if (block.type === 'preview' && block.actionType.trim()) return block.actionType.trim();
    if ((block.type === 'success' || block.type === 'error') && block.message.trim()) return block.message.trim();
    if ((block.type === 'approval_pending' || block.type === 'approval_result') && block.message.trim()) return block.message.trim();
  }

  return null;
}

export function createOptimisticUserMessage(content: string): AssistantMessage {
  const now = new Date().toISOString();
  return {
    id: `optimistic-user-${now}-${Math.random().toString(36).slice(2, 10)}`,
    role: 'user',
    createdAt: now,
    blocks: [{ type: 'text', content }],
  };
}

export function createStreamingAssistantMessage(content: string): AssistantMessage {
  const now = new Date().toISOString();
  return {
    id: `streaming-assistant-${now}`,
    role: 'assistant',
    createdAt: now,
    blocks: content.trim() ? [{ type: 'text', content }] : [],
  };
}

export function mergeAssistantConversationPage(
  existing: AssistantConversation | null,
  incoming: AssistantConversation,
  mode: 'replace-latest' | 'prepend-older',
): AssistantConversation {
  if (!existing) {
    return incoming;
  }

  if (mode === 'prepend-older') {
    return {
      ...existing,
      conversation: incoming.conversation,
      workflow: incoming.workflow,
      pendingAction: incoming.pendingAction,
      messagePage: incoming.messagePage,
      messages: dedupeMessages([...incoming.messages, ...existing.messages]),
    };
  }

  const incomingIds = new Set(incoming.messages.map((message) => message.id));
  const olderMessages = existing.messages.filter((message) => !incomingIds.has(message.id)).filter((message) => {
    const firstIncoming = incoming.messages[0];
    if (!firstIncoming) return true;
    return new Date(message.createdAt).getTime() < new Date(firstIncoming.createdAt).getTime();
  });

  return {
    ...existing,
    conversation: incoming.conversation,
    workflow: incoming.workflow,
    pendingAction: incoming.pendingAction,
    messagePage: incoming.messagePage,
    messages: dedupeMessages([...olderMessages, ...incoming.messages]),
  };
}

export function updateAssistantConversationSummaryCache(
  existing: AssistantConversationSummary[] | null,
  conversation: AssistantConversation,
): AssistantConversationSummary[] {
  const lastMessage = conversation.messages[conversation.messages.length - 1] ?? null;
  const lastMessagePreview = lastMessage ? messagePreviewFromBlocks(lastMessage.blocks) : null;
  const lastRole = lastMessage?.role ?? null;

  const nextItem: AssistantConversationSummary = {
    id: conversation.conversation.id,
    title: conversation.conversation.title,
    createdAt: conversation.conversation.createdAt,
    updatedAt: conversation.conversation.updatedAt,
    lastMessagePreview,
    lastRole,
  };

  const filtered = (existing ?? []).filter((item) => item.id !== nextItem.id);
  return [nextItem, ...filtered].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

export function appendAssistantConversationMessage(
  conversation: AssistantConversation | null,
  message: AssistantMessage,
): AssistantConversation | null {
  if (!conversation) return conversation;
  return {
    ...conversation,
    messages: dedupeMessages([...conversation.messages, message]),
  };
}

export function emptyMessagePage(): AssistantMessagePage {
  return {
    nextCursorCreatedAt: null,
    nextCursorId: null,
    hasMore: false,
  };
}
