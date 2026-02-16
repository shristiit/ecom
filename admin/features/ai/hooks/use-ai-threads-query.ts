import { queryKeys, useQuery } from '@/lib/query';
import { aiService } from '../services';

export function useAiThreadsQuery(enabled = true) {
  return useQuery({
    key: queryKeys.ai.threads(),
    enabled,
    queryFn: () => aiService.listThreads(),
  });
}
