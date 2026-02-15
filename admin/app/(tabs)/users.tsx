import { ScrollView, View, Text } from 'react-native';
import { PermissionGate } from '@/features/auth';

export default function AdminUsers() {
  return (
    <PermissionGate permission="admin.roles.read">
      <ScrollView className="bg-bgPrimary px-6 py-6">
        <View className="gap-4">
          <View className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
            <Text className="text-2xl font-semibold text-textPrimary">Users</Text>
            <Text className="mt-2 text-textSecondary">Roles, permissions, and approvals.</Text>
          </View>
          <View className="rounded-lg border border-borderSubtle bg-bgElevated p-6 shadow-sm">
            <Text className="text-textMuted">No users loaded.</Text>
          </View>
        </View>
      </ScrollView>
    </PermissionGate>
  );
}
