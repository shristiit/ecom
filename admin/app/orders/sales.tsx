import { ScrollView, View, Text, Pressable } from 'react-native';
import { Link } from 'expo-router';

const mockSales = [
  { id: 'SO-1001', customer: 'Harper & Co.', total: '£1,240', status: 'sent' },
  { id: 'SO-1002', customer: 'Stonebridge', total: '£2,030', status: 'draft' },
  { id: 'SO-1003', customer: 'Northline', total: '£980', status: 'paid' },
];

export default function SalesOrders() {
  return (
    <ScrollView className="bg-bgPrimary px-6 py-6">
      <View className="gap-4">
        <View className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
          <Text className="text-2xl font-semibold text-textPrimary">Sales Orders</Text>
          <Text className="mt-2 text-textSecondary">Full list of invoices.</Text>
        </View>

        <View className="rounded-lg border border-borderSubtle bg-bgElevated shadow-sm">
          <View className="flex-row items-center justify-between border-b border-borderSubtle px-4 py-3">
            <Text className="text-sm uppercase tracking-wide text-textMuted">Order</Text>
            <Text className="text-sm uppercase tracking-wide text-textMuted">Status</Text>
          </View>
          {mockSales.map((o) => (
            <Link key={o.id} href={`/orders/sales/${o.id}`} asChild>
              <Pressable className="flex-row items-center justify-between px-4 py-4">
                <View>
                  <Text className="text-base font-medium text-textPrimary">{o.id}</Text>
                  <Text className="text-sm text-textMuted">{o.customer} · {o.total}</Text>
                </View>
                <Text className="text-textSecondary">{o.status}</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
