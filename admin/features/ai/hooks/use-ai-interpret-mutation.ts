import { useMutation } from '@admin/lib/query';
import { aiService } from '../services';

export function useAiInterpretMutation() {
  return useMutation({
    mutationFn: (input: { text: string; conversationId?: string }) => aiService.interpret(input),
  });
}
