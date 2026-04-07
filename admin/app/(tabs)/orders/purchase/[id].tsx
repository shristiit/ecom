import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppBadge, AppButton, AppCard, AppInput, AppTable, AppTableCell, AppTableHeaderCell, AppTableRow, PageHeader } from '@admin/components/ui';
import {
  useClosePurchaseOrderMutation,
  usePurchaseOrderQuery,
  useReceivePurchaseOrderMutation,
} from '@admin/features/orders';
import { downloadPurchaseOrderPdf } from '@admin/features/orders/utils/order-pdf';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function PurchaseOrderDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = params.id;
  const orderId = Array.isArray(rawId) ? rawId[0] : rawId;

  const query = usePurchaseOrderQuery(orderId, Boolean(orderId));
  const receiveOrder = useReceivePurchaseOrderMutation();
  const closeOrder = useClosePurchaseOrderMutation();

  const [locationId, setLocationId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const order = query.data;

  const receivableLines = useMemo(
    () =>
      (order?.lines ?? [])
        .map((line) => ({
          sizeId: line.skuId,
          qty: Math.max(0, line.qtyOrdered - line.qtyReceived),
          unitCost: line.unitCost,
        }))
        .filter((line) => line.qty > 0),
    [order?.lines],
  );

  const handleReceive = async () => {
    if (!orderId) return;

    if (!locationId.trim()) {
      setActionError('Location ID is required to receive stock.');
      return;
    }

    if (receivableLines.length === 0) {
      setActionError('No remaining lines to receive.');
      return;
    }

    setActionError(null);
    setActionMessage(null);
    try {
      await receiveOrder.mutateAsync({ id: orderId, locationId: locationId.trim(), lines: receivableLines });
      setActionMessage('Stock receipt posted successfully.');
      await query.refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to receive stock.');
    }
  };

  const handleClose = async () => {
    if (!orderId) return;

    setActionError(null);
    setActionMessage(null);
    try {
      await closeOrder.mutateAsync(orderId);
      setActionMessage('PO closed successfully.');
      await query.refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to close PO.');
    }
  };

  const handleDownloadPdf = async () => {
    if (!order) return;

    setActionError(null);
    setActionMessage(null);
    try {
      setDownloadingPdf(true);
      await downloadPurchaseOrderPdf(order);
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
        title={order ? `Purchase order ${order.number}` : `Purchase order ${orderId ?? ''}`}
        subtitle="Supplier details, line progress, and receiving actions."
        actions={
          <View className="flex-row gap-2">
            <AppButton label="Download PDF" size="sm" variant="secondary" loading={downloadingPdf} onPress={() => void handleDownloadPdf()} />
            <AppButton label="Receive" size="sm" loading={receiveOrder.isPending} onPress={() => void handleReceive()} />
            <AppButton label="Close PO" size="sm" variant="secondary" loading={closeOrder.isPending} onPress={() => void handleClose()} />
          </View>
        }
      />

      <View className="gap-4">
        {query.isLoading ? <Text className="text-small text-muted">Loading purchase order...</Text> : null}
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
                <AppBadge label={order.status} tone={order.status === 'closed' ? 'success' : 'info'} />
                <Text className="text-small text-muted">Supplier: {order.supplierName}</Text>
                <Text className="text-small text-muted">Remaining lines: {receivableLines.length}</Text>
              </View>
            </AppCard>

            <AppCard title="Receive settings">
              <View className="gap-3">
                <AppInput
                  label="Location ID"
                  placeholder="Receiving location UUID"
                  value={locationId}
                  onChangeText={setLocationId}
                />
                {actionError ? <Text className="text-small text-error">{actionError}</Text> : null}
                {actionMessage ? <Text className="text-small text-success">{actionMessage}</Text> : null}
              </View>
            </AppCard>

            <AppCard title="Lines">
              <AppTable>
                <AppTableRow header>
                  <AppTableHeaderCell>SKU</AppTableHeaderCell>
                  <AppTableHeaderCell align="right">Ordered</AppTableHeaderCell>
                  <AppTableHeaderCell align="right">Received</AppTableHeaderCell>
                  <AppTableHeaderCell align="right">Unit cost</AppTableHeaderCell>
                </AppTableRow>

                {order.lines.map((row) => (
                  <AppTableRow key={row.id}>
                    <AppTableCell>{row.sku}</AppTableCell>
                    <AppTableCell align="right" className="tabular-nums">
                      {row.qtyOrdered}
                    </AppTableCell>
                    <AppTableCell align="right" className="tabular-nums">
                      {row.qtyReceived}
                    </AppTableCell>
                    <AppTableCell align="right" className="tabular-nums">
                      {currency.format(Number(row.unitCost ?? 0))}
                    </AppTableCell>
                  </AppTableRow>
                ))}

                {order.lines.length === 0 ? (
                  <AppTableRow>
                    <AppTableCell className="min-w-full">
                      <Text className="text-small text-muted">No purchase lines found.</Text>
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
