import { queryKeys, useQuery } from '@admin/lib/query';
import { masterService } from '../services/master.service';

export function useMasterCustomersQuery(enabled = true) {
  return useQuery({
    key: [...queryKeys.settings.tenant(), 'master', 'customers'],
    enabled,
    queryFn: () => masterService.listCustomers(),
  });
}
