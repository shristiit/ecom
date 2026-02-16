import { useMutation } from '@/lib/query';
import { ordersService } from '../services/orders.service';

export function useCancelSalesOrderMutation() {
  return useMutation({
    mutationFn: (id: string) => ordersService.cancelSalesOrder(id),
  });
}
