import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AppButton, AppInput } from '@/components/ui';
import { AuthScreenShell, useAuthSession } from '@/features/auth';

export default function MfaScreen() {
  const { verifyMfa, signOut } = useAuthSession();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    setError(null);

    try {
      setLoading(true);
      await verifyMfa(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MFA verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenShell title="Multi-factor verification" subtitle="Enter the 6-digit code from your authenticator app">
      <View className="gap-4">
        <AppInput
          label="Verification code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="123456"
        />

        {error ? <Text className="text-caption text-error">{error}</Text> : null}

        <AppButton label="Verify" fullWidth onPress={handleVerify} loading={loading} />

        <Pressable onPress={signOut}>
          <Text className="text-center text-small text-muted">Use a different account</Text>
        </Pressable>

        <Link href="/login" asChild>
          <Pressable>
            <Text className="text-center text-small text-primary">Back to login</Text>
          </Pressable>
        </Link>
      </View>
    </AuthScreenShell>
  );
}
