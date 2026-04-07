import { useMutation } from '@admin/lib/query';
import { inventoryService } from '../services/inventory.service';
import type { InventorySimpleTransactionInput } from '../types/inventory.types';

export function useCreateWriteOffMutation() {
  return useMutation({
    mutationFn: (input: InventorySimpleTransactionInput) => inventoryService.writeOff(input),
  });
}
