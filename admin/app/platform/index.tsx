import { Link } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppButton, AppCard, PageHeader, PageShell } from '@admin/components/ui';
import { useQuery, queryKeys } from '@admin/lib/query';
import { platformService } from '@admin/features/platform/services/platform.service';

export default function PlatformOverviewScreen() {
  const businessesQuery = useQuery({
    key: queryKeys.platform.businesses(),
    queryFn: () => platformService.listBusinesses(),
  });
  const adminsQuery = useQuery({
    key: queryKeys.platform.admins(),
    queryFn: () => platformService.listAdmins(),
  });
  const auditQuery = useQuery({
    key: queryKeys.platform.audit(),
    queryFn: () => platformService.listAudit(),
  });

  useEffect(() => {
    const intervalId = setInterval(() => {
      void businessesQuery.refetch();
    }, 10000);
    return () => clearInterval(intervalId);
  }, [businessesQuery.refetch]);

  const businesses = businessesQuery.data ?? [];
  const activeBusinesses = businesses.filter((item) => item.lifecycle_status === 'active').length;
  const restrictedBusinesses = businesses.filter((item) => item.write_blocked || item.lifecycle_status !== 'active').length;

  return (
    <PageShell>
      <ScrollView className="px-6 py-6">
        <PageHeader
          title="Platform Overview"
          subtitle="Cross-business SaaS controls for billing, access, quotas, and restrictions."
          actions={
            <Link href="/platform/businesses" asChild>
              <AppButton label="Open businesses" size="sm" />
            </Link>
          }
        />

        <View className="gap-4 pb-8">
          <View className="flex-row flex-wrap gap-4">
            <View className="min-w-[220px] flex-1">
              <AppCard title="Businesses">
                <Text className="text-[28px] font-semibold text-text">{businesses.length}</Text>
                <Text className="mt-1 text-small text-muted">{activeBusinesses} active, {restrictedBusinesses} restricted or non-active.</Text>
              </AppCard>
            </View>
            <View className="min-w-[220px] flex-1">
              <AppCard title="Platform Admins">
                <Text className="text-[28px] font-semibold text-text">{adminsQuery.data?.length ?? 0}</Text>
                <Text className="mt-1 text-small text-muted">Authenticated accounts with global SaaS control.</Text>
              </AppCard>
            </View>
            <View className="min-w-[220px] flex-1">
              <AppCard title="Recent Audit Events">
                <Text className="text-[28px] font-semibold text-text">{auditQuery.data?.length ?? 0}</Text>
                <Text className="mt-1 text-small text-muted">Latest platform-side lifecycle, entitlement, and billing changes.</Text>
              </AppCard>
            </View>
          </View>

          <AppCard title="Recently registered or updated businesses" subtitle="Latest tenants visible to platform admins.">
            <View className="gap-3">
              {businesses.slice(0, 6).map((business) => (
                <Link key={business.id} href={`/platform/businesses/${business.id}`} asChild>
                  <View className="rounded-md border border-border bg-surface-2 px-4 py-3">
                    <Text className="text-small font-semibold text-text">{business.name}</Text>
                    <Text className="mt-1 text-caption text-muted">
                      {business.slug} · {business.lifecycle_status} · {business.plan_code} · {business.user_count} users
                    </Text>
                  </View>
                </Link>
              ))}
              {businesses.length === 0 ? <Text className="text-small text-muted">No businesses found.</Text> : null}
            </View>
          </AppCard>
        </View>
      </ScrollView>
    </PageShell>
  );
}
