import { useMutation } from '@/lib/query';
import { ordersService } from '../services/orders.service';

type CreatePurchaseOrderInput = {
  supplierId: string;
  expectedDate?: string;
  lines: Array<{ sizeId: string; qty: number; unitCost: number }>;
};

export function useCreatePurchaseOrderMutation() {
  return useMutation({
    mutationFn: (input: CreatePurchaseOrderInput) => ordersService.createPurchaseOrder(input),
  });
}
