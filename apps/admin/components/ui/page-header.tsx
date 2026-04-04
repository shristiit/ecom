import { Text, View, useWindowDimensions } from 'react-native';
import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 768;

  return (
    <View className={`mb-4 gap-3 ${isCompact ? '' : 'flex-row items-start justify-between'}`.trim()}>
      <View className="flex-1 gap-1">
        <Text className="text-title font-semibold text-text">{title}</Text>
        {subtitle ? <Text className="text-small text-muted">{subtitle}</Text> : null}
      </View>
      {actions ? <View className={`${isCompact ? 'flex-row flex-wrap' : 'flex-row items-center'} gap-2`}>{actions}</View> : null}
    </View>
  );
}
