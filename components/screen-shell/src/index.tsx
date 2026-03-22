import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

export type ScreenShellVariant =
  | 'dashboard'
  | 'products'
  | 'inventory'
  | 'orders'
  | 'settings'
  | 'users'
  | 'assistant'
  | 'default';

export type ScreenShellProps = {
  children: ReactNode;
  variant?: ScreenShellVariant;
  scrollable?: boolean;
  contentClassName?: string;
};

const variantStyles: Record<ScreenShellVariant, { tint: string; glowA: string; glowB: string }> = {
  dashboard: { tint: 'bg-[#f9fbff]', glowA: 'bg-[#d9e7fb]', glowB: 'bg-[#f6d8c5]' },
  products: { tint: 'bg-[#fbfdf8]', glowA: 'bg-[#d7efe4]', glowB: 'bg-[#f3e2bb]' },
  inventory: { tint: 'bg-[#f8fcfd]', glowA: 'bg-[#d9eef3]', glowB: 'bg-[#d7e3f7]' },
  orders: { tint: 'bg-[#fdfaf7]', glowA: 'bg-[#f4decf]', glowB: 'bg-[#f0e7c8]' },
  settings: { tint: 'bg-[#faf9fd]', glowA: 'bg-[#e4dcf4]', glowB: 'bg-[#d8e7d4]' },
  users: { tint: 'bg-[#fafbfe]', glowA: 'bg-[#dde6fb]', glowB: 'bg-[#e7d9f3]' },
  assistant: { tint: 'bg-[#fbfcfe]', glowA: 'bg-[#d7e2f5]', glowB: 'bg-[#efe0cc]' },
  default: { tint: 'bg-bg', glowA: 'bg-[#e7ecef]', glowB: 'bg-[#efe8de]' },
};

export function ScreenShell({
  children,
  variant = 'default',
  scrollable = true,
  contentClassName = 'px-6 py-6',
}: ScreenShellProps) {
  const styles = variantStyles[variant];
  const content = (
    <View className={`relative flex-1 ${contentClassName}`.trim()}>
      {children}
    </View>
  );

  return (
    <View className={`relative flex-1 overflow-hidden ${styles.tint}`.trim()}>
      <View className={`absolute -left-16 top-0 h-48 w-48 rounded-full opacity-50 blur-3xl ${styles.glowA}`} />
      <View className={`absolute right-0 top-12 h-56 w-56 rounded-full opacity-45 blur-3xl ${styles.glowB}`} />
      {scrollable ? <ScrollView className="flex-1">{content}</ScrollView> : content}
    </View>
  );
}
