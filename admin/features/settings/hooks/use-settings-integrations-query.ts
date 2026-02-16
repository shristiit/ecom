import { queryKeys, useQuery } from '@/lib/query';
import { settingsService } from '../services/settings.service';

export function useSettingsIntegrationsQuery(enabled = true) {
  return useQuery({
    key: [...queryKeys.settings.tenant(), 'integrations'],
    enabled,
    queryFn: () => settingsService.listIntegrations(),
  });
}
