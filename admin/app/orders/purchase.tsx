import { ScrollView, View, Text, Pressable } from 'react-native';
import { Link } from 'expo-router';

const mockPOs = [
  { id: 'PO-2001', supplier: 'Atlas Textiles', total: '£3,400', status: 'open' },
  { id: 'PO-2002', supplier: 'North Loom', total: '£1,250', status: 'draft' },
  { id: 'PO-2003', supplier: 'Marrow & Co.', total: '£2,900', status: 'closed' },
];

export default function PurchaseOrders() {
  return (
    <ScrollView className="bg-bgPrimary px-6 py-6">
      <View className="gap-4">
        <View className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
          <Text className="text-2xl font-semibold text-textPrimary">Purchase Orders</Text>
          <Text className="mt-2 text-textSecondary">Full list of supplier orders.</Text>
        </View>

        <View className="rounded-lg border border-borderSubtle bg-bgElevated shadow-sm">
          <View className="flex-row items-center justify-between border-b border-borderSubtle px-4 py-3">
            <Text className="text-sm uppercase tracking-wide text-textMuted">Order</Text>
            <Text className="text-sm uppercase tracking-wide text-textMuted">Status</Text>
          </View>
          {mockPOs.map((o) => (
            <Link key={o.id} href={`/orders/purchase/${o.id}`} asChild>
              <Pressable className="flex-row items-center justify-between px-4 py-4">
                <View>
                  <Text className="text-base font-medium text-textPrimary">{o.id}</Text>
                  <Text className="text-sm text-textMuted">{o.supplier} · {o.total}</Text>
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
