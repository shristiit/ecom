import { useMemo } from 'react';
import { queryKeys, useQuery } from '@/lib/query';
import { ordersService } from '../services/orders.service';
import type { SalesOrdersFilter } from '../types/orders.types';

export function useSalesOrdersQuery(filters?: SalesOrdersFilter, enabled = true) {
  const filterKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);

  return useQuery({
    key: [...queryKeys.orders.sales(), filterKey],
    enabled,
    queryFn: () => ordersService.listSalesOrders(filters),
  });
}
