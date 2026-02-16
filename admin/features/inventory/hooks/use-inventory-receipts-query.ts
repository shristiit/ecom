import { queryKeys, useQuery } from '@/lib/query';
import { inventoryService } from '../services/inventory.service';

export function useInventoryReceiptsQuery(enabled = true) {
  return useQuery({
    key: queryKeys.inventory.receipts(),
    enabled,
    queryFn: () => inventoryService.listReceipts(),
  });
}
