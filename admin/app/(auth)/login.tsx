import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { AppButton, AppInput } from '@/components/ui';
import { AuthScreenShell, useAuthSession } from '@/features/auth';

export default function LoginScreen() {
  const { signIn, signInWithSso } = useAuthSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ssoSubmitting, setSsoSubmitting] = useState(false);

  const handleLogin = async () => {
    setError(null);

    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }

    try {
      setSubmitting(true);
      await signIn({ email, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSsoLogin = async () => {
    setError(null);
    try {
      setSsoSubmitting(true);
      await signInWithSso();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start SSO.');
    } finally {
      setSsoSubmitting(false);
    }
  };

  return (
    <AuthScreenShell title="Sign in">
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })}>
        <View className="gap-4 w-480">
          <AppInput
            label="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
            placeholder="name@company.com"
          />

          <AppInput
            label="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
          />

          {error ? <Text className="text-caption text-error">{error}</Text> : null}

          <AppButton label="Sign in" onPress={handleLogin} loading={submitting} fullWidth />
          <AppButton label="Continue with SSO" variant="secondary" onPress={handleSsoLogin} loading={ssoSubmitting} fullWidth />

          <Link href="/forgot-password" asChild>
            <Pressable>
              <Text className="text-center text-small text-primary">Forgot password?</Text>
            </Pressable>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </AuthScreenShell>
  );
}
