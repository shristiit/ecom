import { useMutation } from '@/lib/query';
import { ordersService } from '../services/orders.service';

type ReceiveLine = {
  sizeId: string;
  qty: number;
  unitCost: number;
};

export function useReceivePurchaseOrderMutation() {
  return useMutation({
    mutationFn: ({ id, locationId, lines }: { id: string; locationId: string; lines: ReceiveLine[] }) =>
      ordersService.receivePurchaseOrder(id, { locationId, lines, confirm: true }),
  });
}
