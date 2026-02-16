import { queryKeys, useQuery } from '@/lib/query';
import { settingsService } from '../services/settings.service';

export function useSettingsAlertsQuery(enabled = true) {
  return useQuery({
    key: [...queryKeys.settings.tenant(), 'alerts'],
    enabled,
    queryFn: () => settingsService.listAlerts(),
  });
}
