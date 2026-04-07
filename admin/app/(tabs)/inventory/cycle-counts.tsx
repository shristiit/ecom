import { useState } from 'react';
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
import { TransactionFormModal, useCreateCycleCountMutation, useInventoryMovementsQuery } from '@admin/features/inventory';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function CycleCountsScreen() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const query = useInventoryMovementsQuery({ movementType: 'cycle_count' });
  const createCycleCount = useCreateCycleCountMutation();
  const rows = query.data?.items ?? [];

  const handleCreateCycleCount = async (values: Record<string, string>) => {
    await createCycleCount.mutateAsync({
      sizeId: values.sizeId.trim(),
      locationId: values.locationId.trim(),
      quantity: Number(values.quantity),
      reason: values.reason.trim() || 'cycle_count',
    });
    await query.refetch();
    setIsModalOpen(false);
  };

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title="Cycle counts"
        subtitle="Count sessions and variance reconciliation."
        actions={<AppButton label="Start count" size="sm" onPress={() => setIsModalOpen(true)} />}
      />

      <AppCard>
        {query.isLoading ? <Text className="text-small text-muted">Loading cycle counts...</Text> : null}
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
              <AppTableHeaderCell>SKU</AppTableHeaderCell>
              <AppTableHeaderCell>Date</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Variance</AppTableHeaderCell>
              <AppTableHeaderCell>Counter</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Status</AppTableHeaderCell>
            </AppTableRow>

            {rows.map((row) => (
              <AppTableRow key={row.id}>
                <AppTableCell>{row.id.slice(0, 8).toUpperCase()}</AppTableCell>
                <AppTableCell>{row.sku}</AppTableCell>
                <AppTableCell>{formatDate(row.createdAt)}</AppTableCell>
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
                  <Text className="text-small text-muted">No cycle count events found.</Text>
                </AppTableCell>
              </AppTableRow>
            ) : null}
          </AppTable>
        ) : null}
      </AppCard>

      <TransactionFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Start cycle count"
        description="Create a cycle-count reconciliation entry."
        submitLabel="Create count"
        loading={createCycleCount.isPending}
        error={createCycleCount.error?.message ?? null}
        onSubmit={handleCreateCycleCount}
        fields={[
          { key: 'sizeId', label: 'Size ID', placeholder: 'SKU size UUID', required: true },
          { key: 'locationId', label: 'Location ID', placeholder: 'Location UUID', required: true },
          { key: 'quantity', label: 'Variance quantity', placeholder: '2', keyboardType: 'number-pad', required: true },
          { key: 'reason', label: 'Reason', placeholder: 'count_reconciliation' },
        ]}
      />
    </ScrollView>
  );
}
