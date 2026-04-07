import { queryKeys, useQuery } from '@admin/lib/query';
import { masterService } from '../services/master.service';

export function useMasterCategoriesQuery(enabled = true) {
  return useQuery({
    key: [...queryKeys.settings.tenant(), 'master', 'categories'],
    enabled,
    queryFn: () => masterService.listCategories(),
  });
}
