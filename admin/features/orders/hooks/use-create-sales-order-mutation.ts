import { useMutation } from '@admin/lib/query';
import { ordersService } from '../services/orders.service';

type CreateSalesOrderInput = {
  customerId: string;
  lines: Array<{ sizeId: string; qty: number; unitPrice: number }>;
};

export function useCreateSalesOrderMutation() {
  return useMutation({
    mutationFn: (input: CreateSalesOrderInput) => ordersService.createSalesOrder(input),
  });
}
