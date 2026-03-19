import { X } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { Modal as NativeModal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

type AppDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  widthClassName?: string;
  footer?: ReactNode;
  children: ReactNode;
};

export function AppDrawer({
  isOpen,
  onClose,
  title,
  description,
  widthClassName = 'w-full max-w-[420px]',
  footer,
  children,
}: AppDrawerProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 768;
  const resolvedWidthClassName = isCompact ? 'w-full' : widthClassName;

  return (
    <NativeModal animationType="fade" transparent visible={isOpen} onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/30" onPress={onClose}>
        <View className="flex-1 flex-row justify-end">
          <Pressable className={`h-full bg-surface shadow-lift ${resolvedWidthClassName}`} onPress={(event) => event.stopPropagation()}>
            <View className={`flex-row items-start justify-between gap-3 border-b border-border ${isCompact ? 'px-4 py-4' : 'px-4 py-3'}`.trim()}>
              <View className="flex-1 gap-1">
                {title ? <Text className="text-section font-semibold text-text">{title}</Text> : null}
                {description ? <Text className="text-small text-muted">{description}</Text> : null}
              </View>
              <Pressable className="rounded-sm p-1" onPress={onClose} hitSlop={8}>
                <X size={18} color="#64748B" />
              </Pressable>
            </View>

            <ScrollView className={`flex-1 ${isCompact ? 'px-4 py-5' : 'px-4 py-4'}`.trim()}>{children}</ScrollView>

            {footer ? <View className={`border-t border-border ${isCompact ? 'px-4 py-4' : 'px-4 py-3'}`.trim()}>{footer}</View> : null}
          </Pressable>
        </View>
      </Pressable>
    </NativeModal>
  );
}
