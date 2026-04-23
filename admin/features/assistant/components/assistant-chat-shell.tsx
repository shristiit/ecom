import { Link, useRouter } from 'expo-router';
import { MessageSquarePlus, Mic, PanelRightClose, PanelRightOpen, Square, Sparkles } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { AppButton } from '@admin/components/ui';
import {
  useAssistantConversationQuery,
  useAssistantConversationsQuery,
  useAssistantDecisionMutation,
} from '../hooks';
import { assistantService } from '../services';
import { AssistantMessageBlocks } from './assistant-message-blocks';

type AssistantChatShellProps = {
  mode: 'new' | 'thread';
  conversationId?: string;
  incomingPrompt?: string;
  shouldAutostart?: boolean;
};

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

function renderWorkflowStatus(status?: string | null) {
  if (!status) return 'Ready';
  return status.replace(/_/g, ' ');
}

const promptSuggestions = [
  'Show stock on hand for blue denim jackets in London.',
  'Create a PO draft for our spring replenishment.',
  'Transfer 12 units from WH-A to showroom.',
  'How do I receive a purchase order?',
];

export function AssistantChatShell({
  mode,
  conversationId,
  incomingPrompt = '',
  shouldAutostart = false,
}: AssistantChatShellProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const conversationsQuery = useAssistantConversationsQuery();
  const conversationQuery = useAssistantConversationQuery(conversationId, mode === 'thread' && Boolean(conversationId));
  const decision = useAssistantDecisionMutation();

  const [prompt, setPrompt] = useState(incomingPrompt);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDictating, setIsDictating] = useState(false);
  const [isHistoryRailOpen, setIsHistoryRailOpen] = useState(false);
  const [isStreamingRun, setIsStreamingRun] = useState(false);

  const scrollRef = useRef<ScrollView | null>(null);
  const lastAutoStartedPromptRef = useRef<string | null>(null);
  const recognitionRef = useRef<WebSpeechRecognitionInstance | null>(null);
  const recognitionCtorRef = useRef<WebSpeechRecognitionConstructor | null>(getSpeechRecognitionConstructor());

  const isThreadMode = mode === 'thread' && Boolean(conversationId);
  const activeConversation = isThreadMode ? conversationQuery.data : undefined;
  const conversations = conversationsQuery.data ?? [];
  const pendingAction = activeConversation?.pendingAction;
  const isSubmitting = isStreamingRun;
  const isDesktop = width >= 1280;
  const showHistoryRail = isDesktop ? isHistoryRailOpen : isHistoryRailOpen;
  const historyRailContainerClassName = isDesktop ? 'lg:w-[340px]' : 'w-full';

  const refreshConversationViews = useCallback(async () => {
    await Promise.all([
      conversationsQuery.refetch(),
      isThreadMode ? conversationQuery.refetch() : Promise.resolve(),
    ]);
  }, [conversationQuery, conversationsQuery, isThreadMode]);

  const handleCreateConversation = useCallback(async (nextPrompt: string) => {
    const trimmedPrompt = nextPrompt.trim();
    if (!trimmedPrompt) {
      setError('Enter a message to start a conversation.');
      return;
    }

    setError(null);
    setStatusMessage(null);
    setIsStreamingRun(true);

    try {
      const result = await assistantService.streamRun(
        {
          title: trimmedPrompt.slice(0, 60),
          content: trimmedPrompt,
        },
        async (event) => {
          if (event.type === 'plan.updated') {
            setStatusMessage('Planning next step...');
          }
          if (event.type === 'tool.called') {
            setStatusMessage(`Running ${String(event.payload?.toolName ?? 'tool')}...`);
          }
          if (event.type === 'approval.requested') {
            setStatusMessage('Approval requested.');
          }
        },
      );

      setPrompt('');
      setStatusMessage('Run completed.');
      await conversationsQuery.refetch();
      if (result.conversationId) {
        router.replace(`/ai/thread/${result.conversationId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start conversation.');
    } finally {
      setIsStreamingRun(false);
    }
  }, [conversationsQuery, router]);

  const handleSend = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError('Enter a message to continue the conversation.');
      return;
    }

    if (!isThreadMode || !conversationId) {
      await handleCreateConversation(trimmedPrompt);
      return;
    }

    setError(null);
    setStatusMessage(null);
    setIsStreamingRun(true);

    try {
      await assistantService.streamRun(
        { conversationId, content: trimmedPrompt },
        async (event) => {
          if (event.type === 'plan.updated') {
            setStatusMessage('Planning next step...');
          }
          if (event.type === 'tool.called') {
            setStatusMessage(`Running ${String(event.payload?.toolName ?? 'tool')}...`);
          }
          if (event.type === 'approval.requested') {
            setStatusMessage('Approval requested.');
          }
        },
      );
      setPrompt('');
      setStatusMessage('Run completed.');
      await refreshConversationViews();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setIsStreamingRun(false);
    }
  }, [conversationId, handleCreateConversation, isThreadMode, prompt, refreshConversationViews]);

  const handleDecision = useCallback(async (nextDecision: 'confirm' | 'cancel' | 'edit' | 'submit_for_approval') => {
    const workflowId = activeConversation?.workflow?.id;
    if (!workflowId) {
      setError('No pending workflow action is available.');
      return;
    }

    setError(null);
    setStatusMessage(null);

    try {
      const result = await decision.mutateAsync({ workflowId, decision: nextDecision });
      setStatusMessage(result.message);
      await refreshConversationViews();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply workflow decision.');
    }
  }, [activeConversation?.workflow?.id, decision, refreshConversationViews]);

  const handleNewChat = useCallback(() => {
    setPrompt('');
    setError(null);
    setStatusMessage(null);
    setIsDictating(false);
    router.replace({
      pathname: '/ai',
    });
  }, [router]);

  const handleOpenConversation = useCallback((nextConversationId: string) => {
    setError(null);
    setStatusMessage(null);
    setPrompt('');
    router.replace(`/ai/thread/${nextConversationId}`);
  }, [router]);

  const toggleHistoryRail = useCallback(() => {
    setIsHistoryRailOpen((current) => !current);
  }, []);

  const handleSuggestion = useCallback((value: string) => {
    setPrompt(value);
  }, []);

  const handleDictate = useCallback(() => {
    const recognitionCtor = recognitionCtorRef.current;

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
    setStatusMessage(null);

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
      setStatusMessage('Dictation captured.');
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
  }, [isDictating]);

  useEffect(() => {
    setPrompt(incomingPrompt || '');
  }, [incomingPrompt, mode]);

  useEffect(() => {
    if (!incomingPrompt || !shouldAutostart) return;
    if (isStreamingRun) return;
    if (lastAutoStartedPromptRef.current === incomingPrompt) return;

    lastAutoStartedPromptRef.current = incomingPrompt;
    void handleCreateConversation(incomingPrompt);
  }, [handleCreateConversation, incomingPrompt, isStreamingRun, shouldAutostart]);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 60);

    return () => clearTimeout(timer);
  }, [activeConversation?.messages]);

  useEffect(() => {
    setError(null);
    setStatusMessage(null);

    if (mode === 'new') {
      setPrompt(incomingPrompt || '');
    } else {
      setPrompt('');
    }
  }, [conversationId, incomingPrompt, mode]);

  return (
    <View className="flex-1 bg-bg px-4 py-4 md:px-6 md:py-5">
      <View className="mx-auto flex-1 w-full max-w-[1600px] gap-4">
        <View className="flex-row items-start justify-between gap-4">
          <View className="gap-1">
            <Text className="text-[30px] font-semibold leading-[36px] text-text">
              {activeConversation?.conversation.title || 'My AI Assistant'}
            </Text>
            <Text className="text-small text-muted">
              {activeConversation?.workflow
                ? `Workflow status: ${renderWorkflowStatus(activeConversation.workflow.status)}`
                : 'Ask about inventory, purchasing, products, reporting, or navigation.'}
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            <AppButton
              label={showHistoryRail ? 'Hide history' : 'Show history'}
              size="sm"
              variant="secondary"
              leftIcon={showHistoryRail ? <PanelRightClose size={16} color="#1F3A5F" /> : <PanelRightOpen size={16} color="#1F3A5F" />}
              onPress={toggleHistoryRail}
            />
            <Link href="/ai/approvals" asChild>
              <AppButton label="Approvals" size="sm" variant="secondary" />
            </Link>
            <Link href="/ai/history" asChild>
              <AppButton label="History" size="sm" variant="secondary" />
            </Link>
          </View>
        </View>

        <View className={`flex-1 gap-4 ${showHistoryRail && isDesktop ? 'lg:flex-row' : ''}`}>
          <View className="min-h-[620px] flex-1 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
            <ScrollView
              ref={scrollRef}
              className="flex-1"
            >
              <View className={`px-5 py-6 md:px-8 ${activeConversation ? 'gap-6' : 'flex-1 items-center justify-center gap-8'}`}>
                {mode === 'new' ? (
                <View className="w-full max-w-3xl items-center gap-5">
                  <View className="rounded-full border border-primary/10 bg-primary-tint px-4 py-2">
                    <View className="flex-row items-center gap-2">
                      <Sparkles size={16} color="#1F3A5F" />
                      <Text className="text-small font-medium text-primary">Inventory AI</Text>
                    </View>
                  </View>

                  <View className="items-center gap-3">
                    <Text className="text-center text-[36px] font-semibold leading-[44px] text-text">
                      What do you need help with today?
                    </Text>
                    <Text className="max-w-2xl text-center text-body text-muted">
                      Start a conversation for stock checks, PO workflows, product updates, reporting, or in-app navigation.
                    </Text>
                  </View>

                  <View className="w-full max-w-3xl flex-row flex-wrap justify-center gap-2">
                    {promptSuggestions.map((suggestion) => (
                      <Pressable
                        key={suggestion}
                        accessibilityRole="button"
                        onPress={() => handleSuggestion(suggestion)}
                        className="rounded-full border border-border bg-surface-2 px-4 py-2.5"
                      >
                        <Text className="text-small text-text">{suggestion}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                ) : null}

                {conversationQuery.isLoading && isThreadMode ? (
                  <Text className="text-small text-muted">Loading conversation...</Text>
                ) : null}

                {conversationQuery.error ? (
                  <View className="w-full max-w-3xl rounded-lg border border-error/20 bg-error-tint px-5 py-4">
                    <Text className="text-small text-error">{conversationQuery.error.message}</Text>
                    <View className="mt-3 flex-row">
                      <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void conversationQuery.refetch()} />
                    </View>
                  </View>
                ) : null}

                {activeConversation?.messages.map((turn) => (
                  <View
                    key={turn.id}
                    className={`w-full ${turn.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <View className={`gap-2 ${turn.role === 'user' ? 'max-w-[70%] items-end' : 'max-w-3xl items-start'}`}>
                      <Text className="px-1 text-caption uppercase tracking-[0.16em] text-subtle">
                        {turn.role === 'assistant' ? 'Assistant' : turn.role === 'user' ? 'You' : turn.role}
                      </Text>

                      <View
                        className={`rounded-lg ${
                          turn.role === 'user'
                            ? 'bg-surface-2 px-5 py-4'
                            : 'bg-[#F8F6F1] px-0 py-0'
                        }`}
                      >
                        <AssistantMessageBlocks blocks={turn.blocks} />
                      </View>

                      <Text className="px-1 text-caption text-subtle">{formatDate(turn.createdAt)}</Text>
                    </View>
                  </View>
                ))}

                {activeConversation && activeConversation.messages.length === 0 ? (
                  <View className="w-full max-w-3xl rounded-md border border-dashed border-border bg-surface-2 px-5 py-5">
                    <Text className="text-small text-muted">No messages in this conversation yet.</Text>
                  </View>
                ) : null}

                {pendingAction?.actions?.length ? (
                  <View className="w-full max-w-3xl rounded-lg border border-border bg-surface-2 px-5 py-5">
                    <Text className="text-small font-semibold text-text">{pendingAction.prompt}</Text>
                    <View className="mt-4 flex-row flex-wrap gap-2">
                      {pendingAction.actions.map((action) => (
                        <AppButton
                          key={action}
                          label={action.replace(/_/g, ' ')}
                          size="sm"
                          variant={action === 'cancel' ? 'secondary' : 'primary'}
                          onPress={() => void handleDecision(action)}
                          loading={decision.isPending}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            </ScrollView>

            <View className="border-t border-border bg-surface/95 px-4 py-4 md:px-6">
              <View className="mx-auto w-full max-w-4xl rounded-lg border border-border bg-white px-4 py-4 shadow-sm">
                <TextInput
                  nativeID="assistant-chat-composer"
                  accessibilityLabel="Ask My AI Assistant"
                  accessibilityHint="Send a message to create or continue an AI workflow."
                  placeholder="Ask anything"
                  placeholderTextColor="rgb(var(--text-subtle))"
                  value={prompt}
                  onChangeText={setPrompt}
                  multiline
                  textAlignVertical="top"
                  className="min-h-[72px] text-body text-text"
                  {...({ id: 'assistant-chat-composer', name: 'assistant-chat-composer' } as unknown as Record<string, string>)}
                />

                <View className="mt-3 flex-row items-center justify-between gap-3">
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Start a new conversation"
                      onPress={handleNewChat}
                      className="h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-2"
                    >
                      <MessageSquarePlus size={18} color="#1F3A5F" />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={isDictating ? 'Stop dictation' : 'Start dictation'}
                      accessibilityState={{ busy: isDictating, disabled: !recognitionCtorRef.current }}
                      onPress={handleDictate}
                      className={`h-11 w-11 items-center justify-center rounded-full border ${
                        isDictating ? 'border-primary bg-primary-tint' : 'border-border bg-surface-2'
                      }`}
                    >
                      {isDictating ? <Square size={18} color="#1F3A5F" /> : <Mic size={18} color="#1F3A5F" />}
                    </Pressable>
                  </View>

                  <AppButton
                    label={isThreadMode ? 'Send' : 'Start chat'}
                    onPress={() => void handleSend()}
                    loading={isSubmitting}
                    className="min-w-[112px]"
                  />
                </View>

                {error ? <Text className="mt-3 text-small text-error">{error}</Text> : null}
                {statusMessage ? <Text className="mt-3 text-small text-success">{statusMessage}</Text> : null}
              </View>
            </View>
          </View>

          {showHistoryRail ? (
          <View className={historyRailContainerClassName}>
            <View className="h-full min-h-[420px] rounded-lg border border-border bg-surface shadow-sm">
              <View className="border-b border-border px-5 py-4">
                <View className="flex-row items-center justify-between gap-3">
                  <View>
                    <Text className="text-section font-semibold text-text">Conversations</Text>
                    <Text className="text-small text-muted">Recent assistant workflows</Text>
                  </View>
                  <AppButton label="New chat" size="sm" variant="secondary" onPress={handleNewChat} />
                </View>
              </View>

              <ScrollView className="flex-1">
                <View className="gap-2 p-3">
                  {conversationsQuery.isLoading ? (
                    <Text className="px-2 py-2 text-small text-muted">Loading conversations...</Text>
                  ) : null}

                  {conversationsQuery.error ? (
                    <View className="gap-3 rounded-md border border-error/20 bg-error-tint px-4 py-4">
                      <Text className="text-small text-error">{conversationsQuery.error.message}</Text>
                      <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void conversationsQuery.refetch()} />
                    </View>
                  ) : null}

                  {!conversationsQuery.isLoading && !conversationsQuery.error ? (
                    <>
                      {conversations.map((item) => {
                        const isActive = item.id === conversationId;
                        return (
                          <Pressable
                            key={item.id}
                            accessibilityRole="button"
                            onPress={() => handleOpenConversation(item.id)}
                            className={`rounded-md border px-4 py-3 ${
                              isActive ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface-2'
                            }`}
                          >
                            <Text className={`text-body font-semibold ${isActive ? 'text-on-primary' : 'text-text'}`}>
                              {item.title}
                            </Text>
                            <Text
                              numberOfLines={2}
                              className={`mt-1 text-small ${isActive ? 'text-on-primary/80' : 'text-muted'}`}
                            >
                              {item.lastMessagePreview || 'No assistant response yet.'}
                            </Text>
                            <Text className={`mt-2 text-caption ${isActive ? 'text-on-primary/80' : 'text-subtle'}`}>
                              {formatDate(item.updatedAt)}
                            </Text>
                          </Pressable>
                        );
                      })}

                      {conversations.length === 0 ? (
                        <View className="rounded-md border border-dashed border-border bg-surface-2 px-4 py-5">
                          <Text className="text-small text-muted">No conversations yet.</Text>
                        </View>
                      ) : null}
                    </>
                  ) : null}
                </View>
              </ScrollView>
            </View>
          </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
