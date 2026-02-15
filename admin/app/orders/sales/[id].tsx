import { ScrollView, View, Text, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function SalesOrderDetail() {
  const { id } = useLocalSearchParams();

  return (
    <ScrollView className="bg-bgPrimary px-6 py-6">
      <View className="gap-4">
        <View className="flex-row items-center justify-between rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
          <View>
            <Text className="text-2xl font-semibold text-textPrimary">Sales Order</Text>
            <Text className="mt-2 text-textSecondary">{String(id)}</Text>
          </View>
          <Pressable className="rounded-md border border-borderStrong px-4 py-2">
            <Text className="text-textPrimary">Edit</Text>
          </Pressable>
        </View>
        <View className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
          <Text className="text-base font-medium text-textPrimary">Order Details</Text>
          <Text className="mt-2 text-textMuted">Line items, totals, status.</Text>
        </View>
      </View>
    </ScrollView>
  );
}
