import { queryKeys, useQuery } from '@/lib/query';
import { masterService } from '../services/master.service';

export function useMasterLocationsQuery(enabled = true) {
  return useQuery({
    key: [...queryKeys.settings.tenant(), 'master', 'locations'],
    enabled,
    queryFn: () => masterService.listLocations(),
  });
}
