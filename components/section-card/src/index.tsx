import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

export type SectionCardProps = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  className?: string;
};

export function SectionCard({ title, subtitle, children, className }: SectionCardProps) {
  return (
    <View className={`rounded-3xl border border-border bg-surface p-5 shadow-sm ${className ?? ''}`.trim()}>
      <View className="mb-4 gap-1">
        <Text className="text-section font-semibold text-text">{title}</Text>
        {subtitle ? <Text className="text-small text-muted">{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}
