import { useMutation } from '@/lib/query';
import { inventoryService } from '../services/inventory.service';
import type { InventorySimpleTransactionInput } from '../types/inventory.types';

export function useCreateCycleCountMutation() {
  return useMutation({
    mutationFn: (input: InventorySimpleTransactionInput) => inventoryService.cycleCount(input),
  });
}
