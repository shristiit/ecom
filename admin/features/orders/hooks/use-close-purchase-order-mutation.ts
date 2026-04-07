import { useMutation } from '@admin/lib/query';
import { ordersService } from '../services/orders.service';

export function useClosePurchaseOrderMutation() {
  return useMutation({
    mutationFn: (id: string) => ordersService.closePurchaseOrder(id),
  });
}
