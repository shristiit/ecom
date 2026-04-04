import { ScrollView, View, Text } from 'react-native';

export default function Orders() {
  return (
    <ScrollView className="bg-bgPrimary px-6 py-6">
      <View className="gap-4">
        <View className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
          <Text className="text-2xl font-semibold text-textPrimary">Orders</Text>
          <Text className="mt-2 text-textSecondary">Track your order history.</Text>
        </View>
        <View className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
          <Text className="text-textMuted">No orders yet.</Text>
        </View>
      </View>
    </ScrollView>
  );
}
