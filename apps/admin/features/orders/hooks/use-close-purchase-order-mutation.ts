import { useMutation } from '@/lib/query';
import { ordersService } from '../services/orders.service';

export function useClosePurchaseOrderMutation() {
  return useMutation({
    mutationFn: (id: string) => ordersService.closePurchaseOrder(id),
  });
}
