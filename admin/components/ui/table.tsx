import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import type { ReactNode } from 'react';

type TableProps = {
  children: ReactNode;
  className?: string;
};

type TableRowProps = {
  children: ReactNode;
  header?: boolean;
  className?: string;
};

type TableCellProps = {
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
};

const alignClass = {
  left: 'text-left items-start',
  right: 'text-right items-end',
  center: 'text-center items-center',
};

export function AppTable({ children, className }: TableProps) {
  const { width } = useWindowDimensions();
  const minTableWidth = width < 768 ? 640 : width;

  return (
    <View className={`overflow-hidden rounded-lg border border-border bg-surface ${className ?? ''}`.trim()}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ minWidth: minTableWidth }}
      >
        <View className="w-full">{children}</View>
      </ScrollView>
    </View>
  );
}

export function AppTableRow({ children, header = false, className }: TableRowProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 768;

  return (
    <View
      className={`${header ? 'bg-surface-2' : 'bg-surface'} flex-row border-b border-border ${isCompact ? 'px-2.5 py-2.5' : 'px-3 py-3'} ${className ?? ''}`.trim()}
    >
      {children}
    </View>
  );
}

export function AppTableCell({ children, align = 'left', className }: TableCellProps) {
  const { width } = useWindowDimensions();
  const isText = typeof children === 'string' || typeof children === 'number';
  const minWidthClass = width < 768 ? 'min-w-[96px]' : 'min-w-[120px]';

  return (
    <View className={`${minWidthClass} flex-1 justify-center ${alignClass[align]} ${className ?? ''}`.trim()}>
      {isText ? <Text className="text-small text-text">{children}</Text> : children}
    </View>
  );
}

export function AppTableHeaderCell({ children, align = 'left', className }: TableCellProps) {
  const { width } = useWindowDimensions();
  const minWidthClass = width < 768 ? 'min-w-[96px]' : 'min-w-[120px]';

  return (
    <View className={`${minWidthClass} flex-1 justify-center ${alignClass[align]} ${className ?? ''}`.trim()}>
      <Text className="text-caption font-semibold uppercase tracking-wide text-subtle">{children}</Text>
    </View>
  );
}
