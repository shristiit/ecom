import { type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppLogo } from '@admin/components/branding';
import { AppCard } from '@admin/components/ui';

type AuthScreenShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function AuthScreenShell({ title, subtitle, children }: AuthScreenShellProps) {
  return (
    <SafeAreaView className="flex-1 bg-bg px-4">
      <View className="flex-1 justify-center">
        <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center' }}>
          {/* Logo — large wordmark centred above the card */}
          <View style={{ alignItems: 'center', marginBottom: 28 }}>
            <AppLogo width={440} height={160} showWordmark variant="light" />
            {subtitle ? <Text className="mt-2 text-small text-muted">{subtitle}</Text> : null}
          </View>

          <AppCard className="w-full">
            {children}
          </AppCard>
        </View>
      </View>
    </SafeAreaView>
  );
}
