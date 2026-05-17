import { Link, useRouter } from 'expo-router';
import { MessageSquarePlus, Mic, Paperclip, Send, Square, Sparkles, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { AppButton } from '@admin/components/ui';
import { useAuthSession } from '@admin/features/auth';
import { ApiError } from '@admin/lib/api';
import { queryClient, queryKeys } from '@admin/lib/query';
import {
  useAssistantConversationQuery,
  useAssistantConversationsQuery,
  useAssistantDecisionMutation,
} from '../hooks';
import { assistantService } from '../services';
import {
  appendAssistantConversationMessage,
  createOptimisticUserMessage,
  mergeAssistantConversationPage,
  removeAssistantConversationMessage,
  updateAssistantConversationSummaryCache,
} from '../services/assistant-cache';
import { AssistantMessageBlocks } from './assistant-message-blocks';
import { AssistantPanelShell } from './assistant-panel-shell';
import type { AssistantConversation, AssistantConversationSummary, AssistantMessage } from '../types/assistant.types';

type Attachment = {
  id: string;
  file: File;
  filename: string;
  mimeType: string;
  isImage: boolean;
  previewUrl?: string;
  uploadedId?: string | null;
  uploadedConversationId?: string | null;
};

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

type StreamingAssistantState = {
  text: string;
  toolName: string | null;
  approvalRequested: boolean;
};

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

const ICON_PRIMARY = '#FF5C00';
const ICON_SUBTLE = '#9CA3AF';
const HISTORY_RAIL_STORAGE_KEY = 'stockaisle.assistant.historyRailOpen';

function readStoredHistoryRailOpen() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return window.localStorage.getItem(HISTORY_RAIL_STORAGE_KEY) === 'true';
}

function writeStoredHistoryRailOpen(value: boolean) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.localStorage.setItem(HISTORY_RAIL_STORAGE_KEY, String(value));
}

const promptSuggestions = [
  'Show stock on hand for blue denim jackets in London.',
  'Create a PO draft for our spring replenishment.',
  'Transfer 12 units from WH-A to showroom.',
  'How do I receive a purchase order?',
];

function buildStreamingAssistantBlocks(streamingState: StreamingAssistantState | null) {
  if (!streamingState) return [];

  const blocks: AssistantMessage['blocks'] = [];
  if (streamingState.text.trim()) {
    blocks.push({ type: 'text', content: streamingState.text.trim() });
  } else if (streamingState.toolName) {
    blocks.push({ type: 'text', content: `Running ${streamingState.toolName}...` });
  } else if (streamingState.approvalRequested) {
    blocks.push({ type: 'text', content: 'Approval requested.' });
  } else {
    blocks.push({ type: 'text', content: 'Thinking...' });
  }

  return blocks;
}

function getAssistantErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.code === 'REQUEST_ABORTED') {
      return null;
    }
    if (error.code === 'REQUEST_TIMEOUT' || error.code === 'NETWORK_ERROR' || error.status === 0) {
      return 'Connection problem. Please retry.';
    }
    if (error.status >= 400 && error.status < 500) {
      return `Assistant error: ${error.message}`;
    }
    return error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function isVoiceSendCommand(transcript: string) {
  const normalized = transcript
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return ['send', 'send it', 'send message', 'send the message'].includes(normalized);
}

