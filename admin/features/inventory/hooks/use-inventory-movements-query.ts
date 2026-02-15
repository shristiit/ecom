import { useMemo } from 'react';
import { queryKeys, useQuery } from '@/lib/query';
import { inventoryService } from '../services/inventory.service';
import type { InventoryMovementsFilter } from '../types/inventory.types';

export function useInventoryMovementsQuery(filters?: InventoryMovementsFilter, enabled = true) {
  const filterKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);

  return useQuery({
    key: queryKeys.inventory.movements(filterKey),
    enabled,
    queryFn: () => inventoryService.listMovements(filters),
  });
}
