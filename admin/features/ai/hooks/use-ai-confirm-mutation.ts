import { useMutation } from '@/lib/query';
import { aiService } from '../services';

export function useAiConfirmMutation() {
  return useMutation({
    mutationFn: (input: { transactionSpecId: string; confirm: boolean }) => aiService.confirm(input),
  });
}
