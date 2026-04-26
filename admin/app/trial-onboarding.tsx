import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { AppBadge, AppButton, AppCard } from '@admin/components/ui';
import { resolvePlan } from '@admin/features/billing/plan-catalog';
import { AuthScreenShell, useAuthSession } from '@admin/features/auth';

function daysRemaining(trialEndsAt: string | null) {
  if (!trialEndsAt) return null;
  const diffMs = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export default function TrialOnboardingScreen() {
  const router = useRouter();
  const { isAuthenticated, portalMode, user } = useAuthSession();

  useEffect(() => {
    if (!isAuthenticated || portalMode !== 'business' || user?.principalType !== 'tenant_user') {
      router.replace('/login');
    }
  }, [isAuthenticated, portalMode, router, user?.principalType]);

  if (!isAuthenticated || portalMode !== 'business' || user?.principalType !== 'tenant_user') {
    return null;
  }

  const billing = user.billing;
  const plan = resolvePlan(billing?.planCode);
  const remainingDays = daysRemaining(billing?.trialEndsAt ?? null);

  return (
    <AuthScreenShell title="Your trial is active" subtitle="Billing setup is optional for now. You have full access while the 15-day trial is running.">
      <View className="gap-4">
        <AppCard title={`${plan.name} plan`} subtitle={plan.monthlyPriceLabel}>
          <View className="gap-3">
            <AppBadge label={billing?.billingStatus ?? 'trialing'} tone="info" />
            <Text className="text-small text-muted">
              Trial ends {billing?.trialEndsAt ? new Date(billing.trialEndsAt).toLocaleDateString() : 'soon'}.
              {remainingDays !== null ? ` ${remainingDays} day${remainingDays === 1 ? '' : 's'} remaining.` : ''}
            </Text>
            <Text className="text-small text-muted">
              Payment setup is currently {billing?.paymentSetupStatus ?? 'not_started'}. Direct debit setup will be added next, but you can continue using the app now.
            </Text>
          </View>
        </AppCard>

        <View className="gap-3">
          <AppButton label="Set up billing later" onPress={() => router.replace('/ai')} fullWidth />
          <AppButton label="View billing details" variant="secondary" onPress={() => router.push('/billing')} fullWidth />
        </View>
      </View>
    </AuthScreenShell>
  );
}
