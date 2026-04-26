import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppBadge, AppButton, AppCard, AppInput, PageHeader, PageShell } from '@admin/components/ui';
import { queryKeys, useMutation, useQuery } from '@admin/lib/query';
import { platformService } from '@admin/features/platform/services/platform.service';

export default function PlatformBusinessDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const businessId = Array.isArray(id) ? id[0] : id;

  const query = useQuery({
    key: queryKeys.platform.business(businessId ?? ''),
    enabled: Boolean(businessId),
    queryFn: () => platformService.getBusiness(businessId ?? ''),
  });

  useEffect(() => {
    if (!businessId) return;
    const intervalId = setInterval(() => {
      void query.refetch();
    }, 10000);
    return () => clearInterval(intervalId);
  }, [businessId, query.refetch]);

  const [lifecycleStatus, setLifecycleStatus] = useState('trialing');
  const [maxSkus, setMaxSkus] = useState('1000');
  const [monthlyAiTokens, setMonthlyAiTokens] = useState('250000');
  const [features, setFeatures] = useState('');
  const [restrictions, setRestrictions] = useState('');
  const [blockedFeatures, setBlockedFeatures] = useState('');
  const [writeBlocked, setWriteBlocked] = useState('false');
  const [reason, setReason] = useState('');
  const [planCode, setPlanCode] = useState('starter');
  const [providerCustomerId, setProviderCustomerId] = useState('');
  const [providerSubscriptionId, setProviderSubscriptionId] = useState('');

  useEffect(() => {
    if (!query.data) return;
    setLifecycleStatus(query.data.lifecycle_status);
    setMaxSkus(String(query.data.max_skus));
    setMonthlyAiTokens(String(query.data.monthly_ai_tokens));
    setFeatures((query.data.features ?? []).join(', '));
    setRestrictions((query.data.restrictions ?? []).join(', '));
    setBlockedFeatures((query.data.blocked_features ?? []).join(', '));
    setWriteBlocked(query.data.write_blocked ? 'true' : 'false');
    setReason(query.data.restriction_reason ?? '');
    setPlanCode(query.data.plan_code ?? 'starter');
    setProviderCustomerId(query.data.provider_customer_id ?? '');
    setProviderSubscriptionId(query.data.provider_subscription_id ?? '');
  }, [query.data]);

  const statusMutation = useMutation({
    mutationFn: (nextStatus: string) => platformService.updateBusinessStatus(businessId ?? '', nextStatus),
    onSuccess: () => query.refetch(),
  });
  const limitsMutation = useMutation({
    mutationFn: (payload: { maxSkus: number; monthlyAiTokens: number }) => platformService.updateBusinessLimits(businessId ?? '', payload),
    onSuccess: () => query.refetch(),
  });
  const entitlementsMutation = useMutation({
    mutationFn: (payload: { features: string[]; restrictions: string[]; blockedFeatures: string[]; writeBlocked: boolean; reason: string }) =>
      platformService.updateBusinessEntitlements(businessId ?? '', payload),
    onSuccess: () => query.refetch(),
  });
  const billingMutation = useMutation({
    mutationFn: (payload: { lifecycleStatus?: string; planCode?: string; providerCustomerId?: string; providerSubscriptionId?: string }) =>
      platformService.syncBusinessBilling(businessId ?? '', payload),
    onSuccess: () => query.refetch(),
  });

  const business = query.data;

  return (
    <PageShell>
      <ScrollView className="px-6 py-6">
        <PageHeader
          title={business?.name ?? 'Business detail'}
          subtitle="Platform-level controls for billing, entitlements, write restrictions, and quotas."
        />

        {business ? (
          <View className="gap-4 pb-8">
            <View className="flex-row flex-wrap gap-4">
              <View className="min-w-[220px] flex-1">
                <AppCard title="Lifecycle">
                  <AppBadge label={business.lifecycle_status} tone={business.lifecycle_status === 'active' ? 'success' : 'warning'} />
                  <Text className="mt-2 text-small text-muted">{business.slug}</Text>
                </AppCard>
              </View>
              <View className="min-w-[220px] flex-1">
                <AppCard title="SKU usage">
                  <Text className="text-[28px] font-semibold text-text">{business.sku_count} / {business.max_skus}</Text>
                </AppCard>
              </View>
              <View className="min-w-[220px] flex-1">
                <AppCard title="Trial billing">
                  <AppBadge label={business.billing_setup_status ?? 'not_started'} tone={business.billing_setup_status === 'ready' ? 'success' : 'info'} />
                  <Text className="mt-2 text-small text-muted">
                    Trial ends {business.trial_ends_at ? new Date(business.trial_ends_at).toLocaleDateString() : 'not set'}.
                  </Text>
                </AppCard>
              </View>
              <View className="min-w-[220px] flex-1">
                <AppCard title="AI tokens">
                  <Text className="text-[28px] font-semibold text-text">{business.ai_tokens_used} / {business.monthly_ai_tokens}</Text>
                </AppCard>
              </View>
            </View>

            <AppCard title="Status control" subtitle="Use lifecycle status to allow sign-in/read while blocking writes for past-due or suspended tenants.">
              <View className="gap-3">
                <AppInput label="Lifecycle status" value={lifecycleStatus} onChangeText={setLifecycleStatus} />
                <AppButton label="Update status" onPress={() => statusMutation.mutateAsync(lifecycleStatus)} loading={statusMutation.isPending} />
              </View>
            </AppCard>

            <AppCard title="Limits" subtitle="Per-tenant quotas enforced by the backend.">
              <View className="gap-3">
                <AppInput label="Max SKUs" keyboardType="numeric" value={maxSkus} onChangeText={setMaxSkus} />
                <AppInput label="Monthly AI tokens" keyboardType="numeric" value={monthlyAiTokens} onChangeText={setMonthlyAiTokens} />
                <AppButton
                  label="Save limits"
                  onPress={() =>
                    limitsMutation.mutateAsync({
                      maxSkus: Number(maxSkus) || business.max_skus,
                      monthlyAiTokens: Number(monthlyAiTokens) || business.monthly_ai_tokens,
                    })
                  }
                  loading={limitsMutation.isPending}
                />
              </View>
            </AppCard>

            <AppCard title="Entitlements and restrictions" subtitle="Feature toggles, blocked features, and explicit tenant restrictions.">
              <View className="gap-3">
                <AppInput label="Features" value={features} onChangeText={setFeatures} placeholder="products, inventory, chat" />
                <AppInput label="Restrictions" value={restrictions} onChangeText={setRestrictions} placeholder="manual_review, payment_watch" />
                <AppInput label="Blocked features" value={blockedFeatures} onChangeText={setBlockedFeatures} placeholder="chat, products" />
                <AppInput label="Write blocked" value={writeBlocked} onChangeText={setWriteBlocked} placeholder="true or false" />
                <AppInput label="Reason" value={reason} onChangeText={setReason} />
                <AppButton
                  label="Save entitlements"
                  onPress={() =>
                    entitlementsMutation.mutateAsync({
                      features: features.split(',').map((item) => item.trim()).filter(Boolean),
                      restrictions: restrictions.split(',').map((item) => item.trim()).filter(Boolean),
                      blockedFeatures: blockedFeatures.split(',').map((item) => item.trim()).filter(Boolean),
                      writeBlocked: writeBlocked.trim().toLowerCase() === 'true',
                      reason,
                    })
                  }
                  loading={entitlementsMutation.isPending}
                />
              </View>
            </AppCard>

            <AppCard title="GoCardless billing sync" subtitle="Store provider references and align lifecycle status with the latest billing state.">
              <View className="gap-3">
                <AppInput label="Plan code" value={planCode} onChangeText={setPlanCode} />
                <AppInput label="Provider customer ID" value={providerCustomerId} onChangeText={setProviderCustomerId} />
                <AppInput label="Provider subscription ID" value={providerSubscriptionId} onChangeText={setProviderSubscriptionId} />
                <AppButton
                  label="Sync billing"
                  onPress={() =>
                    billingMutation.mutateAsync({
                      lifecycleStatus,
                      planCode,
                      providerCustomerId,
                      providerSubscriptionId,
                    })
                  }
                  loading={billingMutation.isPending}
                />
              </View>
            </AppCard>
          </View>
        ) : (
          <Text className="text-small text-muted">Loading business...</Text>
        )}
      </ScrollView>
    </PageShell>
  );
}
