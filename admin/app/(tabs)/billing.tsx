import { ScrollView, Text, View } from 'react-native';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppInput,
  AppSelect,
  PageHeader,
  PageShell,
} from '@admin/components/ui';
import { resolvePlan } from '@admin/features/billing/plan-catalog';
import { useEffect, useState } from 'react';
import { billingService } from '@admin/features/billing/services/billing.service';
import { queryKeys, useMutation, useQuery } from '@admin/lib/query';

function daysRemaining(trialEndsAt: string | null) {
  if (!trialEndsAt) return null;
  const diffMs = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

function toneForStatus(status?: string) {
  if (status === 'active' || status === 'ready') return 'success' as const;
  if (status === 'past_due' || status === 'suspended') return 'warning' as const;
  return 'info' as const;
}

export default function BillingPaymentsScreen() {
  const query = useQuery({
    key: queryKeys.billing.summary(),
    queryFn: billingService.getSummary,
  });
  const billing = query.data;
  const plan = resolvePlan(billing?.planCode);
  const remainingDays = daysRemaining(billing?.trialEndsAt ?? null);
  const [planCode, setPlanCode] = useState('starter');
  const [billingContactName, setBillingContactName] = useState('');
  const [billingContactEmail, setBillingContactEmail] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountMask, setAccountMask] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('not_started');

  useEffect(() => {
    if (!billing) return;
    setPlanCode(billing.planCode);
    setBillingContactName(billing.billingContact.name);
    setBillingContactEmail(billing.billingContact.email);
    setAccountName(billing.paymentMethod.accountName);
    setAccountMask(billing.paymentMethod.accountMask);
    setPaymentStatus(billing.paymentMethod.status);
  }, [billing]);

  const subscriptionMutation = useMutation({
    mutationFn: (payload: { planCode?: string; billingContactName?: string; billingContactEmail?: string }) =>
      billingService.updateSubscription(payload),
    onSuccess: (next) => query.setData(next),
  });
  const paymentMutation = useMutation({
    mutationFn: (payload: { accountName?: string; accountMask?: string; status?: string }) =>
      billingService.updatePaymentMethod(payload),
    onSuccess: (next) => query.setData(next),
  });
  const removePaymentMethodMutation = useMutation({
    mutationFn: () => billingService.removePaymentMethod(),
    onSuccess: (next) => query.setData(next),
  });

  const planOptions = [
    { label: 'Starter · £199/month', value: 'starter', description: 'Early-stage business plan.' },
    { label: 'Growth · £299/month', value: 'growth', description: 'Operational growth plan.' },
    { label: 'Pro · £499/month', value: 'pro', description: 'Scale plan for larger teams.' },
  ];
  const paymentStatusOptions = [
    { label: 'Not started', value: 'not_started', description: 'No payment method is configured yet.' },
    { label: 'Pending', value: 'pending', description: 'Payment method collection is in progress.' },
    { label: 'Ready', value: 'ready', description: 'Payment method details are ready for billing.' },
  ];

  return (
    <PageShell variant="settings">
      <ScrollView className="px-6 py-6">
        <PageHeader
          title="Billing & Payments"
          subtitle="Business-admin controls for the current plan, trial state, billing contacts, and payment method details."
        />

        <View className="gap-4 pb-6">
          <View className="flex-row flex-wrap gap-4">
            <View className="min-w-[260px] flex-1">
              <AppCard title="Selected plan">
                <Text className="text-[28px] font-semibold text-text">{plan.name}</Text>
                <Text className="mt-1 text-small text-muted">{plan.monthlyPriceLabel}</Text>
              </AppCard>
            </View>

            <View className="min-w-[260px] flex-1">
              <AppCard title="Trial ends">
                <Text className="text-[28px] font-semibold text-text">
                  {billing?.trialEndsAt ? new Date(billing.trialEndsAt).toLocaleDateString() : 'Pending'}
                </Text>
                <Text className="mt-1 text-small text-muted">
                  {remainingDays !== null ? `${remainingDays} day${remainingDays === 1 ? '' : 's'} remaining in the trial.` : 'Trial timeline will appear after signup completes.'}
                </Text>
              </AppCard>
            </View>

            <View className="min-w-[260px] flex-1">
              <AppCard title="Payment setup">
                <AppBadge label={billing?.paymentSetupStatus ?? 'not_started'} tone={toneForStatus(billing?.paymentSetupStatus)} />
                <Text className="mt-3 text-small text-muted">
                  Billing setup is optional during the trial. Business admins can still manage the tenant billing record here.
                </Text>
              </AppCard>
            </View>
          </View>

          <AppCard title="Subscription management" subtitle="Choose the active plan and maintain billing contact details for this business.">
            <View className="gap-3">
              <AppSelect label="Plan" value={planCode} options={planOptions} onValueChange={setPlanCode} />
              <AppInput label="Billing contact name" value={billingContactName} onChangeText={setBillingContactName} placeholder="Accounts payable contact" />
              <AppInput
                label="Billing contact email"
                value={billingContactEmail}
                onChangeText={setBillingContactEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="billing@company.com"
              />
              <AppButton
                label="Save subscription details"
                onPress={() =>
                  subscriptionMutation.mutateAsync({
                    planCode,
                    billingContactName,
                    billingContactEmail,
                  })
                }
                loading={subscriptionMutation.isPending}
              />
            </View>
          </AppCard>

          <AppCard title="Billing status" subtitle="Backend-backed subscription state for this tenant.">
            <View className="gap-3">
              <View className="rounded-md border border-border bg-surface-2 px-4 py-3">
                <Text className="text-caption uppercase tracking-wide text-subtle">Subscription status</Text>
                <View className="mt-2">
                  <AppBadge label={billing?.billingStatus ?? 'trialing'} tone={toneForStatus(billing?.billingStatus)} />
                </View>
              </View>

              <View className="rounded-md border border-border bg-surface-2 px-4 py-3">
                <Text className="text-caption uppercase tracking-wide text-subtle">Provider</Text>
                <Text className="mt-1 text-small font-semibold text-text">{billing?.provider ?? 'gocardless'}</Text>
                <Text className="mt-1 text-caption text-muted">
                  Current business subscription records remain tenant-isolated and editable by the business admin.
                </Text>
              </View>
            </View>
          </AppCard>

          <AppCard title="Payment method management" subtitle="Manage the tenant-visible payment method record used for subscription follow-up.">
            <View className="gap-3">
              <AppInput label="Account holder name" value={accountName} onChangeText={setAccountName} placeholder="Business bank account holder" />
              <AppInput label="Account ending / mask" value={accountMask} onChangeText={setAccountMask} placeholder="****1234" />
              <AppSelect label="Payment method status" value={paymentStatus} options={paymentStatusOptions} onValueChange={setPaymentStatus} />
              <View className="flex-row flex-wrap gap-3">
                <AppButton
                  label="Save payment method"
                  onPress={() =>
                    paymentMutation.mutateAsync({
                      accountName,
                      accountMask,
                      status: paymentStatus,
                    })
                  }
                  loading={paymentMutation.isPending}
                />
                <AppButton
                  label="Remove payment method"
                  variant="secondary"
                  onPress={() => removePaymentMethodMutation.mutateAsync(undefined)}
                  loading={removePaymentMethodMutation.isPending}
                />
              </View>
              <Text className="text-caption text-muted">
                This manages the tenant billing record now. The direct GoCardless handoff will replace manual entry in the next billing integration phase.
              </Text>
            </View>
          </AppCard>
        </View>
      </ScrollView>
    </PageShell>
  );
}
