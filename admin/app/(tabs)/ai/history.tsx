import { Link } from 'expo-router';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { AppButton, AppCard, AppTable, AppTableCell, AppTableHeaderCell, AppTableRow, PageHeader } from '@admin/components/ui';
import { useAssistantHistoryQuery } from '@admin/features/assistant';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AiHistoryScreen() {
  const query = useAssistantHistoryQuery();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const rows = query.data ?? [];

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader title="AI History" subtitle="Approval requests, approval decisions, and executed AI actions." />

      <AppCard>
        {query.isLoading ? <Text className="text-small text-muted">Loading AI history...</Text> : null}
        {query.error ? (
          <View className="gap-3">
            <Text className="text-small text-error">{query.error.message}</Text>
            <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
          </View>
        ) : null}

        {!query.isLoading && !query.error ? (
          isMobile ? (
            <View className="gap-3">
              {rows.length === 0 ? (
                <Text className="text-small text-muted">No executed AI actions found.</Text>
              ) : null}
              {rows.map((row) => (
                <View key={row.id} className="gap-2 rounded-lg border border-border bg-surface p-4">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="text-caption font-semibold uppercase tracking-wide text-subtle">
                      {row.id.slice(0, 8).toUpperCase()}
                    </Text>
                    <Text className="text-caption text-subtle">{formatDate(row.createdAt)}</Text>
                  </View>

                  {row.requestText ? (
                    <View className="gap-0.5">
                      <Text className="text-caption uppercase tracking-wide text-subtle">Request</Text>
                      <Text className="text-small text-text">{row.requestText}</Text>
                      {row.why ? <Text className="text-caption text-muted">{row.why}</Text> : null}
                    </View>
                  ) : null}

                  <View className="gap-0.5">
                    <Text className="text-caption uppercase tracking-wide text-subtle">Type</Text>
                    <Text className="text-small text-text">{row.movementType || '-'}</Text>
                    <Text className="text-caption text-muted">
                      {row.source ?? 'ai'}{row.toolName ? ` via ${row.toolName}` : ''}
                    </Text>
                    {row.status ? <Text className="text-caption text-muted">Status: {row.status}</Text> : null}
                  </View>

                  <View className="gap-0.5">
                    <Text className="text-caption uppercase tracking-wide text-subtle">Audit Trail</Text>
                    <Text className="text-caption text-muted">Requested: {row.requestedBy || '-'}</Text>
                    <Text className="text-caption text-muted">Approved: {row.approvedBy || '-'}</Text>
                    <Text className="text-caption text-muted">Executed: {row.executedBy || '-'}</Text>
                    {row.quantity != null ? (
                      <Text className="text-caption tabular-nums text-muted">Qty: {row.quantity}</Text>
                    ) : null}
                  </View>

                  <View className="pt-1">
                    <Link href={`/audit/${row.id}`} asChild>
                      <AppButton label="View audit" size="sm" variant="tertiary" />
                    </Link>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <AppTable>
              <AppTableRow header>
                <AppTableHeaderCell>ID</AppTableHeaderCell>
                <AppTableHeaderCell>Request</AppTableHeaderCell>
                <AppTableHeaderCell>Type</AppTableHeaderCell>
                <AppTableHeaderCell>Audit Trail</AppTableHeaderCell>
                <AppTableHeaderCell>Timestamp</AppTableHeaderCell>
                <AppTableHeaderCell align="right">Links</AppTableHeaderCell>
              </AppTableRow>

              {rows.map((row) => (
                <AppTableRow key={row.id}>
                  <AppTableCell>{row.id.slice(0, 8).toUpperCase()}</AppTableCell>
                  <AppTableCell>
                    <View className="gap-1">
                      <Text className="text-small text-text">{row.requestText || '-'}</Text>
                      {row.why ? <Text className="text-caption text-muted">{row.why}</Text> : null}
                    </View>
                  </AppTableCell>
                  <AppTableCell>
                    <View className="gap-1">
                      <Text className="text-small text-text">{row.movementType || '-'}</Text>
                      <Text className="text-caption text-muted">
                        {row.source ?? 'ai'}{row.toolName ? ` via ${row.toolName}` : ''}
                      </Text>
                      {row.status ? <Text className="text-caption text-muted">Status: {row.status}</Text> : null}
                    </View>
                  </AppTableCell>
                  <AppTableCell>
                    <View className="gap-1">
                      <Text className="text-caption text-muted">Requested: {row.requestedBy || '-'}</Text>
                      <Text className="text-caption text-muted">Approved: {row.approvedBy || '-'}</Text>
                      <Text className="text-caption text-muted">Executed: {row.executedBy || '-'}</Text>
                      {row.quantity != null ? (
                        <Text className="text-caption tabular-nums text-muted">Qty: {row.quantity}</Text>
                      ) : null}
                    </View>
                  </AppTableCell>
                  <AppTableCell>{formatDate(row.createdAt)}</AppTableCell>
                  <AppTableCell align="right">
                    <Link href={`/audit/${row.id}`} asChild>
                      <AppButton label="Audit" size="sm" variant="tertiary" />
                    </Link>
                  </AppTableCell>
                </AppTableRow>
              ))}

              {rows.length === 0 ? (
                <AppTableRow>
                  <AppTableCell className="min-w-full">
                    <Text className="text-small text-muted">No executed AI actions found.</Text>
                  </AppTableCell>
                </AppTableRow>
              ) : null}
            </AppTable>
          )
        ) : null}
      </AppCard>
    </ScrollView>
  );
}
