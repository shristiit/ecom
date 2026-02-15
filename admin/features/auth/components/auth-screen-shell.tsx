import { type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppLogo } from '@/components/branding';
import { AppCard } from '@/components/ui';

type AuthScreenShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function AuthScreenShell({ title, subtitle, children }: AuthScreenShellProps) {
  return (
    <SafeAreaView className="flex-1 bg-bg px-6">
      <View className="flex-1 justify-center">
        <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center' }}>
          <View className="mb-6 items-center gap-3">
            <AppLogo size={64} showWordmark />
            <View className="items-center">
              <Text className="text-title font-semibold text-text">{title}</Text>
              {subtitle ? <Text className="mt-1 text-small text-muted">{subtitle}</Text> : null}
            </View>
          </View>

          <AppCard className="w-full">{children}</AppCard>
        </View>
      </View>
    </SafeAreaView>
  );
}
