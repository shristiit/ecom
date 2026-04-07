import { queryKeys, useQuery } from '@admin/lib/query';
import { assistantService } from '../services/assistant.service';

export function useAssistantApprovalsQuery(enabled = true) {
  return useQuery({
    key: queryKeys.assistant.approvals(),
    enabled,
    queryFn: () => assistantService.listApprovals(),
  });
}
