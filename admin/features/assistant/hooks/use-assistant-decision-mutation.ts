import { queryKeys, useMutation } from '@admin/lib/query';
import { assistantService } from '../services/assistant.service';

export function useAssistantDecisionMutation() {
  return useMutation({
    mutationFn: (input: { workflowId: string; decision: string; note?: string }) => assistantService.decide(input),
    invalidateAll: false,
    invalidateKeys: [queryKeys.assistant.approvals()],
    invalidatePrefixes: [
      queryKeys.assistant.conversations(),
      queryKeys.assistant.history(),
      queryKeys.orders.sales(),
      queryKeys.orders.purchase(),
      queryKeys.products.all(),
      queryKeys.inventory.stockOnHand(),
      queryKeys.inventory.movements(),
      queryKeys.inventory.receipts(),
      queryKeys.settings.tenant(),
      queryKeys.dashboard.overview(),
    ],
  });
}
