import { useMutation } from '@/lib/query';
import { assistantService } from '../services/assistant.service';

export function useAssistantApproveMutation() {
  return useMutation({
    mutationFn: (input: { approvalId: string; approve: boolean }) => assistantService.decideApproval(input),
  });
}
