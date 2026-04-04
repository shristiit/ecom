import { useMutation } from '@/lib/query';
import { assistantService } from '../services/assistant.service';

export function useAssistantSendMessageMutation() {
  return useMutation({
    mutationFn: (input: { conversationId: string; content: string }) => assistantService.sendMessage(input),
  });
}
