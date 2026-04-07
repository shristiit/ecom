import { queryKeys, useQuery } from '@admin/lib/query';
import { aiService } from '../services';

export function useAiThreadsQuery(enabled = true) {
  return useQuery({
    key: queryKeys.ai.threads(),
    enabled,
    queryFn: () => aiService.listThreads(),
  });
}
