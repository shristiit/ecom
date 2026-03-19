import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppButton, AppCard, AppInput, PageHeader } from '@/components/ui';
import { useAiSendMutation, useAiThreadsQuery } from '@/features/ai';

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AiHomeScreen() {
  const router = useRouter();
  const threadsQuery = useAiThreadsQuery();
  const send = useAiSendMutation();

  const [prompt, setPrompt] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleNewThread = async () => {
    if (!prompt.trim()) {
      setError('Enter a prompt to start a thread.');
      return;
    }

    setError(null);
    setMessage(null);
    try {
      const result = await send.mutateAsync({ text: prompt.trim() });
      if (result.kind === 'navigation') {
        setMessage(`Opened ${result.label ?? 'page'}.`);
        setPrompt('');
        router.push(result.href as any);
        return;
      }

      setMessage('Thread created and interpreted.');
      setPrompt('');
      router.push(`/ai/thread/${result.conversationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start thread.');
    }
  };

  const threads = threadsQuery.data ?? [];

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title="AI Copilot"
        subtitle="Thread templates, suggested actions, and command execution."
        actions={
          <View className="flex-row gap-2">
            <Link href="/ai/approvals" asChild>
              <AppButton label="Approvals" size="sm" variant="secondary" />
            </Link>
            <Link href="/ai/history" asChild>
              <AppButton label="History" size="sm" variant="secondary" />
            </Link>
          </View>
        }
      />

      <View className="gap-4">
        <AppCard title="New thread">
          <View className="gap-3">
            <AppInput
              label="Prompt"
              placeholder="Go to products, or create a sales order for customer 88738"
              value={prompt}
              onChangeText={setPrompt}
            />
            <AppButton label="Send" onPress={() => void handleNewThread()} loading={send.isPending} />
            {error ? <Text className="text-small text-error">{error}</Text> : null}
            {message ? <Text className="text-small text-success">{message}</Text> : null}
          </View>
        </AppCard>

        <AppCard title="Threads" subtitle="Most recent conversations.">
          {threadsQuery.isLoading ? <Text className="text-small text-muted">Loading threads...</Text> : null}
          {threadsQuery.error ? (
            <View className="gap-3">
              <Text className="text-small text-error">{threadsQuery.error.message}</Text>
              <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void threadsQuery.refetch()} />
            </View>
          ) : null}

          {!threadsQuery.isLoading && !threadsQuery.error ? (
            <View className="gap-2">
              {threads.map((thread) => (
                <Link key={thread.id} href={`/ai/thread/${thread.id}`} asChild>
                  <AppCard className="bg-surface-2" title={thread.id.slice(0, 8).toUpperCase()}>
                    <Text className="text-small text-muted">{thread.lastAssistantMessage || 'No assistant response yet.'}</Text>
                    <Text className="mt-1 text-caption text-subtle">
                      Last activity: {formatDate(thread.lastMessageAt)} · Turns: {thread.turnCount}
                    </Text>
                  </AppCard>
                </Link>
              ))}

              {threads.length === 0 ? <Text className="text-small text-muted">No threads found.</Text> : null}
            </View>
          ) : null}
        </AppCard>
      </View>
    </ScrollView>
  );
}
