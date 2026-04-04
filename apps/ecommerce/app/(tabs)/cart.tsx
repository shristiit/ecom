import { ScrollView, View, Text } from 'react-native';

export default function Cart() {
  return (
    <ScrollView className="bg-bgPrimary px-6 py-6">
      <View className="gap-4">
        <View className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
          <Text className="text-2xl font-semibold text-textPrimary">Your Cart</Text>
          <Text className="mt-2 text-textSecondary">Multiple carts supported.</Text>
        </View>
        <View className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
          <Text className="text-textMuted">Your cart is empty.</Text>
        </View>
      </View>
    </ScrollView>
  );
}
