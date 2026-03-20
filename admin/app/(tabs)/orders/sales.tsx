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
} from '@/components/ui';
import { useSalesOrdersQuery } from '@/features/orders';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export default function SalesOrdersScreen() {
  const query = useSalesOrdersQuery({ page: 1, pageSize: 100 });
  const rows = query.data?.items ?? [];

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title="Sales orders"
        subtitle="Track customer invoices, payment, and dispatch readiness."
        actions={
          <Link href="/orders/sales/new" asChild>
            <AppButton label="Create invoice" size="sm" />
          </Link>
        }
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
    </ScrollView>
  );
}
