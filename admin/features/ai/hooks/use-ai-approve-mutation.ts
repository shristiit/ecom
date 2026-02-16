import { useMutation } from '@/lib/query';
import { aiService } from '../services';

export function useAiApproveMutation() {
  return useMutation({
    mutationFn: (input: { approvalId: string; approve: boolean }) => aiService.approve(input),
  });
}
