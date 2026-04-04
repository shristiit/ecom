import { queryKeys, useQuery } from '@/lib/query';
import { ordersService } from '../services/orders.service';

export function useSalesOrderQuery(id: string | undefined, enabled = true) {
  return useQuery({
    key: [...queryKeys.orders.sales(), id ?? 'unknown'],
    enabled: enabled && Boolean(id),
    queryFn: () => ordersService.getSalesOrder(id ?? ''),
  });
}
