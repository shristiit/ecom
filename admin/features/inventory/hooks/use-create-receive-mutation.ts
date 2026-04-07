import { useMutation } from '@admin/lib/query';
import { inventoryService } from '../services/inventory.service';
import type { InventorySimpleTransactionInput } from '../types/inventory.types';

export function useCreateReceiveMutation() {
  return useMutation({
    mutationFn: (input: InventorySimpleTransactionInput) => inventoryService.receive(input),
  });
}
