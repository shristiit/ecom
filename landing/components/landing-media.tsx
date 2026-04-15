import { useState } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';

const lightPlaceholderStyle = {
  backgroundColor: 'rgba(242, 236, 226, 0.82)',
  borderColor: 'rgba(192, 201, 216, 0.82)',
};

const darkPlaceholderStyle = {
  backgroundColor: 'rgba(255, 255, 255, 0.08)',
  borderColor: 'rgba(255, 255, 255, 0.12)',
};

export function IconBadge({ label, dark = false }: { label: string; dark?: boolean }) {
  return null;
}

export function TextPill({ text, dark = false }: { text: string; dark?: boolean }) {
  return (
    <View
      style={dark ? darkPlaceholderStyle : undefined}
      className={`rounded-full border px-4 py-3 ${dark ? '' : 'border-border bg-surface'}`}
    >
      <Text className={`text-sm font-medium ${dark ? 'text-white' : 'text-text'}`}>{text}</Text>
    </View>
  );
}

export function TrustLogo({ label }: { label: string }) {
  return (
    <View className="min-w-[120px] flex-1 rounded-full border border-border bg-surface px-5 py-4">
      <Text className="text-center text-sm font-semibold text-muted">{label}</Text>
    </View>
  );
}

function PlaceholderBox({
  label,
  dark = false,
  fill = false,
}: {
  label: string;
  dark?: boolean;
  fill?: boolean;
}) {
  return (
    <View
      style={dark ? darkPlaceholderStyle : lightPlaceholderStyle}
      className={`${fill ? 'absolute inset-0' : 'h-full w-full'} items-center justify-center rounded-[28px] border`}
    >
      <Text className={`text-base font-semibold ${dark ? 'text-white' : 'text-muted'}`}>{label}</Text>
    </View>
  );
}

export function LandingVisual({
  source,
  label,
  alt,
  height = 360,
  dark = false,
  contentFit = 'cover',
  aspectRatio,
}: {
  source: any;
  label: string;
  alt: string;
  height?: number;
  dark?: boolean;
  contentFit?: 'cover' | 'contain';
  aspectRatio?: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <View
      style={[
        dark ? darkPlaceholderStyle : lightPlaceholderStyle,
        aspectRatio ? { aspectRatio } : { minHeight: height },
      ]}
      className="relative overflow-hidden rounded-[28px] border"
    >
      {!failed ? (
        <Image
          source={source}
          accessibilityLabel={alt}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          contentFit={contentFit}
          contentPosition="center"
          transition={180}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
      {!loaded || failed ? <PlaceholderBox label={label} dark={dark} /> : null}
    </View>
  );
}

export function LandingBackdrop({
  source,
  label,
  alt,
}: {
  source: any;
  label: string;
  alt: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return null;
  }

  return (
    <>
      <Image
        source={source}
        accessibilityLabel={alt}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        transition={180}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
      {!loaded ? <PlaceholderBox label={label} dark fill /> : null}
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(16, 35, 58, 0.58)',
        }}
      />
    </>
  );
}
