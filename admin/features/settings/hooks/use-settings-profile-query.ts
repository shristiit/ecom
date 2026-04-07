import { queryKeys, useQuery } from '@admin/lib/query';
import { settingsService } from '../services/settings.service';

export function useSettingsProfileQuery(enabled = true) {
  return useQuery({
    key: [...queryKeys.settings.tenant(), 'profile'],
    enabled,
    queryFn: () => settingsService.getProfile(),
  });
}
