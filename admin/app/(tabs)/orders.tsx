import { ScrollView, View, Text, Pressable } from 'react-native';
import { Link } from 'expo-router';

export default function OrdersHub() {
  return (
    <ScrollView className="bg-bgPrimary px-6 py-6">
      <View className="gap-4">
        <View className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
          <Text className="text-2xl font-semibold text-textPrimary">Orders</Text>
          <Text className="mt-2 text-textSecondary">Sales orders and purchase orders.</Text>
        </View>

        <Link href="/orders/sales" asChild>
          <Pressable className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
            <Text className="text-lg font-medium text-textPrimary">Sales Orders</Text>
            <Text className="mt-2 text-textMuted">View customer invoices and status.</Text>
          </Pressable>
        </Link>

        <Link href="/orders/purchase" asChild>
          <Pressable className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
            <Text className="text-lg font-medium text-textPrimary">Purchase Orders</Text>
            <Text className="mt-2 text-textMuted">Track supplier POs and receipts.</Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}
