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
  /**
   * 'auto'  — picks light/dark based on the active colour scheme
   * 'light' — orange logo, for white/light backgrounds
   * 'dark'  — white logo, for the orange sidebar or dark backgrounds
   */
  variant?: 'auto' | 'light' | 'dark';
};

/**
 * Logo sources — updated to the final brand assets.
 *
 *   light variant → stockaisle_final_orange_transparent (orange wordmark, transparent bg)
 *                   used on white/light backgrounds (top-nav, login, print, etc.)
 *   dark variant  → stockaisle_final_white_transparent  (white wordmark, transparent bg)
 *                   used on the orange sidebar and dark backgrounds
 *
 * 512×512 PNGs used for full-wordmark contexts (sharp at any display density).
 * 256×256 PNGs used for badge/icon-only rail contexts.
 */
const LOGO_SOURCES = {
  light: {
    badge: require('../../assets/images/brand/stockaisle_final_orange_transparent_256x256.png'),
    full: require('../../assets/images/brand/stockaisle_final_orange_transparent_512x512.png'),
  },
  dark: {
    badge: require('../../assets/images/brand/stockaisle_final_white_transparent_256x256.png'),
    full: require('../../assets/images/brand/stockaisle_final_white_transparent_512x512.png'),
  },
} as const;

export function AppLogo({ size = 56, width, height, showWordmark = false, opacity = 1, containerStyle, variant = 'auto' }: AppLogoProps) {
  const colorScheme = useColorScheme();
  const autoMode = colorScheme === 'dark' ? 'dark' : 'light';
  const mode = variant === 'auto' ? autoMode : variant;
  const source = showWordmark ? LOGO_SOURCES[mode].full : LOGO_SOURCES[mode].badge;
  const resolvedWidth = width ?? size;
  const resolvedHeight = height ?? size;

  return (
    <View className="items-center justify-center" style={containerStyle}>
      <Image
        source={source}
        style={{ width: resolvedWidth, height: resolvedHeight, opacity }}
        contentFit="contain"
        accessibilityLabel="Stockaisle logo"
      />
    </View>
  );
}
