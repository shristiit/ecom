import { queryKeys, useQuery } from '@admin/lib/query';
import { aiService } from '../services';

export function useAiApprovalsQuery(enabled = true) {
  return useQuery({
    key: queryKeys.ai.approvals(),
    enabled,
    queryFn: () => aiService.listApprovals(),
  });
}
