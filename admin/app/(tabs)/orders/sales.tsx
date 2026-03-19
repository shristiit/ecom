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
import { useCreateSalesOrderMutation, useSalesOrdersQuery } from '@/features/orders';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export default function SalesOrdersScreen() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [sizeId, setSizeId] = useState('');
  const [qty, setQty] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const query = useSalesOrdersQuery({ page: 1, pageSize: 100 });
  const createSalesOrder = useCreateSalesOrderMutation();
  const rows = query.data?.items ?? [];

  const resetForm = () => {
    setCustomerId('');
    setSizeId('');
    setQty('');
    setUnitPrice('');
    setFormError(null);
  };

  const handleCreate = async () => {
    setFormError(null);
    if (!customerId.trim() || !sizeId.trim()) {
      setFormError('Customer ID and Size ID are required.');
      return;
    }

    const parsedQty = Number(qty);
    const parsedUnitPrice = Number(unitPrice);
    if (!Number.isFinite(parsedQty) || parsedQty <= 0 || !Number.isFinite(parsedUnitPrice) || parsedUnitPrice < 0) {
      setFormError('Quantity and unit price must be valid numbers.');
      return;
    }

    await createSalesOrder.mutateAsync({
      customerId: customerId.trim(),
      lines: [{ sizeId: sizeId.trim(), qty: parsedQty, unitPrice: parsedUnitPrice }],
    });
    await query.refetch();
    setIsModalOpen(false);
    resetForm();
  };

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title="Sales orders"
        subtitle="Track customer invoices, payment, and dispatch readiness."
        actions={<AppButton label="Create invoice" size="sm" onPress={() => setIsModalOpen(true)} />}
      />

      <AppCard>
        {query.isLoading ? <Text className="text-small text-muted">Loading sales orders...</Text> : null}
        {query.error ? (
          <View className="gap-3">
            <Text className="text-small text-error">{query.error.message}</Text>
            <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
          </View>
        ) : null}

        {!query.isLoading && !query.error ? (
          <AppTable>
            <AppTableRow header>
              <AppTableHeaderCell>Order</AppTableHeaderCell>
              <AppTableHeaderCell>Customer</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Total</AppTableHeaderCell>
              <AppTableHeaderCell>Created</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Status</AppTableHeaderCell>
            </AppTableRow>

            {rows.map((row) => (
              <AppTableRow key={row.id}>
                <AppTableCell>
                  <Link href={`/orders/sales/${row.id}`} asChild>
                    <Text className="text-small font-medium text-primary">{row.number}</Text>
                  </Link>
                </AppTableCell>
                <AppTableCell>{row.customerName}</AppTableCell>
                <AppTableCell align="right" className="tabular-nums">
                  {currency.format(Number(row.total ?? 0))}
                </AppTableCell>
                <AppTableCell>{formatDate(row.createdAt)}</AppTableCell>
                <AppTableCell align="right">
                  <AppBadge
                    label={row.status}
                    tone={row.status === 'paid' ? 'success' : row.status === 'draft' ? 'warning' : 'info'}
                  />
                </AppTableCell>
              </AppTableRow>
            ))}

            {rows.length === 0 ? (
              <AppTableRow>
                <AppTableCell className="min-w-full">
                  <Text className="text-small text-muted">No sales orders found.</Text>
                </AppTableCell>
              </AppTableRow>
            ) : null}
          </AppTable>
        ) : null}
      </AppCard>

      <AppModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create sales invoice"
        description="Create an invoice with a starter line item."
        footer={
          <View className="flex-row justify-end gap-2">
            <AppButton label="Cancel" size="sm" variant="secondary" onPress={() => setIsModalOpen(false)} />
            <AppButton label="Create" size="sm" loading={createSalesOrder.isPending} onPress={() => void handleCreate()} />
          </View>
        }
      >
        <View className="gap-3">
          <AppInput label="Customer ID" placeholder="Customer UUID" value={customerId} onChangeText={setCustomerId} />
          <AppInput label="Size ID" placeholder="SKU size UUID" value={sizeId} onChangeText={setSizeId} />
          <AppInput label="Quantity" placeholder="1" keyboardType="number-pad" value={qty} onChangeText={setQty} />
          <AppInput label="Unit price" placeholder="49" keyboardType="number-pad" value={unitPrice} onChangeText={setUnitPrice} />
          {formError ? <Text className="text-small text-error">{formError}</Text> : null}
          {createSalesOrder.error ? <Text className="text-small text-error">{createSalesOrder.error.message}</Text> : null}
        </View>
      </AppModal>
    </ScrollView>
  );
}
