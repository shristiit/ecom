import { View, Text, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function ProductDetail() {
  const { id } = useLocalSearchParams();

  return (
    <ScrollView className="bg-bgPrimary px-6 py-6">
      <View className="gap-4">
        <View className="flex-row items-center justify-between rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
          <View>
            <Text className="text-2xl font-semibold text-textPrimary">Product Details</Text>
            <Text className="mt-2 text-textSecondary">{String(id)}</Text>
          </View>
          <Pressable className="rounded-md border border-borderStrong px-4 py-2">
            <Text className="text-textPrimary">Edit</Text>
          </Pressable>
        </View>

        <View className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
          <Text className="text-base font-medium text-textPrimary">Overview</Text>
          <Text className="mt-2 text-textMuted">Details, SKUs, sizes, and pricing.</Text>
        </View>
      </View>
    </ScrollView>
  );
}
