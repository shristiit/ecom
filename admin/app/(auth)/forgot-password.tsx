import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AppButton, AppInput } from '@admin/components/ui';
import { AuthScreenShell, useAuthSession } from '@admin/features/auth';

export default function ForgotPasswordScreen() {
  const { requestPasswordReset } = useAuthSession();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setMessage(null);

    if (!email) {
      setError('Email is required.');
      return;
    }

    try {
      setLoading(true);
      await requestPasswordReset(email);
      setMessage('If your account exists, reset instructions have been sent to your email.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenShell title="Forgot password" subtitle="We will send reset instructions to your email">
      <View className="gap-4">
        <AppInput
          label="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          placeholder="name@company.com"
        />

        {error ? <Text className="text-caption text-error">{error}</Text> : null}
        {message ? <Text className="text-caption text-success">{message}</Text> : null}

        <AppButton label="Send reset link" fullWidth onPress={handleSubmit} loading={loading} />

        <Link href="/login" asChild>
          <Pressable accessibilityRole="link" accessibilityLabel="Back to login" accessibilityHint="Returns to the sign in page.">
            <Text className="text-center text-small text-primary">Back to login</Text>
          </Pressable>
        </Link>
      </View>
    </AuthScreenShell>
  );
}
