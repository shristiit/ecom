import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton, AppCard } from '@/components/ui';
import { useAuthSession } from '@/features/auth';

export default function ForbiddenScreen() {
  const { signOut } = useAuthSession();

  return (
    <SafeAreaView className="flex-1 bg-bg px-4">
      <View className="flex-1 items-center justify-center">
        <AppCard className="w-full max-w-[520px]" title="Access denied" subtitle="You do not have permissions required to access this screen.">
          <View className="gap-4">
            <Text className="text-small text-muted">
              Contact an administrator to update your role permissions, or sign in with another account.
            </Text>
            <AppButton label="Sign out" variant="secondary" onPress={signOut} />
          </View>
        </AppCard>
      </View>
    </SafeAreaView>
  );
}
