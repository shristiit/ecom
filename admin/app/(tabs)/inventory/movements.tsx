import { ScrollView, Text, View } from 'react-native';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppTable,
  AppTableCell,
  AppTableHeaderCell,
  AppTableRow,
  PageHeader,
} from '@admin/components/ui';
import { useInventoryMovementsQuery } from '@admin/features/inventory';

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function MovementsScreen() {
  const query = useInventoryMovementsQuery();
  const rows = query.data?.items ?? [];

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title="Inventory movements"
        subtitle="Chronological ledger of stock-affecting events."
        actions={<AppButton label="Export" size="sm" variant="secondary" />}
      />

      <AppCard>
        {query.isLoading ? <Text className="text-small text-muted">Loading movement log...</Text> : null}
        {query.error ? (
          <View className="gap-3">
            <Text className="text-small text-error">{query.error.message}</Text>
            <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
          </View>
        ) : null}

        {!query.isLoading && !query.error ? (
          <AppTable>
            <AppTableRow header>
              <AppTableHeaderCell>Event</AppTableHeaderCell>
              <AppTableHeaderCell>Date</AppTableHeaderCell>
              <AppTableHeaderCell>SKU</AppTableHeaderCell>
              <AppTableHeaderCell>Type</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Qty</AppTableHeaderCell>
              <AppTableHeaderCell>Actor</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Status</AppTableHeaderCell>
            </AppTableRow>

            {rows.map((row) => (
              <AppTableRow key={row.id}>
                <AppTableCell>{row.id.slice(0, 8).toUpperCase()}</AppTableCell>
                <AppTableCell>{formatDateTime(row.createdAt)}</AppTableCell>
                <AppTableCell>{row.sku}</AppTableCell>
                <AppTableCell>{row.movementType}</AppTableCell>
                <AppTableCell align="right" className="tabular-nums">
                  {row.quantity}
                </AppTableCell>
                <AppTableCell>{row.createdBy}</AppTableCell>
                <AppTableCell align="right">
                  <AppBadge
                    label={row.approvalStatus ?? 'pending'}
                    tone={row.approvalStatus === 'approved' ? 'success' : 'warning'}
                  />
                </AppTableCell>
              </AppTableRow>
            ))}

            {rows.length === 0 ? (
              <AppTableRow>
                <AppTableCell className="min-w-full">
                  <Text className="text-small text-muted">No movements found.</Text>
                </AppTableCell>
              </AppTableRow>
            ) : null}
          </AppTable>
        ) : null}
      </AppCard>
    </ScrollView>
  );
}
