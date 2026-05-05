import { queryKeys, useQuery } from '@admin/lib/query';
import { assistantService } from '../services/assistant.service';

export function useAssistantConversationQuery(id: string | undefined, enabled = true) {
  return useQuery({
    key: queryKeys.assistant.conversation(id ?? 'unknown'),
    enabled: enabled && Boolean(id),
    queryFn: () => assistantService.getConversation(id ?? ''),
    manualInvalidationOnly: false,
    staleTimeMs: 5 * 60 * 1000,
    gcTimeMs: 30 * 60 * 1000,
  });
}
