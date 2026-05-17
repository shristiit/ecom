import { Link } from 'expo-router';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { AppButton, AppCard, AppTable, AppTableCell, AppTableHeaderCell, AppTableRow } from '@admin/components/ui';
import { AssistantPanelShell, useAssistantConversationsQuery } from '@admin/features/assistant';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatRole(value?: string | null) {
  if (!value) return '-';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function AiHistoryScreen() {
  const query = useAssistantConversationsQuery();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const rows = query.data ?? [];

  return (
    <View style={{ flex: 1 }}>
      <AssistantPanelShell activeTab="history">
        <ScrollView style={{ flex: 1, backgroundColor: '#FDF4F0' }} contentContainerStyle={{ padding: 22 }}>
          <AppCard>
            {query.isLoading ? <Text className="text-small text-muted">Loading chat history...</Text> : null}
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
                    <Text className="text-small text-muted">No chat history found.</Text>
                  ) : null}

                  {rows.map((row) => (
                    <View key={row.id} className="gap-2 rounded-lg border border-border bg-surface p-4">
                      <View className="flex-row items-center justify-between gap-2">
                        <Text className="text-caption font-semibold uppercase tracking-wide text-subtle">
                          {row.id.slice(0, 8).toUpperCase()}
                        </Text>
                        <Text className="text-caption text-subtle">{formatDate(row.updatedAt)}</Text>
                      </View>

                      <View className="gap-0.5">
                        <Text className="text-caption uppercase tracking-wide text-subtle">Conversation</Text>
                        <Text className="text-small text-text">{row.title}</Text>
                      </View>

                      <View className="gap-0.5">
                        <Text className="text-caption uppercase tracking-wide text-subtle">Last Message</Text>
                        <Text className="text-small text-text">{row.lastMessagePreview || 'No assistant response yet.'}</Text>
                        <Text className="text-caption text-muted">Last role: {formatRole(row.lastRole)}</Text>
                      </View>

                      <View className="pt-1">
                        <Link href={`/ai/thread/${row.id}`} asChild>
                          <AppButton label="Open chat" size="sm" variant="tertiary" />
                        </Link>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <AppTable>
                  <AppTableRow header>
                    <AppTableHeaderCell>ID</AppTableHeaderCell>
                    <AppTableHeaderCell>Conversation</AppTableHeaderCell>
                    <AppTableHeaderCell>Last Message</AppTableHeaderCell>
                    <AppTableHeaderCell>Last Role</AppTableHeaderCell>
                    <AppTableHeaderCell>Updated</AppTableHeaderCell>
                    <AppTableHeaderCell align="right">Links</AppTableHeaderCell>
                  </AppTableRow>

                  {rows.map((row) => (
                    <AppTableRow key={row.id}>
                      <AppTableCell>{row.id.slice(0, 8).toUpperCase()}</AppTableCell>
                      <AppTableCell>
                        <View className="gap-1">
                          <Text className="text-small text-text">{row.title}</Text>
                          <Text className="text-caption text-muted">Created: {formatDate(row.createdAt)}</Text>
                        </View>
                      </AppTableCell>
                      <AppTableCell>
                        <Text className="text-small text-text">{row.lastMessagePreview || 'No assistant response yet.'}</Text>
                      </AppTableCell>
                      <AppTableCell>{formatRole(row.lastRole)}</AppTableCell>
                      <AppTableCell>{formatDate(row.updatedAt)}</AppTableCell>
                      <AppTableCell align="right">
                        <Link href={`/ai/thread/${row.id}`} asChild>
                          <AppButton label="Open chat" size="sm" variant="tertiary" />
                        </Link>
                      </AppTableCell>
                    </AppTableRow>
                  ))}

                  {rows.length === 0 ? (
                    <AppTableRow>
                      <AppTableCell className="min-w-full">
                        <Text className="text-small text-muted">No chat history found.</Text>
                      </AppTableCell>
                    </AppTableRow>
                  ) : null}
                </AppTable>
              )
            ) : null}
          </AppCard>
        </ScrollView>
      </AssistantPanelShell>
    </View>
  );
}
