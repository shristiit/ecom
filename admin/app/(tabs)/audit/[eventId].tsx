import { useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { AppBadge, AppButton, AppCard, PageHeader } from '@admin/components/ui';
import { useAuditDetailQuery } from '@admin/features/audit';

export default function AuditEventDetailScreen() {
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const rawId = params.eventId;
  const eventId = Array.isArray(rawId) ? rawId[0] : rawId;

  const query = useAuditDetailQuery(eventId, Boolean(eventId));
  const event = query.data;
  const metadata = (event?.metadata ?? {}) as Record<string, unknown>;

  const source = typeof metadata.source === 'string' ? metadata.source : event?.module ?? '-';
  const requestText = typeof metadata.requestText === 'string' ? metadata.requestText : '-';
  const requestedBy = typeof metadata.requestedByEmail === 'string' ? metadata.requestedByEmail : event?.actorEmail ?? event?.actorId ?? '-';
  const approvedBy = typeof metadata.approvedByEmail === 'string' ? metadata.approvedByEmail : '-';
  const executedBy = typeof metadata.executedByEmail === 'string' ? metadata.executedByEmail : '-';
  const toolName = typeof metadata.toolName === 'string' ? metadata.toolName : '-';
  const workflowId = typeof metadata.workflowId === 'string' ? metadata.workflowId : '-';
  const conversationId = typeof metadata.conversationId === 'string' ? metadata.conversationId : '-';
  const approvalRequestId = typeof metadata.approvalRequestId === 'string' ? metadata.approvalRequestId : '-';
  const decisionAt = typeof metadata.decisionAt === 'string' ? metadata.decisionAt : null;

  return (
    <ScrollView className="bg-bg px-4 py-4">
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
              <Text className="text-small text-text">Actor: {event.actorEmail ?? event.actorId ?? '-'}</Text>
              <Text className="text-small text-text">Action: {event.action}</Text>
              <Text className="text-small text-text">Source: {source}</Text>
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

          <AppCard title="Approval Trail">
            <View className="gap-2">
              <Text className="text-small text-text">Request: {requestText}</Text>
              <Text className="text-small text-text">Requested by: {requestedBy}</Text>
              <Text className="text-small text-text">Approved by: {approvedBy}</Text>
              <Text className="text-small text-text">Executed by: {executedBy}</Text>
              <Text className="text-small text-text">Tool: {toolName}</Text>
              <Text className="text-small text-text">Approval request: {approvalRequestId}</Text>
              <Text className="text-small text-text">Workflow: {workflowId}</Text>
              <Text className="text-small text-text">Conversation: {conversationId}</Text>
              {decisionAt ? <Text className="text-small text-muted">Decision time: {new Date(decisionAt).toLocaleString()}</Text> : null}
            </View>
          </AppCard>

          <AppCard title="Payload">
            <Text className="text-small text-muted">{JSON.stringify(metadata, null, 2)}</Text>
          </AppCard>
        </View>
      ) : null}
    </ScrollView>
  );
}
