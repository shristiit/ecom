import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { AppButton, AppCard, AppTable, AppTableCell, AppTableHeaderCell, AppTableRow, PageHeader } from '@/components/ui';
import { useAiHistoryQuery } from '@/features/ai';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AiHistoryScreen() {
  const query = useAiHistoryQuery();
  const rows = query.data ?? [];

  return (
    <ScrollView className="bg-bg px-6 py-6">
      <PageHeader title="AI History" subtitle="Executed AI commands and resulting transactions." />

      <AppCard>
        {query.isLoading ? <Text className="text-small text-muted">Loading AI history...</Text> : null}
        {query.error ? (
          <View className="gap-3">
            <Text className="text-small text-error">{query.error.message}</Text>
            <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
          </View>
        ) : null}

        {!query.isLoading && !query.error ? (
          <AppTable>
            <AppTableRow header>
              <AppTableHeaderCell>ID</AppTableHeaderCell>
              <AppTableHeaderCell>Request</AppTableHeaderCell>
              <AppTableHeaderCell>Type</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Qty</AppTableHeaderCell>
              <AppTableHeaderCell>Executed</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Links</AppTableHeaderCell>
            </AppTableRow>

            {rows.map((row) => (
              <AppTableRow key={row.id}>
                <AppTableCell>{row.id.slice(0, 8).toUpperCase()}</AppTableCell>
                <AppTableCell>{row.requestText || '-'}</AppTableCell>
                <AppTableCell>{row.movementType || '-'}</AppTableCell>
                <AppTableCell align="right" className="tabular-nums">
                  {row.quantity ?? '-'}
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
        ) : null}
      </AppCard>
    </ScrollView>
  );
}
