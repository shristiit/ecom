import { Image } from 'expo-image';
import { View } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';

type AppLogoProps = {
  size?: number;
  showWordmark?: boolean;
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

export function AppLogo({ size = 56, showWordmark = false }: AppLogoProps) {
  const colorScheme = useColorScheme();
  const mode = colorScheme === 'dark' ? 'dark' : 'light';
  const source = showWordmark ? LOGO_SOURCES[mode].full : LOGO_SOURCES[mode].badge;

  return (
    <View className="items-center justify-center">
      <Image
        source={source}
        style={{ width: size, height: size }}
        contentFit="contain"
        accessibilityLabel="StockAisle logo"
      />
    </View>
  );
}
