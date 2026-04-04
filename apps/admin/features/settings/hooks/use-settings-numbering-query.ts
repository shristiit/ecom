import { queryKeys, useQuery } from '@/lib/query';
import { settingsService } from '../services/settings.service';

export function useSettingsNumberingQuery(enabled = true) {
  return useQuery({
    key: [...queryKeys.settings.tenant(), 'numbering'],
    enabled,
    queryFn: () => settingsService.getNumbering(),
  });
}
