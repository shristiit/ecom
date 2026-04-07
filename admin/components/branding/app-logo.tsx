import { Image } from 'expo-image';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useColorScheme } from '@admin/hooks/use-color-scheme';

type AppLogoProps = {
  size?: number;
  width?: number;
  height?: number;
  showWordmark?: boolean;
  opacity?: number;
  containerStyle?: StyleProp<ViewStyle>;
};

const LOGO_SOURCES = {
  light: {
    badge: require('../../assets/images/stockaisle_inventory_primary_badge_light.png'),
    full: require('../../assets/images/stockaisle_inventory_primary_transparent.png'),
  },
  dark: {
    badge: require('../../assets/images/stockaisle_inventory_primary_badge_dark.png'),
    full: require('../../assets/images/stockaisle_inventory_primary_darkbg.png'),
  },
} as const;

export function AppLogo({ size = 56, width, height, showWordmark = false, opacity = 1, containerStyle }: AppLogoProps) {
  const colorScheme = useColorScheme();
  const mode = colorScheme === 'dark' ? 'dark' : 'light';
  const source = showWordmark ? LOGO_SOURCES[mode].full : LOGO_SOURCES[mode].badge;
  const resolvedWidth = width ?? size;
  const resolvedHeight = height ?? size;

  return (
    <View className="items-center justify-center" style={containerStyle}>
      <Image
        source={source}
        style={{ width: resolvedWidth, height: resolvedHeight, opacity }}
        contentFit="contain"
        accessibilityLabel="StockAisle logo"
      />
    </View>
  );
}
