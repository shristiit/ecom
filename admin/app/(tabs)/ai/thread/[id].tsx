import { useLocalSearchParams } from 'expo-router';
import { PageShell } from '@/components/ui';
import { AssistantChatShell } from '@/features/assistant';

export default function AiThreadScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = params.id;
  const conversationId = Array.isArray(rawId) ? rawId[0] : rawId;

  return (
    <PageShell variant="ai">
      <AssistantChatShell key={`assistant-thread-${conversationId ?? 'unknown'}`} mode="thread" conversationId={conversationId} />
    </PageShell>
  );
}
