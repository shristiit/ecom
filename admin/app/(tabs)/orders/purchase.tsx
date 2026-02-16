import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppInput,
  AppModal,
  AppTable,
  AppTableCell,
  AppTableHeaderCell,
  AppTableRow,
  PageHeader,
} from '@/components/ui';
import { useCreatePurchaseOrderMutation, usePurchaseOrdersQuery } from '@/features/orders';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export default function PurchaseOrdersScreen() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [sizeId, setSizeId] = useState('');
  const [qty, setQty] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const query = usePurchaseOrdersQuery({ page: 1, pageSize: 100 });
  const createPurchaseOrder = useCreatePurchaseOrderMutation();
  const rows = query.data?.items ?? [];

  const resetForm = () => {
    setSupplierId('');
    setSizeId('');
    setQty('');
    setUnitCost('');
    setExpectedDate('');
    setFormError(null);
  };

  const handleCreate = async () => {
    setFormError(null);
    if (!supplierId.trim() || !sizeId.trim()) {
      setFormError('Supplier ID and Size ID are required.');
      return;
    }

    const parsedQty = Number(qty);
    const parsedUnitCost = Number(unitCost);
    if (!Number.isFinite(parsedQty) || parsedQty <= 0 || !Number.isFinite(parsedUnitCost) || parsedUnitCost < 0) {
      setFormError('Quantity and unit cost must be valid numbers.');
      return;
    }

    let expectedDateIso: string | undefined;
    if (expectedDate.trim()) {
      const parsedDate = new Date(`${expectedDate.trim()}T00:00:00.000Z`);
      if (Number.isNaN(parsedDate.getTime())) {
        setFormError('Expected date must be YYYY-MM-DD.');
        return;
      }
      expectedDateIso = parsedDate.toISOString();
    }

    await createPurchaseOrder.mutateAsync({
      supplierId: supplierId.trim(),
      expectedDate: expectedDateIso,
      lines: [{ sizeId: sizeId.trim(), qty: parsedQty, unitCost: parsedUnitCost }],
    });
    await query.refetch();
    setIsModalOpen(false);
    resetForm();
  };

  return (
    <ScrollView className="bg-bg px-6 py-6">
      <PageHeader
        title="Purchase orders"
        subtitle="Supplier-facing order workflow with receiving controls."
        actions={<AppButton label="Create PO" size="sm" onPress={() => setIsModalOpen(true)} />}
      />

      <AppCard>
        {query.isLoading ? <Text className="text-small text-muted">Loading purchase orders...</Text> : null}
        {query.error ? (
          <View className="gap-3">
            <Text className="text-small text-error">{query.error.message}</Text>
            <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
          </View>
        ) : null}

        {!query.isLoading && !query.error ? (
          <AppTable>
            <AppTableRow header>
              <AppTableHeaderCell>PO</AppTableHeaderCell>
              <AppTableHeaderCell>Supplier</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Total</AppTableHeaderCell>
              <AppTableHeaderCell>Expected</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Status</AppTableHeaderCell>
            </AppTableRow>

            {rows.map((row) => {
              const total = row.totalCost ?? row.lines.reduce((sum, line) => sum + line.qtyOrdered * line.unitCost, 0);
              return (
                <AppTableRow key={row.id}>
                  <AppTableCell>
                    <Link href={`/orders/purchase/${row.id}`} asChild>
                      <Text className="text-small font-medium text-primary">{row.number}</Text>
                    </Link>
                  </AppTableCell>
                  <AppTableCell>{row.supplierName}</AppTableCell>
                  <AppTableCell align="right" className="tabular-nums">
                    {currency.format(Number(total))}
                  </AppTableCell>
                  <AppTableCell>{formatDate(row.expectedAt)}</AppTableCell>
                  <AppTableCell align="right">
                    <AppBadge
                      label={row.status}
                      tone={row.status === 'closed' ? 'success' : row.status === 'draft' ? 'warning' : 'info'}
                    />
                  </AppTableCell>
                </AppTableRow>
              );
            })}

            {rows.length === 0 ? (
              <AppTableRow>
                <AppTableCell className="min-w-full">
                  <Text className="text-small text-muted">No purchase orders found.</Text>
                </AppTableCell>
              </AppTableRow>
            ) : null}
          </AppTable>
        ) : null}
      </AppCard>

      <AppModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create purchase order"
        description="Create a PO with a starter line item."
        footer={
          <View className="flex-row justify-end gap-2">
            <AppButton label="Cancel" size="sm" variant="secondary" onPress={() => setIsModalOpen(false)} />
            <AppButton label="Create" size="sm" loading={createPurchaseOrder.isPending} onPress={() => void handleCreate()} />
          </View>
        }
      >
        <View className="gap-3">
          <AppInput label="Supplier ID" placeholder="Supplier UUID" value={supplierId} onChangeText={setSupplierId} />
          <AppInput label="Size ID" placeholder="SKU size UUID" value={sizeId} onChangeText={setSizeId} />
          <AppInput label="Quantity" placeholder="10" keyboardType="number-pad" value={qty} onChangeText={setQty} />
          <AppInput label="Unit cost" placeholder="20" keyboardType="number-pad" value={unitCost} onChangeText={setUnitCost} />
          <AppInput
            label="Expected date (YYYY-MM-DD)"
            placeholder="2026-03-01"
            value={expectedDate}
            onChangeText={setExpectedDate}
          />
          {formError ? <Text className="text-small text-error">{formError}</Text> : null}
          {createPurchaseOrder.error ? <Text className="text-small text-error">{createPurchaseOrder.error.message}</Text> : null}
        </View>
      </AppModal>
    </ScrollView>
  );
}
