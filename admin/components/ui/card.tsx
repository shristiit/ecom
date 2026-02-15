import { Text, View } from 'react-native';
import type { ReactNode } from 'react';

type CardProps = {
  title?: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function AppCard({ title, subtitle, rightSlot, children, className }: CardProps) {
  return (
    <View className={`rounded-lg border border-border bg-surface p-4 shadow-soft ${className ?? ''}`.trim()}>
      {title || subtitle || rightSlot ? (
        <View className="mb-3 flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            {title ? <Text className="text-section font-semibold text-text">{title}</Text> : null}
            {subtitle ? <Text className="text-small text-muted">{subtitle}</Text> : null}
          </View>
          {rightSlot}
        </View>
      ) : null}
      {children}
    </View>
  );
}
