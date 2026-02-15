import { ScrollView, View, Text, Pressable } from 'react-native';
import { Link } from 'expo-router';

const mockProducts = [
  { id: 'P-1001', name: 'Silk Blend Tee', sku: 'SBT-001', status: 'active' },
  { id: 'P-1002', name: 'Linen Overshirt', sku: 'LOS-014', status: 'active' },
  { id: 'P-1003', name: 'Wool Tailored Trouser', sku: 'WTT-207', status: 'inactive' },
];

export default function AdminProducts() {
  return (
    <ScrollView className="bg-bgPrimary px-6 py-6">
      <View className="gap-4">
        <View className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
          <Text className="text-2xl font-semibold text-textPrimary">Products</Text>
          <Text className="mt-2 text-textSecondary">
            Styles, SKUs, sizes, and price visibility.
          </Text>
        </View>

        <View className="rounded-lg border border-borderSubtle bg-bgElevated shadow-sm">
          <View className="flex-row items-center justify-between border-b border-borderSubtle px-4 py-3">
            <Text className="text-sm uppercase tracking-wide text-textMuted">Product</Text>
            <Text className="text-sm uppercase tracking-wide text-textMuted">Status</Text>
          </View>
          {mockProducts.map((p) => (
            <Link key={p.id} href={`/products/${p.id}`} asChild>
              <Pressable className="flex-row items-center justify-between px-4 py-4">
                <View>
                  <Text className="text-base font-medium text-textPrimary">{p.name}</Text>
                  <Text className="text-sm text-textMuted">{p.sku}</Text>
                </View>
                <Text className={p.status === 'active' ? 'text-success' : 'text-textMuted'}>
                  {p.status}
                </Text>
              </Pressable>
            </Link>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
