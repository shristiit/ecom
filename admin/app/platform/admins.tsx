import { ScrollView, Text, View } from 'react-native';
import { AppCard, PageHeader, PageShell } from '@admin/components/ui';
import { queryKeys, useQuery } from '@admin/lib/query';
import { platformService } from '@admin/features/platform/services/platform.service';

export default function PlatformAdminsScreen() {
  const query = useQuery({
    key: queryKeys.platform.admins(),
    queryFn: () => platformService.listAdmins(),
  });

  return (
    <PageShell>
      <ScrollView className="px-6 py-6">
        <PageHeader title="Platform Admins" subtitle="Global operators with cross-tenant control over SaaS billing, limits, and restrictions." />
        <AppCard title="Admin accounts">
          <View className="gap-3">
            {(query.data ?? []).map((admin) => (
              <View key={admin.id} className="rounded-md border border-border bg-surface-2 px-4 py-3">
                <Text className="text-small font-semibold text-text">{admin.full_name || admin.email}</Text>
                <Text className="mt-1 text-caption text-muted">{admin.email} · {admin.status}</Text>
              </View>
            ))}
            {(query.data ?? []).length === 0 ? <Text className="text-small text-muted">No platform admins found.</Text> : null}
          </View>
        </AppCard>
      </ScrollView>
    </PageShell>
  );
}
