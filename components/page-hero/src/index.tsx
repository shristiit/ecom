import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

export type PageHeroProps = {
  eyebrow?: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  centered?: boolean;
};

export function PageHero({ eyebrow, title, subtitle, actions, centered = false }: PageHeroProps) {
  return (
    <View className={`mb-6 gap-3 ${centered ? 'items-center' : ''}`.trim()}>
      {eyebrow ? <View>{eyebrow}</View> : null}
      <View className={centered ? 'items-center' : ''}>
        <Text className={`text-title font-semibold text-text ${centered ? 'text-center' : ''}`.trim()}>{title}</Text>
        {subtitle ? (
          <Text className={`mt-1 text-small text-muted ${centered ? 'text-center' : ''}`.trim()}>{subtitle}</Text>
        ) : null}
      </View>
      {actions ? <View className={`flex-row gap-2 ${centered ? 'justify-center' : ''}`.trim()}>{actions}</View> : null}
    </View>
  );
}
