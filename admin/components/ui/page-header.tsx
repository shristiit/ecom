import { Text, View } from 'react-native';
import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <View className="mb-4 flex-row items-start justify-between gap-3">
      <View className="flex-1 gap-1">
        <Text className="text-title font-semibold text-text">{title}</Text>
        {subtitle ? <Text className="text-small text-muted">{subtitle}</Text> : null}
      </View>
      {actions ? <View className="flex-row items-center gap-2">{actions}</View> : null}
    </View>
  );
}
