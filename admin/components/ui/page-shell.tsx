import type { ReactNode } from 'react';
import { View } from 'react-native';

type PageShellVariant = 'dashboard' | 'products' | 'inventory' | 'orders' | 'settings' | 'users' | 'ai';

type PageShellProps = {
  children: ReactNode;
  variant?: PageShellVariant;
};

export function PageShell({ children }: PageShellProps) {
  return <View className="flex-1 bg-bg">{children}</View>;
}
