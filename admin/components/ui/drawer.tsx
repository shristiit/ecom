import { X } from 'lucide-react-native';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal as NativeModal, Pressable, ScrollView, Text, View } from 'react-native';

type AppDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  side?: 'left' | 'right';
  widthClassName?: string;
  footer?: ReactNode;
  children: ReactNode;
};

export function AppDrawer({
  isOpen,
  onClose,
  title,
  description,
  side = 'right',
  widthClassName = 'w-full max-w-[420px]',
  footer,
  children,
}: AppDrawerProps) {
  const [visible, setVisible] = useState(isOpen);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(side === 'left' ? -360 : 360)).current;

  useEffect(() => {
    const closedOffset = side === 'left' ? -360 : 360;

    if (isOpen) {
      setVisible(true);
      translateX.setValue(closedOffset);
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: closedOffset,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setVisible(false);
      }
    });
  }, [isOpen, overlayOpacity, side, translateX]);

  if (!visible) {
    return null;
  }

  return (
    <NativeModal animationType="none" transparent visible={visible} onRequestClose={onClose}>
      <View className="flex-1">
        <Animated.View className="absolute inset-0 bg-black/30" style={{ opacity: overlayOpacity }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          accessibilityHint="Dismisses the side panel."
          className="flex-1"
          onPress={onClose}
        >
          <View className={`flex-1 flex-row ${side === 'left' ? 'justify-start' : 'justify-end'}`.trim()}>
            <Animated.View
              style={{ transform: [{ translateX }] }}
              className={`h-full bg-surface shadow-lift ${widthClassName}`}
            >
              <Pressable
                accessibilityLabel={title ?? 'Side panel'}
                accessibilityHint={description}
                className="h-full bg-surface"
                onPress={(event) => event.stopPropagation()}
              >
                <View className="flex-row items-start justify-between gap-3 border-b border-border px-4 py-3">
                  <View className="flex-1 gap-1">
                    {title ? <Text className="text-section font-semibold text-text">{title}</Text> : null}
                    {description ? <Text className="text-small text-muted">{description}</Text> : null}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={title ? `Close ${title}` : 'Close panel'}
                    accessibilityHint="Dismisses the side panel."
                    className="rounded-sm p-1"
                    onPress={onClose}
                    hitSlop={8}
                  >
                    <X size={18} color="#64748B" />
                  </Pressable>
                </View>

                <ScrollView className="flex-1 px-4 py-4">{children}</ScrollView>

                {footer ? <View className="border-t border-border px-4 py-3">{footer}</View> : null}
              </Pressable>
            </Animated.View>
          </View>
        </Pressable>
      </View>
    </NativeModal>
  );
}
