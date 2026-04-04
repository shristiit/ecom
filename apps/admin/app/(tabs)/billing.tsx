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
  PageShell,
} from '@/components/ui';

const invoices = [
  {
    id: 'INV-24031',
    period: 'Mar 2026',
    dueDate: '2026-03-28',
    amount: '$1,240.00',
    status: 'due',
  },
  {
    id: 'INV-24012',
    period: 'Feb 2026',
    dueDate: '2026-02-28',
    amount: '$1,240.00',
    status: 'paid',
  },
  {
    id: 'INV-23987',
    period: 'Jan 2026',
    dueDate: '2026-01-28',
    amount: '$1,180.00',
    status: 'paid',
  },
] as const;

const paymentMethods = [
  { label: 'Primary card', value: 'Visa ending 4242', helper: 'Auto-pay enabled' },
  { label: 'Billing email', value: 'finance@stockaisle.com', helper: 'Receives invoices and receipts' },
  { label: 'Plan', value: 'Growth', helper: 'Monthly billing cycle' },
] as const;

export default function BillingPaymentsScreen() {
  return (
    <PageShell variant="settings">
      <ScrollView className="px-6 py-6">
        <PageHeader
          title="Billing & Payments"
          subtitle="Subscription, invoices, payment methods, and billing contacts."
          actions={<AppButton label="Update payment method" size="sm" />}
        />

        <View className="gap-4 pb-6">
          <View className="flex-row flex-wrap gap-4">
            <View className="min-w-[260px] flex-1">
              <AppCard title="Current balance">
                <Text className="text-[28px] font-semibold text-text">$1,240.00</Text>
                <Text className="mt-1 text-small text-muted">Outstanding on the current cycle.</Text>
              </AppCard>
            </View>

            <View className="min-w-[260px] flex-1">
              <AppCard title="Next charge">
                <Text className="text-[28px] font-semibold text-text">March 28</Text>
                <Text className="mt-1 text-small text-muted">Auto-pay will process on the due date.</Text>
              </AppCard>
            </View>

            <View className="min-w-[260px] flex-1">
              <AppCard title="Payment status">
                <AppBadge label="Auto-pay active" tone="success" />
                <Text className="mt-3 text-small text-muted">Primary card is valid and active for recurring charges.</Text>
              </AppCard>
            </View>
          </View>

          <AppCard title="Invoices" subtitle="Recent billing periods and payment status.">
            <AppTable>
              <AppTableRow header>
                <AppTableHeaderCell>Invoice</AppTableHeaderCell>
                <AppTableHeaderCell>Period</AppTableHeaderCell>
                <AppTableHeaderCell>Due date</AppTableHeaderCell>
                <AppTableHeaderCell align="right">Amount</AppTableHeaderCell>
                <AppTableHeaderCell align="right">Status</AppTableHeaderCell>
              </AppTableRow>

              {invoices.map((invoice) => (
                <AppTableRow key={invoice.id}>
                  <AppTableCell>{invoice.id}</AppTableCell>
                  <AppTableCell>{invoice.period}</AppTableCell>
                  <AppTableCell>{invoice.dueDate}</AppTableCell>
                  <AppTableCell align="right" className="tabular-nums">
                    {invoice.amount}
                  </AppTableCell>
                  <AppTableCell align="right">
                    <AppBadge label={invoice.status} tone={invoice.status === 'paid' ? 'success' : 'warning'} />
                  </AppTableCell>
                </AppTableRow>
              ))}
            </AppTable>
          </AppCard>

          <AppCard title="Payment settings" subtitle="Manage where charges and receipts go.">
            <View className="gap-3">
              {paymentMethods.map((item) => (
                <View key={item.label} className="rounded-md border border-border bg-surface-2 px-4 py-3">
                  <Text className="text-caption uppercase tracking-wide text-subtle">{item.label}</Text>
                  <Text className="mt-1 text-small font-semibold text-text">{item.value}</Text>
                  <Text className="mt-1 text-caption text-muted">{item.helper}</Text>
                </View>
              ))}
            </View>
          </AppCard>
        </View>
      </ScrollView>
    </PageShell>
  );
}
