import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppBadge, AppButton, AppCard, AppInput, AppTable, AppTableCell, AppTableHeaderCell, AppTableRow, PageHeader } from '@/components/ui';
import { useCancelSalesOrderMutation, useDispatchSalesOrderMutation, useSalesOrderQuery } from '@/features/orders';
import { downloadSalesOrderPdf } from '@/features/orders/utils/order-pdf';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function SalesOrderDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = params.id;
  const orderId = Array.isArray(rawId) ? rawId[0] : rawId;

  const query = useSalesOrderQuery(orderId, Boolean(orderId));
  const dispatchOrder = useDispatchSalesOrderMutation();
  const cancelOrder = useCancelSalesOrderMutation();

  const [locationId, setLocationId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const order = query.data;

  const handleDispatch = async () => {
    if (!orderId) return;
    if (!locationId.trim()) {
      setActionError('Location ID is required for dispatch.');
      return;
    }

    setActionError(null);
    setActionMessage(null);
    try {
      await dispatchOrder.mutateAsync({ id: orderId, locationId: locationId.trim() });
      setActionMessage('Dispatch submitted successfully.');
      await query.refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to dispatch order.');
    }
  };

  const handleCancel = async () => {
    if (!orderId) return;

    setActionError(null);
    setActionMessage(null);
    try {
      await cancelOrder.mutateAsync(orderId);
      setActionMessage('Order cancelled successfully.');
      await query.refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to cancel order.');
    }
  };

  const handleDownloadPdf = async () => {
    if (!order) return;

    setActionError(null);
    setActionMessage(null);
    try {
      setDownloadingPdf(true);
      await downloadSalesOrderPdf(order);
      setActionMessage('PDF export started.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to export PDF.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title={order ? `Sales order ${order.number}` : `Sales order ${orderId ?? ''}`}
        subtitle="Order lines, payment status, and dispatch controls."
        actions={
          <View className="flex-row gap-2">
            <AppButton label="Download PDF" size="sm" variant="secondary" loading={downloadingPdf} onPress={() => void handleDownloadPdf()} />
            <AppButton label="Dispatch" size="sm" loading={dispatchOrder.isPending} onPress={() => void handleDispatch()} />
            <AppButton
              label="Cancel"
              size="sm"
              variant="secondary"
              loading={cancelOrder.isPending}
              onPress={() => void handleCancel()}
            />
          </View>
        }
      />

      <View className="gap-4">
        {query.isLoading ? <Text className="text-small text-muted">Loading sales order...</Text> : null}
        {query.error ? (
          <View className="gap-3">
            <Text className="text-small text-error">{query.error.message}</Text>
            <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
          </View>
        ) : null}

        {order ? (
          <>
            <AppCard title="Status">
              <View className="flex-row flex-wrap items-center gap-2">
                <AppBadge label={order.status} tone={order.status === 'paid' ? 'success' : 'info'} />
                <Text className="text-small text-muted">Customer: {order.customerName}</Text>
                <Text className="text-small text-muted">Total: {currency.format(Number(order.total ?? 0))}</Text>
              </View>
            </AppCard>

            <AppCard title="Dispatch">
              <View className="gap-3">
                <AppInput
                  label="Location ID"
                  placeholder="Warehouse location UUID"
                  value={locationId}
                  onChangeText={setLocationId}
                />
                {actionError ? <Text className="text-small text-error">{actionError}</Text> : null}
                {actionMessage ? <Text className="text-small text-success">{actionMessage}</Text> : null}
              </View>
            </AppCard>

            <AppCard title="Line items">
              <AppTable>
                <AppTableRow header>
                  <AppTableHeaderCell>SKU</AppTableHeaderCell>
                  <AppTableHeaderCell align="right">Qty</AppTableHeaderCell>
                  <AppTableHeaderCell align="right">Unit price</AppTableHeaderCell>
                  <AppTableHeaderCell align="right">Line total</AppTableHeaderCell>
                </AppTableRow>

                {order.lines.map((row) => (
                  <AppTableRow key={row.id}>
                    <AppTableCell>{row.sku}</AppTableCell>
                    <AppTableCell align="right" className="tabular-nums">
                      {row.qty}
                    </AppTableCell>
                    <AppTableCell align="right" className="tabular-nums">
                      {currency.format(Number(row.unitPrice ?? 0))}
                    </AppTableCell>
                    <AppTableCell align="right" className="tabular-nums">
                      {currency.format(Number(row.qty * row.unitPrice))}
                    </AppTableCell>
                  </AppTableRow>
                ))}

                {order.lines.length === 0 ? (
                  <AppTableRow>
                    <AppTableCell className="min-w-full">
                      <Text className="text-small text-muted">No line items found.</Text>
                    </AppTableCell>
                  </AppTableRow>
                ) : null}
              </AppTable>
            </AppCard>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}
