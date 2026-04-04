import { useRouter } from 'expo-router';
import { ArrowUp, Mic, Search, Square } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

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

export function AssistantSearchBar() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [isDictating, setIsDictating] = useState(false);
  const recognitionRef = useRef<WebSpeechRecognitionInstance | null>(null);

  const recognitionCtor = useMemo(() => getSpeechRecognitionConstructor(), []);

  const openAssistant = () => {
    const prompt = value.trim();
    router.push({
      pathname: '/ai',
      params: prompt ? { prompt, autostart: '1' } : undefined,
    });
    setValue('');
  };

  const handleDictate = () => {
    if (!recognitionCtor) return;

    if (isDictating) {
      recognitionRef.current?.stop();
      setIsDictating(false);
      return;
    }

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
      setValue((current) => `${current.trim()} ${transcript}`.trim());
    };
    recognition.onerror = () => {
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

  return (
    <View className="max-w-[620px] flex-1 flex-row items-center rounded-md border border-border bg-surface-2 px-3 py-2">
      <Search size={16} color="#64748B" />
      <TextInput
        nativeID="assistant-search-input"
        accessibilityLabel="Ask My AI Assistant"
        accessibilityHint="Type a prompt and press enter or send to open the AI Assistant page."
        value={value}
        onChangeText={setValue}
        onSubmitEditing={openAssistant}
        placeholder="Ask My AI Assistant..."
        placeholderTextColor="rgb(var(--text-subtle))"
        returnKeyType="go"
        className="ml-2 flex-1 text-small text-text"
        {...({ id: 'assistant-search-input', name: 'assistant-search-input' } as unknown as Record<string, string>)}
      />
      <View className="ml-2 flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isDictating ? 'Stop dictation' : 'Start dictation'}
          accessibilityHint={
            recognitionCtor
              ? 'Uses your microphone to dictate a prompt for My AI Assistant.'
              : 'Dictation is unavailable in this browser.'
          }
          accessibilityState={{ disabled: !recognitionCtor, busy: isDictating }}
          onPress={handleDictate}
          disabled={!recognitionCtor}
          className={`h-8 w-8 items-center justify-center rounded-full ${
            isDictating ? 'bg-primary-tint' : 'bg-transparent'
          } ${!recognitionCtor ? 'opacity-40' : ''}`}
        >
          {isDictating ? <Square size={14} color="#1F3A5F" /> : <Mic size={14} color="#64748B" />}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send prompt to My AI Assistant"
          accessibilityHint="Opens the AI Assistant page with your current prompt."
          onPress={openAssistant}
          className="h-8 w-8 items-center justify-center rounded-full bg-primary"
        >
          <ArrowUp size={14} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}
