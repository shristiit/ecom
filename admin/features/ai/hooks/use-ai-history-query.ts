import { queryKeys, useQuery } from '@/lib/query';
import { aiService } from '../services';

export function useAiHistoryQuery(enabled = true) {
  return useQuery({
    key: queryKeys.ai.history(),
    enabled,
    queryFn: () => aiService.listHistory(),
  });
}
