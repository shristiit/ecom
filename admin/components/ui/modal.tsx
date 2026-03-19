import { X } from 'lucide-react-native';
import { type ReactNode } from 'react';
import {
  Modal as NativeModal,
  Pressable,
  ScrollView,
  Text,
  type GestureResponderEvent,
  View,
  useWindowDimensions,
} from 'react-native';

type ModalSize = 'sm' | 'md' | 'lg';

type AppModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: ModalSize;
  closeOnBackdropPress?: boolean;
  footer?: ReactNode;
  children: ReactNode;
};

const sizeClass: Record<ModalSize, string> = {
  sm: 'max-w-[420px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[920px]',
};

export function AppModal({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  closeOnBackdropPress = true,
  footer,
  children,
}: AppModalProps) {
  const { width, height } = useWindowDimensions();
  const isCompact = width < 768;

  const handleBackdropPress = () => {
    if (closeOnBackdropPress) {
      onClose();
    }
  };

  const stopPropagation = (event: GestureResponderEvent) => {
    event.stopPropagation();
  };

  return (
    <NativeModal animationType="fade" transparent visible={isOpen} onRequestClose={onClose}>
      <Pressable
        className={`flex-1 bg-black/40 ${isCompact ? 'justify-end px-0' : 'items-center justify-center px-4'}`.trim()}
        onPress={handleBackdropPress}
      >
        <Pressable
          className={`w-full border border-border bg-surface shadow-lift ${isCompact ? 'rounded-t-3xl border-b-0' : `${sizeClass[size]} rounded-lg`}`}
          style={{ maxHeight: isCompact ? height * 0.88 : 520 }}
          onPress={stopPropagation}
        >
          <View className={`flex-row items-start justify-between gap-3 border-b border-border ${isCompact ? 'px-4 py-4' : 'px-4 py-3'}`.trim()}>
            <View className="flex-1 gap-1">
              {title ? <Text className="text-section font-semibold text-text">{title}</Text> : null}
              {description ? <Text className="text-small text-muted">{description}</Text> : null}
            </View>
            <Pressable className="rounded-sm p-1" onPress={onClose} hitSlop={8}>
              <X size={18} color="#64748B" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: isCompact ? 24 : 16 }}>
            {children}
          </ScrollView>

          {footer ? <View className={`border-t border-border ${isCompact ? 'px-4 py-4' : 'px-4 py-3'}`.trim()}>{footer}</View> : null}
        </Pressable>
      </Pressable>
    </NativeModal>
  );
}
