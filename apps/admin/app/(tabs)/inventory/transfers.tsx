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
} from '@/components/ui';
import { TransactionFormModal, useCreateTransferMutation, useInventoryMovementsQuery } from '@/features/inventory';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function TransfersScreen() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const query = useInventoryMovementsQuery({ movementType: 'transfer' });
  const createTransfer = useCreateTransferMutation();
  const rows = query.data?.items ?? [];

  const handleCreateTransfer = async (values: Record<string, string>) => {
    await createTransfer.mutateAsync({
      sizeId: values.sizeId.trim(),
      fromLocationId: values.fromLocationId.trim(),
      toLocationId: values.toLocationId.trim(),
      quantity: Number(values.quantity),
      reason: values.reason.trim() || 'transfer',
    });
    await query.refetch();
    setIsModalOpen(false);
  };

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title="Transfers"
        subtitle="Inter-location movement requests and delivery status."
        actions={<AppButton label="New transfer" size="sm" onPress={() => setIsModalOpen(true)} />}
      />

      <AppCard>
        {query.isLoading ? <Text className="text-small text-muted">Loading transfers...</Text> : null}
        {query.error ? (
          <View className="gap-3">
            <Text className="text-small text-error">{query.error.message}</Text>
            <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
          </View>
        ) : null}

        {!query.isLoading && !query.error ? (
          <AppTable>
            <AppTableRow header>
              <AppTableHeaderCell>Transfer</AppTableHeaderCell>
              <AppTableHeaderCell>From</AppTableHeaderCell>
              <AppTableHeaderCell>To</AppTableHeaderCell>
              <AppTableHeaderCell>Date</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Qty</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Status</AppTableHeaderCell>
            </AppTableRow>

            {rows.map((row) => (
              <AppTableRow key={row.id}>
                <AppTableCell>{row.id.slice(0, 8).toUpperCase()}</AppTableCell>
                <AppTableCell>{row.fromLocationId ?? '-'}</AppTableCell>
                <AppTableCell>{row.toLocationId ?? '-'}</AppTableCell>
                <AppTableCell>{formatDate(row.createdAt)}</AppTableCell>
                <AppTableCell align="right" className="tabular-nums">
                  {row.quantity}
                </AppTableCell>
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
                  <Text className="text-small text-muted">No transfers found.</Text>
                </AppTableCell>
              </AppTableRow>
            ) : null}
          </AppTable>
        ) : null}
      </AppCard>

      <TransactionFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Transfer stock"
        description="Move stock between two locations."
        submitLabel="Create transfer"
        loading={createTransfer.isPending}
        error={createTransfer.error?.message ?? null}
        onSubmit={handleCreateTransfer}
        fields={[
          { key: 'sizeId', label: 'Size ID', placeholder: 'SKU size UUID', required: true },
          { key: 'fromLocationId', label: 'From location', placeholder: 'Source location UUID', required: true },
          { key: 'toLocationId', label: 'To location', placeholder: 'Destination location UUID', required: true },
          { key: 'quantity', label: 'Quantity', placeholder: '5', keyboardType: 'number-pad', required: true },
          { key: 'reason', label: 'Reason', placeholder: 'rebalancing' },
        ]}
      />
    </ScrollView>
  );
}
