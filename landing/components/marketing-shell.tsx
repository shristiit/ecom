import type { PropsWithChildren, ReactNode, RefObject } from 'react';
import { Linking, Pressable, ScrollView, Text, View, useWindowDimensions, type ViewStyle, type StyleProp } from 'react-native';
import { Link, router, usePathname } from 'expo-router';
import Head from 'expo-router/head';
import { Image } from 'expo-image';

const wordmarkLight = require('../src/assets/brand/stockaisle-wordmark-light.png');
const wordmarkDark = require('../src/assets/brand/stockaisle-wordmark-dark.png');

export const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://stockaisle.com';
export const LOGIN_URL = process.env.EXPO_PUBLIC_LOGIN_URL ?? 'https://admin.stockaisle.com';
export const MS_FORMS_URL = process.env.EXPO_PUBLIC_MS_FORMS_URL ?? '';

type SectionKey = 'top' | 'about' | 'features' | 'pricing' | 'contact';

const navItems: Array<
  | { label: string; type: 'section'; section: SectionKey }
  | { label: string; type: 'page'; href: '/faq' }
> = [
  { label: 'Home', type: 'section', section: 'top' },
  { label: 'About', type: 'section', section: 'about' },
  { label: 'Features', type: 'section', section: 'features' },
  { label: 'Pricing', type: 'section', section: 'pricing' },
  { label: 'FAQ', type: 'page', href: '/faq' },
  { label: 'Contact', type: 'section', section: 'contact' },
];

const footerPageLinks = [
  { label: 'FAQ', href: '/faq' },
  { label: 'Careers', href: '/careers' },
  { label: 'Privacy Policy', href: '/privacy-policy' },
  { label: 'Cookie Policy', href: '/cookie-policy' },
] as const;

const faintWhiteBorder = { borderColor: 'rgba(255,255,255,0.10)' };
const footerPrimaryText = { color: 'rgba(255,255,255,0.9)' };
const footerMutedText = { color: 'rgba(255,255,255,0.75)' };
const footerSoftText = { color: 'rgba(255,255,255,0.6)' };
const subtleWhiteText = { color: 'rgba(255,255,255,0.72)' };

function SiteLogo({ dark = false }: { dark?: boolean }) {
  return (
    <Image
      source={dark ? wordmarkDark : wordmarkLight}
      style={{ width: 176, height: 40 }}
      contentFit="contain"
      accessibilityLabel="StockAisle"
    />
  );
}

function NavPill({
  label,
  onPress,
  emphasis = false,
}: {
  label: string;
  onPress: () => void;
  emphasis?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`min-h-11 items-center justify-center rounded-full px-5 ${emphasis ? 'bg-primary' : 'bg-surface'} border border-border`}
    >
      <Text className={`font-semibold ${emphasis ? 'text-on-primary' : 'text-primary'}`}>{label}</Text>
    </Pressable>
  );
}

function SectionNavButton({
  label,
  section,
  onSectionPress,
}: {
  label: string;
  section: SectionKey;
  onSectionPress?: (section: SectionKey) => void;
}) {
  const pathname = usePathname();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        if (pathname === '/' && onSectionPress) {
          onSectionPress(section);
          return;
        }

        router.push({ pathname: '/', params: { section } } as never);
      }}
      className="rounded-full px-2 py-2"
    >
      <Text className="text-[15px] font-medium text-muted">{label}</Text>
    </Pressable>
  );
}

function CareersButton() {
  const pathname = usePathname();

  if (pathname === '/careers') {
    return <Text className="rounded-full px-2 py-2 text-[15px] font-medium text-primary">Careers</Text>;
  }

  return (
    <Link href="/careers" asChild>
      <Pressable className="rounded-full px-2 py-2">
        <Text className="text-[15px] font-medium text-muted">Careers</Text>
      </Pressable>
    </Link>
  );
}

export function PageHead({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  const canonical = `${SITE_URL}${path}`;

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content="index,follow" />
      <meta name="keywords" content="inventory management software for wholesalers, wholesale inventory software, SME inventory software" />
      <link rel="canonical" href={canonical} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
    </Head>
  );
}

