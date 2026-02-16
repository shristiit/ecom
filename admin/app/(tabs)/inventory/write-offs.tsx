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
import { TransactionFormModal, useCreateWriteOffMutation, useInventoryMovementsQuery } from '@/features/inventory';

export default function WriteOffsScreen() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const query = useInventoryMovementsQuery({ movementType: 'write_off' });
  const createWriteOff = useCreateWriteOffMutation();
  const rows = query.data?.items ?? [];

  const handleCreateWriteOff = async (values: Record<string, string>) => {
    await createWriteOff.mutateAsync({
      sizeId: values.sizeId.trim(),
      locationId: values.locationId.trim(),
      quantity: Number(values.quantity),
      reason: values.reason.trim() || 'write_off',
    });
    await query.refetch();
    setIsModalOpen(false);
  };

  return (
    <ScrollView className="bg-bg px-6 py-6">
      <PageHeader
        title="Write-offs"
        subtitle="Damage, expiry, and shrinkage transactions."
        actions={<AppButton label="New write-off" size="sm" onPress={() => setIsModalOpen(true)} />}
      />

      <AppCard>
        {query.isLoading ? <Text className="text-small text-muted">Loading write-offs...</Text> : null}
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
              <AppTableHeaderCell>Reason</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Qty</AppTableHeaderCell>
              <AppTableHeaderCell>Requested by</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Status</AppTableHeaderCell>
            </AppTableRow>

            {rows.map((row) => (
              <AppTableRow key={row.id}>
                <AppTableCell>{row.id.slice(0, 8).toUpperCase()}</AppTableCell>
                <AppTableCell>{row.sku}</AppTableCell>
                <AppTableCell>{row.reasonCode || 'write_off'}</AppTableCell>
                <AppTableCell align="right" className="tabular-nums">
                  -{row.quantity}
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
                  <Text className="text-small text-muted">No write-offs found.</Text>
                </AppTableCell>
              </AppTableRow>
            ) : null}
          </AppTable>
        ) : null}
      </AppCard>

      <TransactionFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Write-off stock"
        description="Post a write-off movement with reason."
        submitLabel="Create write-off"
        loading={createWriteOff.isPending}
        error={createWriteOff.error?.message ?? null}
        onSubmit={handleCreateWriteOff}
        fields={[
          { key: 'sizeId', label: 'Size ID', placeholder: 'SKU size UUID', required: true },
          { key: 'locationId', label: 'Location ID', placeholder: 'Location UUID', required: true },
          { key: 'quantity', label: 'Quantity', placeholder: '3', keyboardType: 'number-pad', required: true },
          { key: 'reason', label: 'Reason', placeholder: 'damage' },
        ]}
      />
    </ScrollView>
  );
}
