import { queryKeys, useQuery } from '@/lib/query';
import { assistantService } from '../services/assistant.service';

export function useAssistantHistoryQuery(enabled = true) {
  return useQuery({
    key: queryKeys.assistant.history(),
    enabled,
    queryFn: () => assistantService.listHistory(),
  });
}
