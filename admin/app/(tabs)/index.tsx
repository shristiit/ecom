import { ScrollView, View, Text } from 'react-native';

export default function AdminDashboard() {
  return (
    <ScrollView className="bg-bgPrimary px-6 py-6">
      <View className="gap-4">
        <View className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
          <Text className="text-2xl font-semibold text-textPrimary">Overview</Text>
          <Text className="mt-2 text-textSecondary">
            Inventory health, low stock, and latest movements.
          </Text>
        </View>

        <View className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
          <Text className="text-lg font-medium text-textPrimary">Low Stock Alerts</Text>
          <Text className="mt-2 text-textMuted">No alerts configured yet.</Text>
        </View>

        <View className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
          <Text className="text-lg font-medium text-textPrimary">Recent Movements</Text>
          <Text className="mt-2 text-textMuted">No recent movements.</Text>
        </View>
      </View>
    </ScrollView>
  );
}