export function SiteHeader({ onSectionPress }: { onSectionPress?: (section: SectionKey) => void }) {
  const { width } = useWindowDimensions();
  const compact = width < 1080;

  return (
    <View style={faintWhiteBorder} className="border-b bg-transparent px-4 pb-4 pt-5">
      <View className="mx-auto w-full max-w-[1180px] rounded-full border border-border bg-surface px-5 py-4 shadow-soft">
        <View className={`items-center justify-between gap-4 ${compact ? 'flex-col' : 'flex-row'}`}>
          <Link href="/" asChild>
            <Pressable accessibilityRole="link">
              <SiteLogo />
            </Pressable>
          </Link>

          <View className={`items-center gap-1 ${compact ? 'flex-row flex-wrap justify-center' : 'flex-row'}`}>
            {navItems.map((item) => (
              item.type === 'section' ? (
                <SectionNavButton
                  key={item.section}
                  label={item.label}
                  section={item.section}
                  onSectionPress={onSectionPress}
                />
              ) : (
                <Link key={item.href} href={item.href} asChild>
                  <Pressable className="rounded-full px-2 py-2">
                    <Text className="text-[15px] font-medium text-muted">{item.label}</Text>
                  </Pressable>
                </Link>
              )
            ))}
            <CareersButton />
          </View>

          <View className="flex-row items-center gap-3">
            <NavPill label="Sign In" onPress={() => Linking.openURL(LOGIN_URL)} />
            <NavPill
              label="Book a Demo"
              emphasis
              onPress={() => {
                if (onSectionPress) {
                  onSectionPress('contact');
                  return;
                }

                router.push({ pathname: '/', params: { section: 'contact' } } as never);
              }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

export function SiteFooter() {
  return (
    <View
      style={faintWhiteBorder}
      className="mt-12 border-t px-4 pb-12 pt-10"
      style={{
        // @ts-expect-error web-only CSS background
        backgroundImage:
          'radial-gradient(circle at top left, rgba(176, 138, 77, 0.16), transparent 24%), linear-gradient(180deg, #112137 0%, #0d1b2d 100%)',
      }}
    >
      <View className="mx-auto w-full max-w-[1180px] gap-8">
        <View className="flex-row flex-wrap justify-between gap-8">
          <View className="max-w-[280px] gap-3">
            <SiteLogo dark />
            <Text style={footerMutedText} className="text-sm">Stockailse ltd</Text>
            <Text style={footerMutedText} className="text-sm">Newcastle upon Tyne, United Kingdom</Text>
            <Text style={footerMutedText} className="text-sm">support@stockaisle.com</Text>
          </View>

          <View className="min-w-[180px] gap-3">
            <Text style={footerPrimaryText} className="text-sm font-semibold uppercase tracking-[1.8px]">Pages</Text>
            {footerPageLinks.map((item) => (
              <Link key={item.href} href={item.href} asChild>
                <Pressable>
                  <Text style={footerMutedText} className="text-sm">{item.label}</Text>
                </Pressable>
              </Link>
            ))}
          </View>

          <View className="min-w-[180px] gap-3">
            <Text style={footerPrimaryText} className="text-sm font-semibold uppercase tracking-[1.8px]">Social</Text>
            {['LinkedIn', 'X', 'Instagram', 'Facebook'].map((item) => (
              <Text key={item} style={footerSoftText} className="text-sm">
                {item}
              </Text>
            ))}
          </View>
        </View>

        <Text style={footerSoftText} className="border-t pt-5 text-sm">
          © {new Date().getFullYear()} StockAisle. All rights reserved.
        </Text>
      </View>
    </View>
  );
}

export function PageScrollFrame({
  children,
  onSectionPress,
  stickyHeader = true,
  scrollRef,
}: PropsWithChildren<{
  onSectionPress?: (section: SectionKey) => void;
  stickyHeader?: boolean;
  scrollRef?: RefObject<ScrollView | null>;
}>) {
  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1"
      stickyHeaderIndices={stickyHeader ? [0] : undefined}
      contentContainerStyle={{ minHeight: '100%' as never }}
    >
      <SiteHeader onSectionPress={onSectionPress} />
      {children}
      <SiteFooter />
    </ScrollView>
  );
}

export function SectionLabel({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <Text
      style={light ? subtleWhiteText : undefined}
      className={`text-[12px] font-bold uppercase tracking-[2.4px] ${light ? 'text-white' : 'text-success'}`}
    >
      {children}
    </Text>
  );
}

export function SurfaceCard({
  children,
  className = '',
  style,
}: PropsWithChildren<{ className?: string; style?: StyleProp<ViewStyle> }>) {
  return (
    <View style={style} className={`rounded-[28px] border border-border bg-surface p-8 shadow-soft ${className}`}>
      {children}
    </View>
  );
}

export function HeroButton({
  label,
  variant = 'primary',
  onPress,
}: {
  label: string;
  variant?: 'primary' | 'secondary';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`min-h-14 items-center justify-center rounded-full px-6 ${variant === 'primary' ? 'bg-primary' : 'bg-primary-tint'} border ${variant === 'primary' ? 'border-primary' : 'border-border'}`}
    >
      <Text className={`text-base font-semibold ${variant === 'primary' ? 'text-on-primary' : 'text-primary'}`}>
        {label}
      </Text>
    </Pressable>
  );
}
