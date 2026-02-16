import { useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { AppBadge, AppButton, AppCard, PageHeader } from '@/components/ui';
import { useAuditDetailQuery } from '@/features/audit';

export default function AuditEventDetailScreen() {
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const rawId = params.eventId;
  const eventId = Array.isArray(rawId) ? rawId[0] : rawId;

  const query = useAuditDetailQuery(eventId, Boolean(eventId));
  const event = query.data;

  return (
    <ScrollView className="bg-bg px-6 py-6">
      <PageHeader
        title={event ? `Audit ${event.id.slice(0, 8).toUpperCase()}` : 'Audit detail'}
        subtitle="Payload, actor trail, and before/after context."
        actions={<AppButton label="Copy link" size="sm" variant="secondary" />}
      />

      {query.isLoading ? <Text className="text-small text-muted">Loading event...</Text> : null}
      {query.error ? (
        <View className="gap-3">
          <Text className="text-small text-error">{query.error.message}</Text>
          <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
        </View>
      ) : null}

      {event ? (
        <View className="gap-4">
          <AppCard title="Overview">
            <View className="gap-2">
              <Text className="text-small text-text">Actor: {event.actorId ?? '-'}</Text>
              <Text className="text-small text-text">Action: {event.action}</Text>
              <Text className="text-small text-text">Entity: {event.entityId ?? '-'}</Text>
              <Text className="text-small text-muted">Timestamp: {new Date(event.createdAt).toLocaleString()}</Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-small text-text">Result:</Text>
                <AppBadge
                  label={event.result}
                  tone={event.result === 'success' ? 'success' : event.result === 'warning' ? 'warning' : 'error'}
                />
              </View>
            </View>
          </AppCard>

          <AppCard title="Before / After payload">
            <Text className="text-small text-muted">{JSON.stringify(event.metadata ?? {}, null, 2)}</Text>
          </AppCard>
        </View>
      ) : null}
    </ScrollView>
  );
}
