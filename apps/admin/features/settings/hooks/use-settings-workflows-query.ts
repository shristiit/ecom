import { queryKeys, useQuery } from '@/lib/query';
import { settingsService } from '../services/settings.service';

export function useSettingsWorkflowsQuery(enabled = true) {
  return useQuery({
    key: [...queryKeys.settings.tenant(), 'workflows'],
    enabled,
    queryFn: () => settingsService.listWorkflows(),
  });
}
