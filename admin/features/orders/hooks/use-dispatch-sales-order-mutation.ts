import { useMutation } from '@admin/lib/query';
import { ordersService } from '../services/orders.service';

export function useDispatchSalesOrderMutation() {
  return useMutation({
    mutationFn: ({ id, locationId }: { id: string; locationId: string }) =>
      ordersService.dispatchSalesOrder(id, { locationId, confirm: true }),
  });
}
