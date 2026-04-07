import { queryKeys, useQuery } from '@admin/lib/query';
import { aiService } from '../services';

export function useAiThreadQuery(id: string | undefined, enabled = true) {
  return useQuery({
    key: queryKeys.ai.thread(id ?? 'unknown'),
    enabled: enabled && Boolean(id),
    queryFn: () => aiService.getThread(id ?? ''),
  });
}
