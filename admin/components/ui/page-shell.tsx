import type { ReactNode } from 'react';
import { View } from 'react-native';

type PageShellVariant = 'dashboard' | 'products' | 'inventory' | 'orders' | 'settings' | 'users' | 'ai';

type PageShellProps = {
  children: ReactNode;
  variant?: PageShellVariant;
};

const variantStyles: Record<PageShellVariant, { glowA: string; glowB: string; tint: string }> = {
  dashboard: {
    glowA: 'bg-[#d9e7fb]',
    glowB: 'bg-[#f6d8c5]',
    tint: 'bg-[#f9fbff]',
  },
  products: {
    glowA: 'bg-[#d7efe4]',
    glowB: 'bg-[#f3e2bb]',
    tint: 'bg-[#fbfdf8]',
  },
  inventory: {
    glowA: 'bg-[#d9eef3]',
    glowB: 'bg-[#d7e3f7]',
    tint: 'bg-[#f8fcfd]',
  },
  orders: {
    glowA: 'bg-[#f4decf]',
    glowB: 'bg-[#f0e7c8]',
    tint: 'bg-[#fdfaf7]',
  },
  settings: {
    glowA: 'bg-[#e4dcf4]',
    glowB: 'bg-[#d8e7d4]',
    tint: 'bg-[#faf9fd]',
  },
  users: {
    glowA: 'bg-[#dde6fb]',
    glowB: 'bg-[#e7d9f3]',
    tint: 'bg-[#fafbfe]',
  },
  ai: {
    glowA: 'bg-[#d7e2f5]',
    glowB: 'bg-[#efe0cc]',
    tint: 'bg-[#fbfcfe]',
  },
};

export function PageShell({ children, variant = 'dashboard' }: PageShellProps) {
  const styles = variantStyles[variant];

  return (
    <View className={`relative flex-1 overflow-hidden ${styles.tint}`}>
      <View className={`absolute -left-16 top-0 h-48 w-48 rounded-full opacity-50 blur-3xl ${styles.glowA}`} />
      <View className={`absolute right-0 top-12 h-56 w-56 rounded-full opacity-45 blur-3xl ${styles.glowB}`} />
      <View className="relative flex-1">{children}</View>
    </View>
  );
}
