import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { Mic, Square, Sparkles } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { AppLogo } from '@/components/branding';
import { AppButton, AppCard, PageShell } from '@/components/ui';
import { useAiSendMutation, useAiThreadsQuery } from '@/features/ai';

type WebSpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type WebSpeechRecognitionConstructor = new () => WebSpeechRecognitionInstance;

function getSpeechRecognitionConstructor(): WebSpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;

  const windowWithSpeech = window as Window & {
    SpeechRecognition?: WebSpeechRecognitionConstructor;
    webkitSpeechRecognition?: WebSpeechRecognitionConstructor;
  };

  return windowWithSpeech.SpeechRecognition ?? windowWithSpeech.webkitSpeechRecognition ?? null;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AiHomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ prompt?: string | string[]; autostart?: string | string[] }>();
  const threadsQuery = useAiThreadsQuery();
  const send = useAiSendMutation();

  const [prompt, setPrompt] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDictating, setIsDictating] = useState(false);
  const recognitionRef = useRef<WebSpeechRecognitionInstance | null>(null);
  const lastAutoStartedPromptRef = useRef<string | null>(null);

  const recognitionCtor = useMemo(() => getSpeechRecognitionConstructor(), []);
  const speechSupported = Boolean(recognitionCtor);
  const incomingPrompt = Array.isArray(params.prompt) ? params.prompt[0] ?? '' : params.prompt ?? '';
  const shouldAutostart = (Array.isArray(params.autostart) ? params.autostart[0] : params.autostart) === '1';

  const handleNewThread = useCallback(async (nextPrompt = prompt) => {
    if (!nextPrompt.trim()) {
      setError('Enter a prompt to start a thread.');
      return;
    }

    setError(null);
    setMessage(null);
    try {
      const normalizedPrompt = nextPrompt.trim();
      const result = await send.mutateAsync({ text: normalizedPrompt });
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
  }, [prompt, router, send]);

  useEffect(() => {
    if (!incomingPrompt) return;

    setPrompt(incomingPrompt);

    if (!shouldAutostart) return;
    if (send.isPending) return;
    if (lastAutoStartedPromptRef.current === incomingPrompt) return;

    lastAutoStartedPromptRef.current = incomingPrompt;
    void handleNewThread(incomingPrompt);
  }, [handleNewThread, incomingPrompt, shouldAutostart, send.isPending]);

  const handleDictate = () => {
    if (!recognitionCtor) {
      setError('Dictation is only available in supported browsers.');
      return;
    }

    if (isDictating) {
      recognitionRef.current?.stop();
      setIsDictating(false);
      return;
    }

    setError(null);
    setMessage(null);

    const recognition = new recognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-GB';
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();

      if (!transcript) return;

      setPrompt((current) => `${current.trim()} ${transcript}`.trim());
      setMessage('Dictation captured.');
    };
    recognition.onerror = () => {
      setError('Dictation failed. Check microphone permissions and try again.');
      setIsDictating(false);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      setIsDictating(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setIsDictating(true);
    recognition.start();
  };

  const threads = threadsQuery.data ?? [];

  return (
    <PageShell variant="ai">
      <ScrollView className="px-4 py-6 md:px-6">
        <View className="relative mx-auto w-full max-w-5xl gap-8 overflow-hidden">
          <View pointerEvents="none" className="absolute inset-x-0 top-0 items-center">
            <AppLogo showWordmark width={1040} height={340} opacity={0.12} />
          </View>

          <View className="flex-row justify-end gap-2">
            <Link href="/ai/approvals" asChild>
              <AppButton label="Approvals" size="sm" variant="secondary" />
            </Link>
            <Link href="/ai/history" asChild>
              <AppButton label="History" size="sm" variant="secondary" />
            </Link>
          </View>

          <View className="items-center px-2 pt-6">
            <View className="mb-4 items-center gap-3">
              <View className="rounded-full border border-border bg-surface px-4 py-2">
                <View className="flex-row items-center gap-2">
                  <Sparkles size={16} color="#1F3A5F" />
                  <Text className="text-small font-medium text-primary">My AI Assistant</Text>
                </View>
              </View>
            </View>

            <Text className="max-w-3xl text-center text-[34px] font-semibold leading-[42px] text-text">
              ...what are we doing today ?
            </Text>
            <Text className="mt-3 max-w-2xl text-center text-small text-muted">
              Ask for inventory moves, product lookups, approvals, or navigation and I will start the right workflow.
            </Text>
          </View>

          <View className="mx-auto w-full max-w-3xl rounded-[28px] border border-border bg-surface p-4 shadow-sm">
            <TextInput
              accessibilityLabel="Ask My AI Assistant"
              accessibilityHint="Enter a request for orders, stock, products, approvals, or navigation."
              placeholder="Ask anything about orders, stock, products, or admin tasks..."
              placeholderTextColor="rgb(var(--text-subtle))"
              value={prompt}
              onChangeText={setPrompt}
              multiline
              textAlignVertical="top"
              className="min-h-[150px] rounded-[20px] bg-surface-2 px-4 py-4 text-body text-text"
            />

            <View className="mt-4 flex-row items-center justify-between gap-3">
              <View className="flex-row items-center gap-3">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isDictating ? 'Stop dictation' : 'Start dictation'}
                  accessibilityHint={
                    speechSupported
                      ? 'Uses your microphone to dictate a prompt for My AI Assistant.'
                      : 'Dictation is unavailable in this browser.'
                  }
                  accessibilityState={{ busy: isDictating, disabled: !speechSupported }}
                  onPress={handleDictate}
                  className={`h-12 w-12 items-center justify-center rounded-full border ${
                    isDictating ? 'border-primary bg-primary-tint' : 'border-border bg-surface-2'
                  }`}
                >
                  {isDictating ? <Square size={18} color="#1F3A5F" /> : <Mic size={18} color="#1F3A5F" />}
                </Pressable>
                <Text className="text-small text-muted">
                  {isDictating ? 'Listening...' : speechSupported ? 'Dictate your prompt' : 'Dictation unavailable in this browser'}
                </Text>
              </View>

              <AppButton label="Send" onPress={() => void handleNewThread()} loading={send.isPending} className="min-w-[110px]" />
            </View>

            {error ? <Text className="mt-3 text-small text-error">{error}</Text> : null}
            {message ? <Text className="mt-3 text-small text-success">{message}</Text> : null}
          </View>

          <View className="mx-auto w-full max-w-4xl gap-4">
            <View className="flex-row items-center justify-between gap-3">
              <View>
                <Text className="text-section font-semibold text-text">Recent conversations</Text>
                <Text className="text-small text-muted">Pick up where you left off.</Text>
              </View>
            </View>

            {threadsQuery.isLoading ? <Text className="text-small text-muted">Loading threads...</Text> : null}

            {threadsQuery.error ? (
              <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
                <Text className="text-small text-error">{threadsQuery.error.message}</Text>
                <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void threadsQuery.refetch()} />
              </View>
            ) : null}

            {!threadsQuery.isLoading && !threadsQuery.error ? (
              <View className="gap-3">
                {threads.map((thread) => (
                  <Link key={thread.id} href={`/ai/thread/${thread.id}`} asChild>
                    <AppCard className="border border-border bg-surface-2" title={thread.id.slice(0, 8).toUpperCase()}>
                      <Text className="text-small text-muted">{thread.lastAssistantMessage || 'No assistant response yet.'}</Text>
                      <Text className="mt-2 text-caption text-subtle">
                        Last activity: {formatDate(thread.lastMessageAt)} · Turns: {thread.turnCount}
                      </Text>
                    </AppCard>
                  </Link>
                ))}

                {threads.length === 0 ? (
                  <View className="rounded-2xl border border-dashed border-border bg-surface p-6">
                    <Text className="text-small text-muted">No threads found.</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </PageShell>
  );
}
