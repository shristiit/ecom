import { queryKeys, useQuery } from '@admin/lib/query';
import { assistantService } from '../services/assistant.service';

export function useAssistantConversationsQuery(enabled = true) {
  return useQuery({
    key: queryKeys.assistant.conversations(),
    enabled,
    queryFn: () => assistantService.listConversations(),
  });
}
