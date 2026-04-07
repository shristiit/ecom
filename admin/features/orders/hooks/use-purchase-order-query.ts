import { queryKeys, useQuery } from '@admin/lib/query';
import { ordersService } from '../services/orders.service';

export function usePurchaseOrderQuery(id: string | undefined, enabled = true) {
  return useQuery({
    key: [...queryKeys.orders.purchase(), id ?? 'unknown'],
    enabled: enabled && Boolean(id),
    queryFn: () => ordersService.getPurchaseOrder(id ?? ''),
  });
}
