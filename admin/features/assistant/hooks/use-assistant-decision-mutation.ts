import { useMutation } from '@admin/lib/query';
import { assistantService } from '../services/assistant.service';

export function useAssistantDecisionMutation() {
  return useMutation({
    mutationFn: (input: { workflowId: string; decision: string; note?: string }) => assistantService.decide(input),
  });
}
