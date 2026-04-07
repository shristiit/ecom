import { useMutation } from '@admin/lib/query';
import { assistantService } from '../services/assistant.service';

export function useAssistantCreateConversationMutation() {
  return useMutation({
    mutationFn: (input: { title?: string; initialMessage?: string | null }) => assistantService.createConversation(input),
  });
}
