import { Text, View } from 'react-native';

type BadgeTone = 'default' | 'success' | 'warning' | 'error' | 'info';

type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  className?: string;
};

const toneClass: Record<BadgeTone, string> = {
  default: 'bg-surface-2 border-border text-text',
  success: 'bg-success-tint border-success/30 text-success',
  warning: 'bg-warning-tint border-warning/30 text-warning',
  error: 'bg-error-tint border-error/30 text-error',
  info: 'bg-info-tint border-info/30 text-info',
};

export function AppBadge({ label, tone = 'default', className }: BadgeProps) {
  return (
    <View className={`rounded-full border px-2.5 py-1 ${toneClass[tone]} ${className ?? ''}`.trim()}>
      <Text className="text-caption font-medium">{label}</Text>
    </View>
  );
}
