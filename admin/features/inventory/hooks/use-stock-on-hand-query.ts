import { useMemo } from 'react';
import { queryKeys, useQuery } from '@admin/lib/query';
import { inventoryService } from '../services/inventory.service';
import type { StockOnHandFilter } from '../types/inventory.types';

export function useStockOnHandQuery(filters?: StockOnHandFilter, enabled = true) {
  const filterKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);

  return useQuery({
    key: [...queryKeys.inventory.stockOnHand(), filterKey],
    enabled,
    queryFn: () => inventoryService.getStockOnHand(filters),
  });
}
