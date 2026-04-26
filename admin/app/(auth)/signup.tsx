import { Link, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { AppButton, AppInput, AppSelect } from '@admin/components/ui';
import { PLAN_OPTIONS } from '@admin/features/billing/plan-catalog';
import { AuthScreenShell, useAuthSession } from '@admin/features/auth';

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function SignupScreen() {
  const router = useRouter();
  const { portalMode, signUpBusiness } = useAuthSession();
  const [businessName, setBusinessName] = useState('');
  const [businessSlug, setBusinessSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [planCode, setPlanCode] = useState<'starter' | 'growth' | 'pro'>('starter');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (slugTouched) return;
    setBusinessSlug(slugify(businessName));
  }, [businessName, slugTouched]);

  const resolvedSlug = useMemo(() => slugify(businessSlug), [businessSlug]);

  useEffect(() => {
    if (portalMode === 'platform') {
      router.replace('/login');
    }
  }, [portalMode, router]);

  const handleSignup = async () => {
    setError(null);

    if (!businessName || !adminName || !email || !password || !resolvedSlug) {
      setError('Complete all fields to start the trial.');
      return;
    }

    try {
      setSubmitting(true);
      await signUpBusiness({
        businessName,
        businessSlug: resolvedSlug,
        adminName,
        email,
        password,
        planCode,
      });
      router.replace('/trial-onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start the trial.');
    } finally {
      setSubmitting(false);
    }
  };

  if (portalMode === 'platform') {
    return null;
  }

  return (
    <AuthScreenShell title="Start your 15-day trial" subtitle="Create your business workspace and primary admin account.">
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View className="gap-4 w-480">
            <AppInput
              label="Business name"
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="StockAisle Retail Ltd"
            />

            <AppInput
              label="Business slug"
              value={businessSlug}
              onChangeText={(value) => {
                setSlugTouched(true);
                setBusinessSlug(value);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="stockaisle-retail"
              hint="Used as your business workspace path."
            />

            <AppInput
              label="Primary admin name"
              value={adminName}
              onChangeText={setAdminName}
              placeholder="Alex Morgan"
            />

            <AppInput
              label="Admin email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              placeholder="alex@company.com"
            />

            <AppInput
              label="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="Minimum 8 characters"
            />

            <AppSelect
              label="Plan"
              value={planCode}
              options={PLAN_OPTIONS}
              onValueChange={(value) => setPlanCode(value as 'starter' | 'growth' | 'pro')}
              hint="Billing setup is optional during the 15-day trial."
            />

            {error ? <Text className="text-caption text-error">{error}</Text> : null}

            <AppButton label="Create business and start trial" onPress={handleSignup} loading={submitting} fullWidth />

            <Link href="/login" asChild>
              <Pressable accessibilityRole="link" accessibilityLabel="Back to sign in" accessibilityHint="Returns to the login screen.">
                <Text className="text-center text-small text-primary">Already have an account? Sign in</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AuthScreenShell>
  );
}
