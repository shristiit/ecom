import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';

import { loginStorefrontCustomer } from '@/lib/storefront';

const TENANT_ID = (process.env.EXPO_PUBLIC_TENANT_ID ?? '').trim();

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSubmit = !submitting && email.trim().length > 0 && password.length > 0 && TENANT_ID.length > 0;

  const handleSignIn = async () => {
    if (!canSubmit) {
      return;
    }

    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await loginStorefrontCustomer(email.trim(), password);
      setSuccess('Signed in successfully.');
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-bgPrimary" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView className="flex-1 px-6 py-8" keyboardShouldPersistTaps="handled">
        <View className="gap-5">
          <View className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
            <Text className="text-2xl font-semibold text-textPrimary">Sign in</Text>
            <Text className="mt-2 text-textSecondary">Access your storefront account.</Text>
          </View>

          <View className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
            <Text className="text-small font-medium text-textPrimary">Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@example.com"
              placeholderTextColor="rgb(100 116 139)"
              className="mt-2 rounded-md border border-borderSubtle bg-bgPrimary px-4 py-3 text-body text-textPrimary"
            />

            <Text className="mt-4 text-small font-medium text-textPrimary">Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              placeholder="Enter password"
              placeholderTextColor="rgb(100 116 139)"
              className="mt-2 rounded-md border border-borderSubtle bg-bgPrimary px-4 py-3 text-body text-textPrimary"
            />

            <Pressable
              onPress={handleSignIn}
              disabled={!canSubmit}
              className={`mt-5 items-center rounded-md px-4 py-3 ${canSubmit ? 'bg-accent' : 'bg-borderSubtle'}`}
            >
              {submitting ? (
                <ActivityIndicator color={canSubmit ? 'rgb(11 15 20)' : 'rgb(100 116 139)'} />
              ) : (
                <Text className={`font-semibold ${canSubmit ? 'text-on-primary' : 'text-textMuted'}`}>Sign in</Text>
              )}
            </Pressable>

            {error ? (
              <Text className="mt-3 text-small text-error">{error}</Text>
            ) : null}
            {success ? (
              <Text className="mt-3 text-small text-success">{success}</Text>
            ) : null}
            {!TENANT_ID ? (
              <Text className="mt-3 text-small text-error">Missing EXPO_PUBLIC_TENANT_ID in ecommerce/.env</Text>
            ) : null}
          </View>

          <Link href="/profile" asChild>
            <Pressable className="items-center rounded-md border border-borderSubtle bg-bgElevated px-4 py-3">
              <Text className="font-medium text-textPrimary">Back to Profile</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
