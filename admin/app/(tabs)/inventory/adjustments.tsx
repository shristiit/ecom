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
import { TransactionFormModal, useCreateAdjustmentMutation, useInventoryMovementsQuery } from '@/features/inventory';

export default function AdjustmentsScreen() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const query = useInventoryMovementsQuery();
  const createAdjustment = useCreateAdjustmentMutation();
  const rows = (query.data?.items ?? []).filter(
    (item) => item.movementType === 'adjust' || item.movementType === 'write_off' || item.movementType === 'cycle_count',
  );

  const handleCreateAdjustment = async (values: Record<string, string>) => {
    await createAdjustment.mutateAsync({
      skuId: values.sizeId.trim(),
      locationId: values.locationId.trim(),
      quantityDelta: Number(values.quantityDelta),
      reasonCode: values.reasonCode.trim() || 'manual_adjustment',
      note: values.note?.trim(),
    });
    await query.refetch();
    setIsModalOpen(false);
  };

  return (
    <ScrollView className="bg-bg px-6 py-6">
      <PageHeader
        title="Adjustments"
        subtitle="Manual stock changes with reason and approval status."
        actions={<AppButton label="New adjustment" size="sm" onPress={() => setIsModalOpen(true)} />}
      />

      <AppCard>
        {query.isLoading ? <Text className="text-small text-muted">Loading adjustments...</Text> : null}
        {query.error ? (
          <View className="gap-3">
            <Text className="text-small text-error">{query.error.message}</Text>
            <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
          </View>
        ) : null}

        {!query.isLoading && !query.error ? (
          <AppTable>
            <AppTableRow header>
              <AppTableHeaderCell>Adjustment</AppTableHeaderCell>
              <AppTableHeaderCell>SKU</AppTableHeaderCell>
              <AppTableHeaderCell>Reason</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Delta</AppTableHeaderCell>
              <AppTableHeaderCell>Requested by</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Status</AppTableHeaderCell>
            </AppTableRow>

            {rows.map((row) => {
              const isNegative = row.movementType === 'write_off';
              return (
                <AppTableRow key={row.id}>
                  <AppTableCell>{row.id.slice(0, 8).toUpperCase()}</AppTableCell>
                  <AppTableCell>{row.sku}</AppTableCell>
                  <AppTableCell>{row.reasonCode || row.movementType}</AppTableCell>
                  <AppTableCell align="right" className="tabular-nums">
                    {isNegative ? '-' : '+'}
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
              );
            })}

            {rows.length === 0 ? (
              <AppTableRow>
                <AppTableCell className="min-w-full">
                  <Text className="text-small text-muted">No adjustments found.</Text>
                </AppTableCell>
              </AppTableRow>
            ) : null}
          </AppTable>
        ) : null}
      </AppCard>

      <TransactionFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Adjust stock"
        description="Create an adjustment event for a SKU size and location."
        submitLabel="Create adjustment"
        loading={createAdjustment.isPending}
        error={createAdjustment.error?.message ?? null}
        onSubmit={handleCreateAdjustment}
        fields={[
          { key: 'sizeId', label: 'Size ID', placeholder: 'SKU size UUID', required: true },
          { key: 'locationId', label: 'Location ID', placeholder: 'Location UUID', required: true },
          { key: 'quantityDelta', label: 'Quantity delta', placeholder: '10', keyboardType: 'number-pad', required: true },
          { key: 'reasonCode', label: 'Reason code', placeholder: 'count_correction' },
          { key: 'note', label: 'Note', placeholder: 'Optional note' },
        ]}
      />
    </ScrollView>
  );
}
