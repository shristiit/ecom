import { useMutation } from '@admin/lib/query';
import { inventoryService } from '../services/inventory.service';

export function useCreateAdjustmentMutation() {
  return useMutation({
    mutationFn: inventoryService.createAdjustment,
  });
}
