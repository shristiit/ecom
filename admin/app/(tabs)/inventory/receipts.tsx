import { Link } from 'expo-router';
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
import { TransactionFormModal, useCreateReceiveMutation, useInventoryReceiptsQuery } from '@admin/features/inventory';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export default function ReceiptsScreen() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const query = useInventoryReceiptsQuery();
  const createReceive = useCreateReceiveMutation();
  const rows = query.data ?? [];

  const handleCreateReceipt = async (values: Record<string, string>) => {
    await createReceive.mutateAsync({
      sizeId: values.sizeId.trim(),
      locationId: values.locationId.trim(),
      quantity: Number(values.quantity),
      reason: values.reason.trim() || 'receive',
    });
    await query.refetch();
    setIsModalOpen(false);
  };

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title="Receipts"
        subtitle="Inbound goods receipts linked to purchase orders."
        actions={<AppButton label="New receipt" size="sm" onPress={() => setIsModalOpen(true)} />}
      />

      <AppCard>
        {query.isLoading ? <Text className="text-small text-muted">Loading receipts...</Text> : null}
        {query.error ? (
          <View className="gap-3">
            <Text className="text-small text-error">{query.error.message}</Text>
            <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
          </View>
        ) : null}

        {!query.isLoading && !query.error ? (
          <AppTable>
            <AppTableRow header>
              <AppTableHeaderCell>Receipt</AppTableHeaderCell>
              <AppTableHeaderCell>PO</AppTableHeaderCell>
              <AppTableHeaderCell>Supplier</AppTableHeaderCell>
              <AppTableHeaderCell>Received date</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Lines</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Status</AppTableHeaderCell>
            </AppTableRow>

            {rows.map((row) => (
              <AppTableRow key={row.id}>
                <AppTableCell>{row.id.slice(0, 8).toUpperCase()}</AppTableCell>
                <AppTableCell>
                  {row.poId ? (
                    <Link href={`/orders/purchase/${row.poId}`} asChild>
                      <Text className="text-small font-medium text-primary">{row.poId.slice(0, 8).toUpperCase()}</Text>
                    </Link>
                  ) : (
                    '-'
                  )}
                </AppTableCell>
                <AppTableCell>{row.supplierName ?? '-'}</AppTableCell>
                <AppTableCell>{formatDate(row.createdAt)}</AppTableCell>
                <AppTableCell align="right" className="tabular-nums">
                  {row.lineCount}
                </AppTableCell>
                <AppTableCell align="right">
                  <AppBadge label={row.status} tone={row.status === 'complete' ? 'success' : 'warning'} />
                </AppTableCell>
              </AppTableRow>
            ))}

            {rows.length === 0 ? (
              <AppTableRow>
                <AppTableCell className="min-w-full">
                  <Text className="text-small text-muted">No receipts found.</Text>
                </AppTableCell>
              </AppTableRow>
            ) : null}
          </AppTable>
        ) : null}
      </AppCard>

      <TransactionFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Receive stock"
        description="Post a manual receipt transaction into inventory."
        submitLabel="Create receipt"
        loading={createReceive.isPending}
        error={createReceive.error?.message ?? null}
        onSubmit={handleCreateReceipt}
        fields={[
          { key: 'sizeId', label: 'Size ID', placeholder: 'SKU size UUID', required: true },
          { key: 'locationId', label: 'Location ID', placeholder: 'Receiving location UUID', required: true },
          { key: 'quantity', label: 'Quantity', placeholder: '10', required: true, keyboardType: 'number-pad' },
          { key: 'reason', label: 'Reason', placeholder: 'supplier_receipt' },
        ]}
      />
    </ScrollView>
  );
}
