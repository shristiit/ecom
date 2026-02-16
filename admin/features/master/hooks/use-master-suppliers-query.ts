import { queryKeys, useQuery } from '@/lib/query';
import { masterService } from '../services/master.service';

export function useMasterSuppliersQuery(enabled = true) {
  return useQuery({
    key: [...queryKeys.settings.tenant(), 'master', 'suppliers'],
    enabled,
    queryFn: () => masterService.listSuppliers(),
  });
}
