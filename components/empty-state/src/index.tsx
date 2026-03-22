import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

export type EmptyStateProps = {
  title: string;
  detail?: string;
  action?: ReactNode;
};

export function EmptyState({ title, detail, action }: EmptyStateProps) {
  return (
    <View className="rounded-2xl border border-dashed border-border bg-surface p-6">
      <Text className="text-small font-semibold text-text">{title}</Text>
      {detail ? <Text className="mt-1 text-small text-muted">{detail}</Text> : null}
      {action ? <View className="mt-4">{action}</View> : null}
    </View>
  );
}
