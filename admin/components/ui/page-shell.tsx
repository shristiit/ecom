import type { ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import type { ScrollViewProps } from 'react-native';

type PageShellProps = {
  children: ReactNode;
};

/** Outer flex container for a page. Wraps children with a full-height background. */
export function PageShell({ children }: PageShellProps) {
  return <View className="flex-1 bg-bg">{children}</View>;
}

type PageScrollViewProps = ScrollViewProps & {
  children: ReactNode;
};

/**
 * A ScrollView with responsive horizontal padding:
 *   - px-4 (16px) on narrow screens  < 640px
 *   - px-6 (24px) on wider screens  ≥ 640px
 *
 * Use this instead of <ScrollView className="px-6 py-6"> in every screen
 * so padding adjusts automatically across device sizes.
 */
export function PageScrollView({ children, style, ...props }: PageScrollViewProps) {
  const { width } = useWindowDimensions();
  const horizontalPadding = width < 640 ? 16 : 24;

  return (
    <ScrollView
      contentContainerStyle={[{ paddingHorizontal: horizontalPadding, paddingVertical: 24 }, style]}
      {...props}
    >
      {children}
    </ScrollView>
  );
}
