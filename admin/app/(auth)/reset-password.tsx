import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AppButton, AppInput } from '@admin/components/ui';
import { AuthScreenShell, useAuthSession } from '@admin/features/auth';

export default function ResetPasswordScreen() {
  const { resetPassword } = useAuthSession();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setMessage(null);

    if (!email || !token || !newPassword) {
      setError('Email, token, and new password are required.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      await resetPassword({ email, token, newPassword });
      setMessage('Password reset successfully. You can now sign in.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenShell title="Reset password" subtitle="Enter the reset token and set your new password">
      <View className="gap-4">
        <AppInput
          label="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          placeholder="name@company.com"
        />

        <AppInput label="Reset token" value={token} onChangeText={setToken} placeholder="Paste token" />

        <AppInput
          label="New password"
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="••••••••"
        />

        <AppInput
          label="Confirm new password"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="••••••••"
        />

        {error ? <Text className="text-caption text-error">{error}</Text> : null}
        {message ? <Text className="text-caption text-success">{message}</Text> : null}

        <AppButton label="Reset password" fullWidth onPress={handleSubmit} loading={loading} />

        <Link href="/login" asChild>
          <Pressable accessibilityRole="link" accessibilityLabel="Back to login" accessibilityHint="Returns to the sign in page.">
            <Text className="text-center text-small text-primary">Back to login</Text>
          </Pressable>
        </Link>
      </View>
    </AuthScreenShell>
  );
}
