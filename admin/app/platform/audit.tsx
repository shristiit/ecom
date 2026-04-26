import { ScrollView, Text, View } from 'react-native';
import { AppCard, PageHeader, PageShell } from '@admin/components/ui';
import { queryKeys, useQuery } from '@admin/lib/query';
import { platformService } from '@admin/features/platform/services/platform.service';

export default function PlatformAuditScreen() {
  const query = useQuery({
    key: queryKeys.platform.audit(),
    queryFn: () => platformService.listAudit(),
  });

  return (
    <PageShell>
      <ScrollView className="px-6 py-6">
        <PageHeader title="Platform Audit" subtitle="Recent lifecycle, entitlement, quota, and billing actions performed at the SaaS platform level." />
        <AppCard title="Latest events">
          <View className="gap-3">
            {(query.data ?? []).map((event) => (
              <View key={event.id} className="rounded-md border border-border bg-surface-2 px-4 py-3">
                <Text className="text-small font-semibold text-text">{event.event_type}</Text>
                <Text className="mt-1 text-caption text-muted">
                  {event.tenant_name ?? 'Platform'} · {event.actor_email ?? event.actor_type} · {new Date(event.created_at).toLocaleString()}
                </Text>
              </View>
            ))}
            {(query.data ?? []).length === 0 ? <Text className="text-small text-muted">No audit events found.</Text> : null}
          </View>
        </AppCard>
      </ScrollView>
    </PageShell>
  );
}
