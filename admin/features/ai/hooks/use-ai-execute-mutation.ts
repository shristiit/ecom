import { useMutation } from '@/lib/query';
import { aiService } from '../services';

export function useAiExecuteMutation() {
  return useMutation({
    mutationFn: (input: { transactionSpecId: string }) => aiService.execute(input),
  });
}
