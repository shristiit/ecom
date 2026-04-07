import { useMutation } from '@admin/lib/query';
import { aiService } from '../services';

export function useAiNavigateMutation() {
  return useMutation({
    mutationFn: (input: { text: string; conversationId?: string }) => aiService.navigate(input),
  });
}
