import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppBadge, AppButton, AppCard, AppInput, AppModal, PageHeader } from '@/components/ui';
import {
  useAiConfirmMutation,
  useAiExecuteMutation,
  useAiSendMutation,
  useAiThreadQuery,
} from '@/features/ai';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AiThreadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = params.id;
  const threadId = Array.isArray(rawId) ? rawId[0] : rawId;

  const threadQuery = useAiThreadQuery(threadId, Boolean(threadId));
  const send = useAiSendMutation();
  const confirm = useAiConfirmMutation();
  const execute = useAiExecuteMutation();

  const [prompt, setPrompt] = useState('');
  const [transactionSpecId, setTransactionSpecId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executeConfirmOpen, setExecuteConfirmOpen] = useState(false);

  const handleSend = async () => {
    if (!threadId || !prompt.trim()) {
      setError('Enter a prompt to continue the thread.');
      return;
    }

    setError(null);
    setMessage(null);
    try {
      const result = await send.mutateAsync({ text: prompt.trim(), conversationId: threadId });
      if (result.kind === 'navigation') {
        setMessage(`Opened ${result.label ?? 'page'}.`);
        setPrompt('');
        router.push(result.href as any);
        return;
      }

      setMessage(`Spec created: ${result.transactionSpecId}`);
      setTransactionSpecId(result.transactionSpecId);
      setPrompt('');
      await threadQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to interpret prompt.');
    }
  };

  const handleConfirm = async () => {
    if (!transactionSpecId.trim()) {
      setError('Enter a transaction spec ID.');
      return;
    }

    setError(null);
    setMessage(null);
    try {
      await confirm.mutateAsync({ transactionSpecId: transactionSpecId.trim(), confirm: true });
      setMessage('Spec confirmed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm spec.');
    }
  };

  const handleExecute = async () => {
    if (!transactionSpecId.trim()) {
      setError('Enter a transaction spec ID.');
      return;
    }

    setError(null);
    setMessage(null);
    try {
      await execute.mutateAsync({ transactionSpecId: transactionSpecId.trim() });
      setMessage('Execution completed.');
      await threadQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute spec.');
    }
  };

  const thread = threadQuery.data;

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title={thread ? `AI Thread ${thread.conversation.id.slice(0, 8).toUpperCase()}` : 'AI Thread'}
        subtitle="Chat, interpreted actions, confidence, and execution controls."
      />

      <View className="gap-4">
        <AppCard title="Composer">
          <View className="gap-3">
            <AppInput
              label="Prompt"
              placeholder="Take me to products, or transfer 5 units from WH-01 to STORE-02"
              value={prompt}
              onChangeText={setPrompt}
            />
            <AppButton label="Send" onPress={() => void handleSend()} loading={send.isPending} />

            <AppInput
              label="Transaction spec ID"
              placeholder="Spec ID from interpret response"
              value={transactionSpecId}
              onChangeText={setTransactionSpecId}
            />
            <View className="flex-row gap-2">
              <AppButton label="Confirm" size="sm" variant="secondary" onPress={() => void handleConfirm()} loading={confirm.isPending} />
              <AppButton label="Execute" size="sm" onPress={() => setExecuteConfirmOpen(true)} loading={execute.isPending} />
            </View>

            {error ? <Text className="text-small text-error">{error}</Text> : null}
            {message ? <Text className="text-small text-success">{message}</Text> : null}
          </View>
        </AppCard>

        <AppCard title="Conversation">
          {threadQuery.isLoading ? <Text className="text-small text-muted">Loading thread...</Text> : null}
          {threadQuery.error ? (
            <View className="gap-3">
              <Text className="text-small text-error">{threadQuery.error.message}</Text>
              <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void threadQuery.refetch()} />
            </View>
          ) : null}

          {!threadQuery.isLoading && !threadQuery.error ? (
            <View className="gap-2">
              {(thread?.turns ?? []).map((turn, index) => (
                <View
                  key={`${turn.createdAt}-${index}`}
                  className={`rounded-md border px-3 py-2 ${turn.role === 'assistant' ? 'border-primary/20 bg-primary-tint' : 'border-border bg-surface-2'}`}
                >
                  <View className="mb-1 flex-row items-center justify-between">
                    <AppBadge label={turn.role} tone={turn.role === 'assistant' ? 'info' : 'default'} />
                    <Text className="text-caption text-muted">{formatDate(turn.createdAt)}</Text>
                  </View>
                  <Text className="text-small text-text">{turn.content}</Text>
                </View>
              ))}

              {(thread?.turns ?? []).length === 0 ? <Text className="text-small text-muted">No turns in this thread yet.</Text> : null}
            </View>
          ) : null}
        </AppCard>
      </View>

      <AppModal
        isOpen={executeConfirmOpen}
        onClose={() => setExecuteConfirmOpen(false)}
        title="Execute AI action"
        description="This will apply the confirmed transaction spec to inventory/order records."
        footer={
          <View className="flex-row justify-end gap-2">
            <AppButton label="Cancel" size="sm" variant="secondary" onPress={() => setExecuteConfirmOpen(false)} />
            <AppButton
              label="Execute now"
              size="sm"
              loading={execute.isPending}
              onPress={() => {
                setExecuteConfirmOpen(false);
                void handleExecute();
              }}
            />
          </View>
        }
      >
        <Text className="text-small text-muted">
          Ensure the spec ID is correct and approval is completed where required.
        </Text>
      </AppModal>
    </ScrollView>
  );
}
