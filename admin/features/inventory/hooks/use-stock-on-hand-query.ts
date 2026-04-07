import { useMemo } from 'react';
import { queryKeys, useQuery } from '@admin/lib/query';
import { inventoryService } from '../services/inventory.service';

export function useStockOnHandQuery(filters?: { locationId?: string; sku?: string }, enabled = true) {
  const filterKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);

  return useQuery({
    key: [...queryKeys.inventory.stockOnHand(), filterKey],
    enabled,
    queryFn: () => inventoryService.getStockOnHand(filters),
  });
}
