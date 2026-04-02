import { queryKeys, useQuery } from '@/lib/query';
import { assistantService } from '../services/assistant.service';

export function useAssistantConversationQuery(id: string | undefined, enabled = true) {
  return useQuery({
    key: queryKeys.assistant.conversation(id ?? 'unknown'),
    enabled: enabled && Boolean(id),
    queryFn: () => assistantService.getConversation(id ?? ''),
  });
}
