import { Link } from 'expo-router';
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
import { usePurchaseOrdersQuery } from '@admin/features/orders';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export default function PurchaseOrdersScreen() {
  const query = usePurchaseOrdersQuery({ page: 1, pageSize: 100 });
  const rows = query.data?.items ?? [];

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title="Purchase orders"
        subtitle="Supplier-facing order workflow with receiving controls."
        actions={
          <Link href="/orders/purchase/new" asChild>
            <AppButton label="Create PO" size="sm" />
          </Link>
        }
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
    </ScrollView>
  );
}
