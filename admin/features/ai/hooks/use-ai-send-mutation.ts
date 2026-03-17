import { useMutation } from '@/lib/query';
import { aiService } from '../services';

export function useAiSendMutation() {
  return useMutation({
    mutationFn: (input: { text: string; conversationId?: string }) => aiService.send(input),
  });
}
