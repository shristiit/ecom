import { useLocalSearchParams } from 'expo-router';
import { PageShell } from '@/components/ui';
import { AssistantChatShell } from '@/features/assistant';

export default function AiHomeScreen() {
  const params = useLocalSearchParams<{ prompt?: string | string[]; autostart?: string | string[] }>();
  const incomingPrompt = Array.isArray(params.prompt) ? params.prompt[0] ?? '' : params.prompt ?? '';
  const shouldAutostart = (Array.isArray(params.autostart) ? params.autostart[0] : params.autostart) === '1';

  return (
    <PageShell variant="ai">
      <AssistantChatShell
        key={`assistant-new-${incomingPrompt}-${shouldAutostart ? 'autostart' : 'manual'}`}
        mode="new"
        incomingPrompt={incomingPrompt}
        shouldAutostart={shouldAutostart}
      />
    </PageShell>
  );
}
