import { useMemo } from 'react';
import { queryKeys, useQuery } from '@admin/lib/query';
import { ordersService } from '../services/orders.service';
import type { PurchaseOrdersFilter } from '../types/orders.types';

export function usePurchaseOrdersQuery(filters?: PurchaseOrdersFilter, enabled = true) {
  const filterKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);

  return useQuery({
    key: [...queryKeys.orders.purchase(), filterKey],
    enabled,
    queryFn: () => ordersService.listPurchaseOrders(filters),
  });
}
