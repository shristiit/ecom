import { useMutation } from '@admin/lib/query';
import { inventoryService } from '../services/inventory.service';
import type { InventoryTransferInput } from '../types/inventory.types';

export function useCreateTransferMutation() {
  return useMutation({
    mutationFn: (input: InventoryTransferInput) => inventoryService.transfer(input),
  });
}
