import { Link } from 'expo-router';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { AppBadge, AppButton, AppCard, AppTable, AppTableCell, AppTableHeaderCell, AppTableRow, PageHeader } from '@admin/components/ui';
import { useAssistantApproveMutation, useAssistantApprovalsQuery } from '@admin/features/assistant';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AiApprovalsScreen() {
  const query = useAssistantApprovalsQuery();
  const approveMutation = useAssistantApproveMutation();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const rows = query.data ?? [];

  const handleDecision = async (approvalId: string, approve: boolean) => {
    await approveMutation.mutateAsync({ approvalId, approve });
    await query.refetch();
  };

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader title="AI Approvals" subtitle="Pending high-risk actions requiring approval." />

      <AppCard>
        {query.isLoading ? <Text className="text-small text-muted">Loading approvals...</Text> : null}
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
                <Text className="text-small text-muted">No approvals found.</Text>
              ) : null}
              {rows.map((row) => (
                <View key={row.id} className="gap-2 rounded-lg border border-border bg-surface p-4">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="text-caption font-semibold uppercase tracking-wide text-subtle">
                      {row.id.slice(0, 8).toUpperCase()}
                    </Text>
                    <AppBadge
                      label={row.status}
                      tone={row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'error' : 'warning'}
                    />
                  </View>

                  {row.intent ? (
                    <View className="gap-0.5">
                      <Text className="text-caption uppercase tracking-wide text-subtle">Intent</Text>
                      <Text className="text-small text-text">{row.intent}</Text>
                    </View>
                  ) : null}

                  <View className="gap-0.5">
                    <Text className="text-caption uppercase tracking-wide text-subtle">Created</Text>
                    <Text className="text-small text-text">{formatDate(row.createdAt)}</Text>
                  </View>

                  <View className="flex-row flex-wrap items-center gap-2 pt-1">
                    {row.conversationId ? (
                      <Link href={`/ai/thread/${row.conversationId}`} asChild>
                        <AppButton label="Open thread" size="sm" variant="tertiary" />
                      </Link>
                    ) : null}
                    {row.status === 'pending' ? (
                      <>
                        <AppButton
                          label="Approve"
                          size="sm"
                          onPress={() => void handleDecision(row.id, true)}
                          loading={approveMutation.isPending}
                        />
                        <AppButton
                          label="Reject"
                          size="sm"
                          variant="secondary"
                          onPress={() => void handleDecision(row.id, false)}
                          loading={approveMutation.isPending}
                        />
                      </>
                    ) : (
                      <Text className="text-caption text-muted">Finalized</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <AppTable>
              <AppTableRow header>
                <AppTableHeaderCell>ID</AppTableHeaderCell>
                <AppTableHeaderCell>Intent</AppTableHeaderCell>
                <AppTableHeaderCell>Status</AppTableHeaderCell>
                <AppTableHeaderCell>Created</AppTableHeaderCell>
                <AppTableHeaderCell align="right">Thread</AppTableHeaderCell>
                <AppTableHeaderCell align="right">Actions</AppTableHeaderCell>
              </AppTableRow>

              {rows.map((row) => (
                <AppTableRow key={row.id}>
                  <AppTableCell>{row.id.slice(0, 8).toUpperCase()}</AppTableCell>
                  <AppTableCell>{row.intent || '-'}</AppTableCell>
                  <AppTableCell>
                    <AppBadge label={row.status} tone={row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'error' : 'warning'} />
                  </AppTableCell>
                  <AppTableCell>{formatDate(row.createdAt)}</AppTableCell>
                  <AppTableCell align="right">
                    {row.conversationId ? (
                      <Link href={`/ai/thread/${row.conversationId}`} asChild>
                        <AppButton label="Open" size="sm" variant="tertiary" />
                      </Link>
                    ) : (
                      <Text className="text-caption text-muted">-</Text>
                    )}
                  </AppTableCell>
                  <AppTableCell align="right">
                    {row.status === 'pending' ? (
                      <View className="flex-row gap-2">
                        <AppButton
                          label="Approve"
                          size="sm"
                          onPress={() => void handleDecision(row.id, true)}
                          loading={approveMutation.isPending}
                        />
                        <AppButton
                          label="Reject"
                          size="sm"
                          variant="secondary"
                          onPress={() => void handleDecision(row.id, false)}
                          loading={approveMutation.isPending}
                        />
                      </View>
                    ) : (
                      <Text className="text-caption text-muted">Finalized</Text>
                    )}
                  </AppTableCell>
                </AppTableRow>
              ))}

              {rows.length === 0 ? (
                <AppTableRow>
                  <AppTableCell className="min-w-full">
                    <Text className="text-small text-muted">No approvals found.</Text>
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
