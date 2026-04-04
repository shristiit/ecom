import { ScrollView, View, Text } from 'react-native';

export default function Profile() {
  return (
    <ScrollView className="bg-bgPrimary px-6 py-6">
      <View className="gap-4">
        <View className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
          <Text className="text-2xl font-semibold text-textPrimary">Profile</Text>
          <Text className="mt-2 text-textSecondary">Manage account and addresses.</Text>
        </View>
        <View className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
          <Text className="text-textMuted">No profile data.</Text>
        </View>
      </View>
    </ScrollView>
  );
}