export function AssistantChatShell({
  mode,
  conversationId,
  incomingPrompt = '',
  shouldAutostart = false,
}: AssistantChatShellProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user } = useAuthSession();
  const userInitials = (user?.email ?? 'AD').slice(0, 2).toUpperCase();
  const conversationsQuery = useAssistantConversationsQuery();
  const conversationQuery = useAssistantConversationQuery(conversationId, mode === 'thread' && Boolean(conversationId));
  const decision = useAssistantDecisionMutation();

  const [prompt, setPrompt] = useState(incomingPrompt);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDictating, setIsDictating] = useState(false);
  const [isHistoryRailOpen, setIsHistoryRailOpen] = useState(readStoredHistoryRailOpen);
  const [isStreamingRun, setIsStreamingRun] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [streamingAssistantState, setStreamingAssistantState] = useState<StreamingAssistantState | null>(null);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [pendingVoiceSend, setPendingVoiceSend] = useState(false);
  /** Text shown immediately in the chat area while a new conversation is being created */
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView | null>(null);
  const composerInputRef = useRef<TextInput | null>(null);
  const webComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const lastAutoStartedPromptRef = useRef<string | null>(null);
  const recognitionRef = useRef<WebSpeechRecognitionInstance | null>(null);
  const recognitionCtorRef = useRef<WebSpeechRecognitionConstructor | null>(getSpeechRecognitionConstructor());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeRunAbortRef = useRef<AbortController | null>(null);

  const isThreadMode = mode === 'thread' && Boolean(conversationId);
  const activeConversation = isThreadMode ? conversationQuery.data : undefined;
  const conversations = conversationsQuery.data ?? [];
  const pendingAction = activeConversation?.pendingAction;
  const isSubmitting = isStreamingRun;
  const isDesktop = width >= 1280;
  const streamingAssistantBlocks = buildStreamingAssistantBlocks(streamingAssistantState);

  const attachmentsRef = useRef<Attachment[]>([]);
  attachmentsRef.current = attachments;

  const clearComposer = useCallback(() => {
    setPrompt('');

    if (Platform.OS === 'web') {
      const composer = webComposerRef.current;
      if (composer) {
        composer.value = '';
        composer.focus();
        composer.setSelectionRange(0, 0);
      }
      requestAnimationFrame(() => {
        const nextComposer = webComposerRef.current;
        if (!nextComposer) return;
        nextComposer.value = '';
        nextComposer.focus();
        nextComposer.setSelectionRange(0, 0);
      });
      return;
    }

    composerInputRef.current?.focus();
  }, []);

  const invalidateAssistantDrivenQueries = useCallback(() => {
    [
      queryKeys.assistant.conversations(),
      queryKeys.assistant.approvals(),
      queryKeys.assistant.history(),
      queryKeys.orders.sales(),
      queryKeys.orders.purchase(),
      queryKeys.products.all(),
      queryKeys.inventory.stockOnHand(),
      queryKeys.inventory.movements(),
      queryKeys.inventory.receipts(),
      queryKeys.settings.tenant(),
      queryKeys.dashboard.overview(),
    ].forEach((prefix) => queryClient.invalidateQueries(prefix));
  }, []);

  const reconcileConversationCache = useCallback(async (targetConversationId: string) => {
    const latest = await assistantService.getConversation(targetConversationId, { messageLimit: 50 });
    queryClient.setQueryData<AssistantConversation>(
      queryKeys.assistant.conversation(targetConversationId),
      (existing) => mergeAssistantConversationPage(existing, latest, 'replace-latest'),
    );
    queryClient.setQueryData<AssistantConversationSummary[]>(queryKeys.assistant.conversations(), (existing) =>
      updateAssistantConversationSummaryCache(existing, latest),
    );
    return latest;
  }, []);

  useEffect(() => {
    return () => {
      activeRunAbortRef.current?.abort();
      activeRunAbortRef.current = null;
    };
  }, []);

  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || !activeConversation?.messagePage?.hasMore || isLoadingOlderMessages) {
      return;
    }

    setError(null);
    setIsLoadingOlderMessages(true);
    try {
      const olderPage = await assistantService.getConversation(conversationId, {
        beforeCreatedAt: activeConversation.messagePage.nextCursorCreatedAt ?? null,
        beforeId: activeConversation.messagePage.nextCursorId ?? null,
      });
      queryClient.setQueryData<AssistantConversation>(
        queryKeys.assistant.conversation(conversationId),
        (existing) => mergeAssistantConversationPage(existing, olderPage, 'prepend-older'),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load older messages.');
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [activeConversation?.messagePage?.hasMore, activeConversation?.messagePage?.nextCursorCreatedAt, activeConversation?.messagePage?.nextCursorId, conversationId, isLoadingOlderMessages]);

  const handleAttach = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: Event) => {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;
    input.value = '';

    setError(null);

    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      if (!isImage) {
        setAttachments((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            file,
            filename: file.name,
            mimeType: file.type,
            isImage,
            previewUrl: undefined,
            uploadedId: null,
            uploadedConversationId: null,
          },
        ]);
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setAttachments((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            file,
            filename: file.name,
            mimeType: file.type,
            isImage,
            previewUrl: result,
            uploadedId: null,
            uploadedConversationId: null,
          },
        ]);
      };
      reader.onerror = () => setError(`Could not read ${file.name}.`);
      reader.readAsDataURL(file);
    }
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const ensureUploadedAttachments = useCallback(async (targetConversationId: string) => {
    const current = [...attachmentsRef.current];
    const attachmentIds: string[] = [];

    for (const attachment of current) {
      if (attachment.uploadedId && attachment.uploadedConversationId === targetConversationId) {
        attachmentIds.push(attachment.uploadedId);
        continue;
      }

      const uploaded = await assistantService.uploadAttachment({
        conversationId: targetConversationId,
        file: attachment.file,
      });
      attachmentIds.push(uploaded.id);
      setAttachments((prev) =>
        prev.map((item) =>
          item.id === attachment.id
            ? { ...item, uploadedId: uploaded.id, uploadedConversationId: targetConversationId }
            : item,
        ),
      );
    }

    return attachmentIds;
  }, []);

  const handleCreateConversation = useCallback(async (nextPrompt: string) => {
    const trimmedPrompt = nextPrompt.trim();
    if (!trimmedPrompt) {
      setError('Enter a message to start a conversation.');
      return;
    }

    setError(null);
    setStatusMessage(null);
    setIsStreamingRun(true);
    setPendingUserMessage(trimmedPrompt);
    activeRunAbortRef.current?.abort();
    const runController = new AbortController();
    activeRunAbortRef.current = runController;

    try {
      const hasAttachments = attachmentsRef.current.length > 0;
      let result: { runId: string | null; conversationId: string | null; workflowId: string | null };
      let targetConversationId: string | null = null;

      if (hasAttachments) {
        const conversation = await assistantService.createConversation({ title: trimmedPrompt.slice(0, 60) });
        targetConversationId = conversation.conversation.id;
        const attachmentIds = await ensureUploadedAttachments(targetConversationId);
        result = await assistantService.streamRun(
          {
            conversationId: targetConversationId,
            content: trimmedPrompt,
            attachmentIds,
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
          { signal: runController.signal },
        );
      } else {
        result = await assistantService.streamRun(
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
          { signal: runController.signal },
        );
      }

      setPrompt('');
      setAttachments([]);
      setStatusMessage(null);
      const resolvedConversationId = targetConversationId ?? result.conversationId;
      if (resolvedConversationId) {
        await reconcileConversationCache(resolvedConversationId);
        invalidateAssistantDrivenQueries();
        router.replace(`/ai/thread/${resolvedConversationId}`);
      }
    } catch (err) {
      const message = getAssistantErrorMessage(err, 'Failed to start conversation.');
      if (message) {
        setError(message);
      }
    } finally {
      if (activeRunAbortRef.current === runController) {
        activeRunAbortRef.current = null;
      }
      setIsStreamingRun(false);
      setPendingUserMessage(null);
    }
  }, [ensureUploadedAttachments, invalidateAssistantDrivenQueries, reconcileConversationCache, router]);

  const handleSend = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError('Enter a message to continue the conversation.');
      return;
    }

    clearComposer();

    if (!isThreadMode || !conversationId) {
      await handleCreateConversation(trimmedPrompt);
      return;
    }

    setError(null);
    setStatusMessage(null);
    setIsStreamingRun(true);
    setStreamingAssistantState({ text: '', toolName: null, approvalRequested: false });
    activeRunAbortRef.current?.abort();
    const runController = new AbortController();
    activeRunAbortRef.current = runController;
    let optimisticUserMessage: AssistantMessage | null = null;

    try {
      const attachmentIds = await ensureUploadedAttachments(conversationId);
      optimisticUserMessage = createOptimisticUserMessage(trimmedPrompt);
      queryClient.setQueryData<AssistantConversation>(
        queryKeys.assistant.conversation(conversationId),
        (existing) => appendAssistantConversationMessage(existing, optimisticUserMessage!),
      );

      await assistantService.streamRun(
        { conversationId, content: trimmedPrompt, attachmentIds },
        async (event) => {
          if (event.type === 'plan.updated') {
            setStatusMessage('Planning next step...');
          }
          if (event.type === 'tool.called') {
            setStatusMessage(`Running ${String(event.payload?.toolName ?? 'tool')}...`);
            setStreamingAssistantState((current) => ({
              text: current?.text ?? '',
              toolName: String(event.payload?.toolName ?? 'tool'),
              approvalRequested: current?.approvalRequested ?? false,
            }));
          }
          if (event.type === 'approval.requested') {
            setStatusMessage('Approval requested.');
            setStreamingAssistantState((current) => ({
              text: current?.text ?? '',
              toolName: current?.toolName ?? null,
              approvalRequested: true,
            }));
          }
          if (event.type === 'assistant.message.delta') {
            const nextChunk = String(event.payload?.content ?? '');
            if (nextChunk) {
              setStreamingAssistantState((current) => ({
                text: `${current?.text ?? ''}${nextChunk}`,
                toolName: current?.toolName ?? null,
                approvalRequested: current?.approvalRequested ?? false,
              }));
            }
          }
        },
        { signal: runController.signal },
      );
      setAttachments([]);
      setStatusMessage(null);
      await reconcileConversationCache(conversationId);
      invalidateAssistantDrivenQueries();
    } catch (err) {
      if (optimisticUserMessage) {
        queryClient.setQueryData<AssistantConversation>(
          queryKeys.assistant.conversation(conversationId),
          (existing) => removeAssistantConversationMessage(existing, optimisticUserMessage!.id),
        );
      }

      const message = getAssistantErrorMessage(err, 'Failed to send message.');
      if (message) {
        setError(message);
      }

      if (!(err instanceof ApiError && err.code === 'REQUEST_ABORTED')) {
        try {
          await reconcileConversationCache(conversationId);
        } catch (reconcileError) {
          console.error('Failed to reconcile assistant conversation cache after send error.', reconcileError);
        }
      }
    } finally {
      if (activeRunAbortRef.current === runController) {
        activeRunAbortRef.current = null;
      }
      setStreamingAssistantState(null);
      setIsStreamingRun(false);
    }
  }, [clearComposer, conversationId, ensureUploadedAttachments, handleCreateConversation, invalidateAssistantDrivenQueries, isThreadMode, prompt, reconcileConversationCache]);

  const handleComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (Platform.OS !== 'web') return;

      const key = event.key;
      const isShiftPressed = Boolean(event.shiftKey);
      if (key !== 'Enter' || isShiftPressed) return;

      event.preventDefault?.();
      event.stopPropagation?.();
      if (isSubmitting) return;

      void handleSend();
    },
    [handleSend, isSubmitting],
  );

  const handleComposerChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(event.currentTarget.value);
  }, []);

  useEffect(() => {
    if (!pendingVoiceSend) return;
    setPendingVoiceSend(false);
    void handleSend();
  }, [handleSend, pendingVoiceSend]);

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
      if (conversationId) {
        await reconcileConversationCache(conversationId);
      }
      invalidateAssistantDrivenQueries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply workflow decision.');
    }
  }, [activeConversation?.workflow?.id, conversationId, decision, invalidateAssistantDrivenQueries, reconcileConversationCache]);

  const handleNewChat = useCallback(() => {
    activeRunAbortRef.current?.abort();
    activeRunAbortRef.current = null;
    setPrompt('');
    setError(null);
    setStatusMessage(null);
    setStreamingAssistantState(null);
    setIsDictating(false);
    router.replace({
      pathname: '/ai',
    });
  }, [router]);

  const handleOpenConversation = useCallback((nextConversationId: string) => {
    activeRunAbortRef.current?.abort();
    activeRunAbortRef.current = null;
    setError(null);
    setStatusMessage(null);
    setPrompt('');
    setStreamingAssistantState(null);
    router.replace(`/ai/thread/${nextConversationId}`);
  }, [router]);

  const toggleHistoryRail = useCallback(() => {
    setIsHistoryRailOpen((current) => {
      const next = !current;
      writeStoredHistoryRailOpen(next);
      return next;
    });
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

      if (isVoiceSendCommand(transcript)) {
        setStatusMessage('Sending...');
        setPendingVoiceSend(true);
        recognition.stop();
        return;
      }

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
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'text/plain,text/csv,application/csv,image/jpeg,image/png,image/webp';
    input.style.display = 'none';
    input.addEventListener('change', handleFileChange);
    document.body.appendChild(input);
    fileInputRef.current = input;
    return () => {
      input.removeEventListener('change', handleFileChange);
      document.body.removeChild(input);
    };
  }, [handleFileChange]);

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
    <View style={{ flex: 1, flexDirection: isHistoryRailOpen && isDesktop ? 'row' : 'column' }}>
      <AssistantPanelShell
            activeTab="chat"
            isHistoryOpen={isHistoryRailOpen}
            onToggleHistory={toggleHistoryRail}
            subtitle={
              activeConversation?.workflow
                ? `Workflow status: ${renderWorkflowStatus(activeConversation.workflow.status)}`
                : 'Ask about inventory, purchasing, products, reporting, or navigation.'
            }
            footer={
              <View
                style={{
                  backgroundColor: '#FFFFFF',
                  borderTopWidth: 0.5,
                  borderTopColor: 'rgba(0,0,0,0.07)',
                  paddingHorizontal: 22,
                  paddingTop: 14,
                  paddingBottom: 18,
                }}
              >
                {/* Input field */}
                <View
                  style={{
                    width: '100%',
                    backgroundColor: '#FDF4F0',
                    borderWidth: 0.5,
                    borderColor: 'rgba(0,0,0,0.08)',
                    borderRadius: 11,
                    paddingHorizontal: 15,
                    paddingTop: 13,
                    paddingBottom: 32,
                  }}
                >
                  {Platform.OS === 'web' ? (
                    <textarea
                      ref={webComposerRef}
                      id="assistant-chat-composer"
                      name="assistant-chat-composer"
                      aria-label="Ask My AI Assistant"
                      aria-describedby="assistant-chat-composer-hint"
                      placeholder="Ask anything"
                      value={prompt}
                      onChange={handleComposerChange}
                      onKeyDown={handleComposerKeyDown}
                      style={{
                        width: '100%',
                        minHeight: 60,
                        resize: 'none',
                        backgroundColor: 'transparent',
                        border: 'none',
                        outline: 'none',
                        fontSize: 13.5,
                        lineHeight: '22px',
                        color: '#1a1a1a',
                        caretColor: '#FF5C00',
                        display: 'block',
                        padding: 0,
                        fontFamily: 'inherit',
                      } as React.CSSProperties}
                    />
                  ) : (
                    <TextInput
                      ref={composerInputRef}
                      nativeID="assistant-chat-composer"
                      accessibilityLabel="Ask My AI Assistant"
                      accessibilityHint="Send a message to create or continue an AI workflow."
                      placeholder="Ask anything"
                      placeholderTextColor="#bbbbbb"
                      selectionColor="#FF5C00"
                      value={prompt}
                      onChangeText={setPrompt}
                      multiline
                      textAlignVertical="top"
                      style={{ minHeight: 60, fontSize: 13.5, color: '#1a1a1a' }}
                      {...({ id: 'assistant-chat-composer', name: 'assistant-chat-composer' } as unknown as Record<string, string>)}
                    />
                  )}
                </View>

                <Text
                  nativeID="assistant-chat-composer-hint"
                  style={{ fontSize: 11.5, color: '#999999', marginTop: 6 }}
                >
                  Press Enter to send. Shift + Enter for a new line.
                </Text>

                {attachments.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    {attachments.map((a) => (
                      <View
                        key={a.id}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 }}
                      >
                        {a.isImage && a.previewUrl ? (
                          <Image source={{ uri: a.previewUrl }} style={{ width: 24, height: 24, borderRadius: 4 }} accessibilityLabel={a.filename} />
                        ) : null}
                        <Text style={{ fontSize: 12, color: '#333', maxWidth: 140 }} numberOfLines={1}>{a.filename}</Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${a.filename}`}
                          onPress={() => handleRemoveAttachment(a.id)}
                        >
                          <X size={12} color={ICON_SUBTLE} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Footer row: icons + send button */}
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}
                >
                  <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Start a new conversation"
                      onPress={handleNewChat}
                    >
                      <MessageSquarePlus size={18} color={ICON_PRIMARY} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={isDictating ? 'Stop dictation' : 'Start dictation'}
                      accessibilityState={{ busy: isDictating, disabled: !recognitionCtorRef.current }}
                      onPress={handleDictate}
                    >
                      {isDictating
                        ? <Square size={18} color={ICON_PRIMARY} />
                        : <Mic size={18} color={ICON_PRIMARY} />}
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Attach a file"
                      onPress={handleAttach}
                    >
                      <Paperclip size={18} color={ICON_PRIMARY} />
                    </Pressable>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void handleSend()}
                    style={{
                      backgroundColor: isSubmitting ? '#FF8C47' : '#FF5C00',
                      borderRadius: 9,
                      paddingHorizontal: 20,
                      paddingVertical: 10,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 7,
                    }}
                  >
                    <Send size={15} color="#FFFFFF" />
                    <Text style={{ fontSize: 13, fontWeight: '500', color: '#FFFFFF' }}>
                      {isThreadMode ? 'Send' : 'Start chat'}
                    </Text>
                  </Pressable>
                </View>

                {error ? (
                  <Text style={{ marginTop: 10, fontSize: 13, color: 'rgb(180,35,24)' }}>{error}</Text>
                ) : null}
              </View>
            }
          >
            <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: '#FDF4F0' }}>
              <View
                style={
                  activeConversation || pendingUserMessage
                    ? { paddingHorizontal: 22, paddingTop: 28, gap: 24 }
                    : { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, paddingTop: 28 }
                }
              >
                {mode === 'new' && !pendingUserMessage ? (
                  <View style={{ width: '100%', maxWidth: 580, alignItems: 'center' }}>
                    {/* AI pill */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 7,
                        backgroundColor: '#FFFFFF',
                        borderWidth: 0.5,
                        borderColor: 'rgba(0,0,0,0.10)',
                        borderRadius: 999,
                        paddingHorizontal: 16,
                        paddingVertical: 6,
                        marginBottom: 20,
                      }}
                    >
                      <Sparkles size={15} color={ICON_PRIMARY} />
                      <Text style={{ fontSize: 13, fontWeight: '500', color: '#FF5C00' }}>Inventory AI</Text>
                    </View>

                    {/* Heading */}
                    <Text
                      style={{
                        fontSize: 17,
                        fontWeight: '500',
                        color: '#1a1a1a',
                        marginBottom: 7,
                        textAlign: 'center',
                      }}
                    >
                      What do you need help with today?
                    </Text>

                    {/* Sub-text */}
                    <Text
                      style={{
                        fontSize: 13,
                        color: '#999999',
                        textAlign: 'center',
                        maxWidth: 400,
                        lineHeight: 21,
                        marginBottom: 26,
                      }}
                    >
                      Start a conversation for stock checks, PO workflows, product updates, reporting, or in-app navigation.
                    </Text>

                    {/* Suggestion chips — horizontal flex-wrap */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, justifyContent: 'center', width: '100%' }}>
                      {promptSuggestions.map((suggestion) => (
                        <Pressable
                          key={suggestion}
                          accessibilityRole="button"
                          onPress={() => handleSuggestion(suggestion)}
                          style={{
                            backgroundColor: '#FFFFFF',
                            borderWidth: 0.5,
                            borderColor: 'rgba(0,0,0,0.09)',
                            borderRadius: 999,
                            paddingHorizontal: 15,
                            paddingVertical: 8,
                          }}
                        >
                          <Text style={{ fontSize: 12.5, color: '#555555' }}>{suggestion}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}

                {/* Optimistic user message — shown immediately on new-conversation send */}
                {pendingUserMessage && mode === 'new' ? (
                  <>
                    {/* User bubble — right aligned */}
                    <View style={{ width: '100%', alignItems: 'flex-end' }}>
                      <View style={{ maxWidth: '72%', alignItems: 'flex-end', gap: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingRight: 2 }}>
                          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FF5C00', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFFFFF' }}>{userInitials}</Text>
                          </View>
                        </View>
                        <View style={{ backgroundColor: '#FFF0EA', borderRadius: 14, borderTopRightRadius: 4, borderWidth: 0.5, borderColor: '#F4C4A8', paddingHorizontal: 16, paddingVertical: 12 }}>
                          <Text style={{ fontSize: 14, lineHeight: 22, color: '#1a1a1a' }}>{pendingUserMessage}</Text>
                        </View>
                      </View>
                    </View>
                    {/* Thinking indicator — left aligned, same as assistant streaming row */}
                    <View style={{ gap: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 2 }}>
                        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FF5C00', alignItems: 'center', justifyContent: 'center' }}>
                          <Sparkles size={11} color="#FFFFFF" />
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: '500', color: '#777777' }}>Assistant</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: '#999999', paddingLeft: 2 }}>Thinking…</Text>
                    </View>
                  </>
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

                {activeConversation?.messagePage?.hasMore ? (
                  <View className="w-full max-w-3xl items-center">
                    <AppButton
                      label={isLoadingOlderMessages ? 'Loading older messages...' : 'Load older messages'}
                      size="sm"
                      variant="secondary"
                      onPress={() => void loadOlderMessages()}
                      loading={isLoadingOlderMessages}
                    />
                  </View>
                ) : null}

                {activeConversation?.messages.map((turn) => {
                  const isUser = turn.role === 'user';
                  return (
                    <View key={turn.id} style={{ width: '100%', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                      {isUser ? (
                        /* ── User message ── */
                        <View style={{ maxWidth: '72%', alignItems: 'flex-end', gap: 6 }}>
                          {/* Meta row: timestamp + "You" label + avatar */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingRight: 2 }}>
                            <Text style={{ fontSize: 11, color: '#bbbbbb' }}>{formatDate(turn.createdAt)}</Text>
                              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FF5C00', alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFFFFF' }}>{userInitials}</Text>
                            </View>
                          </View>
                          {/* Bubble */}
                          <View style={{ backgroundColor: '#FFF0EA', borderRadius: 14, borderTopRightRadius: 4, borderWidth: 0.5, borderColor: '#F4C4A8', paddingHorizontal: 16, paddingVertical: 12 }}>
                            <AssistantMessageBlocks blocks={turn.blocks} />
                          </View>
                        </View>
                      ) : (
                        /* ── Assistant message ── */
                        <View style={{ maxWidth: '88%', gap: 8 }}>
                          {/* Meta row: AI avatar + label + timestamp */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 2 }}>
                            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FF5C00', alignItems: 'center', justifyContent: 'center' }}>
                              <Sparkles size={11} color="#FFFFFF" />
                            </View>
                            <Text style={{ fontSize: 12, fontWeight: '500', color: '#777777' }}>Assistant</Text>
                            <Text style={{ fontSize: 11, color: '#bbbbbb' }}>{formatDate(turn.createdAt)}</Text>
                          </View>
                          {/* Bubble: white card with orange left accent */}
                          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, borderTopLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)', borderLeftWidth: 3, borderLeftColor: '#FF5C00', paddingHorizontal: 16, paddingVertical: 14 }}>
                            <AssistantMessageBlocks blocks={turn.blocks} />
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}

                {isThreadMode && isStreamingRun ? (
                  <View style={{ gap: 8 }}>
                    {/* Avatar + label row — always shown while streaming */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 2 }}>
                      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FF5C00', alignItems: 'center', justifyContent: 'center' }}>
                        <Sparkles size={11} color="#FFFFFF" />
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: '500', color: '#777777' }}>Assistant</Text>
                    </View>
                    {/* Show "Thinking…" until actual response text arrives, then show the bubble */}
                    {streamingAssistantState?.text.trim() ? (
                      <View style={{ maxWidth: '88%', backgroundColor: '#FFFFFF', borderRadius: 14, borderTopLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)', borderLeftWidth: 3, borderLeftColor: '#FF5C00', paddingHorizontal: 16, paddingVertical: 14 }}>
                        <AssistantMessageBlocks blocks={streamingAssistantBlocks} />
                      </View>
                    ) : (
                      <Text style={{ fontSize: 12, color: '#999999', paddingLeft: 2 }}>Thinking…</Text>
                    )}
                  </View>
                ) : null}

                {activeConversation && activeConversation.messages.length === 0 ? (
                  <View className="w-full max-w-3xl rounded-lg border border-dashed border-border bg-surface-2 px-5 py-5">
                    <Text className="text-small text-muted">No messages in this conversation yet.</Text>
                  </View>
                ) : null}

                {pendingAction?.actions?.length ? (
                  <View className="w-full max-w-3xl rounded-xl border border-border bg-surface-2 px-5 py-5">
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
          </AssistantPanelShell>

          {isHistoryRailOpen ? (
            <View className={isDesktop ? 'lg:w-[340px]' : 'w-full'}>
              <View className="h-full min-h-[420px] rounded-xl border border-border bg-surface shadow-sm">
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
                      <View className="gap-3 rounded-lg border border-error/20 bg-error-tint px-4 py-4">
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
                              className={`rounded-lg border px-4 py-3 ${
                                isActive ? 'border-primary bg-primary-tint' : 'border-border bg-surface-2'
                              }`}
                            >
                              <Text className={`text-body font-semibold ${isActive ? 'text-primary' : 'text-text'}`}>
                                {item.title}
                              </Text>
                              <Text numberOfLines={2} className={`mt-1 text-small ${isActive ? 'text-primary' : 'text-muted'}`}>
                                {item.lastMessagePreview || 'No assistant response yet.'}
                              </Text>
                              <Text className={`mt-2 text-caption ${isActive ? 'text-primary' : 'text-subtle'}`}>
                                {formatDate(item.updatedAt)}
                              </Text>
                            </Pressable>
                          );
                        })}

                        {conversations.length === 0 ? (
                          <View className="rounded-lg border border-dashed border-border bg-surface-2 px-4 py-5">
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
  );
}
