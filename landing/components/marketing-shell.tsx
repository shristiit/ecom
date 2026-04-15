import { useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Link, router, usePathname } from 'expo-router';
import Head from 'expo-router/head';
import { Image } from 'expo-image';

const wordmarkLight = require('../src/assets/brand/stockaisle-wordmark-light.png');
const wordmarkDark = require('../src/assets/brand/stockaisle-wordmark-dark.png');

export const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://stockaisle.com';
export const LOGIN_URL = process.env.EXPO_PUBLIC_LOGIN_URL ?? 'https://admin.stockaisle.com';
export const MS_FORMS_URL = process.env.EXPO_PUBLIC_MS_FORMS_URL ?? '';

const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
] as const;

const footerPrimaryLinks = [
  { label: 'Home', href: '/' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Book Demo', href: '/contact' },
] as const;

const footerSecondaryLinks = [
  { label: 'Careers', href: '/careers' },
  { label: 'Privacy Policy', href: '/privacy-policy' },
  { label: 'Cookie Policy', href: '/cookie-policy' },
] as const;

const footerPrimaryText = { color: 'rgba(255,255,255,0.9)' };
const footerMutedText = { color: 'rgba(255,255,255,0.72)' };
const footerSoftText = { color: 'rgba(255,255,255,0.58)' };

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

function HeaderLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link href={href as never} asChild>
      <Pressable className="rounded-full px-2 py-2">
        <Text className={`text-[15px] font-medium ${active ? 'text-primary' : 'text-muted'}`}>{label}</Text>
      </Pressable>
    </Link>
  );
}

function NavPill({
  label,
  emphasis = false,
  onPress,
}: {
  label: string;
  emphasis?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`min-h-11 items-center justify-center rounded-full border px-5 ${emphasis ? 'border-primary bg-primary' : 'border-border bg-surface'}`}
    >
      <Text className={`font-semibold ${emphasis ? 'text-on-primary' : 'text-primary'}`}>{label}</Text>
    </Pressable>
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
      <meta
        name="keywords"
        content="conversational inventory management software, inventory management software for wholesalers, wholesale inventory software UK, AI inventory management software, inventory software with audit trail, stock control software for SMEs, inventory software with approvals, inventory management through chat, conversational trade operations platform, stock control for wholesale businesses"
      />
      <link rel="canonical" href={canonical} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
    </Head>
  );
}

export function SiteHeader({ visible = true }: { visible?: boolean }) {
  const { width } = useWindowDimensions();
  const compact = width < 1080;

  return (
    <View
      style={{
        opacity: visible ? 1 : 0,
        transform: [{ translateY: visible ? 0 : -120 }],
        // @ts-expect-error web-only CSS transition
        transitionDuration: '220ms',
        // @ts-expect-error web-only CSS timing function
        transitionTimingFunction: 'ease',
      }}
      className="bg-transparent px-4 pb-4 pt-5"
    >
      <View className="mx-auto w-full max-w-[1180px] rounded-full border border-border bg-surface px-5 py-4 shadow-soft">
        <View className={`items-center justify-between gap-4 ${compact ? 'flex-col' : 'flex-row'}`}>
          <Link href="/" asChild>
            <Pressable accessibilityRole="link">
              <SiteLogo />
            </Pressable>
          </Link>

          <View className={`items-center gap-1 ${compact ? 'flex-row flex-wrap justify-center' : 'flex-row'}`}>
            {navLinks.map((item) => (
              <HeaderLink key={item.href} href={item.href} label={item.label} />
            ))}
            <HeaderLink href="/careers" label="Careers" />
          </View>

          <View className="flex-row items-center gap-3">
            <NavPill label="Sign In" onPress={() => Linking.openURL(LOGIN_URL)} />
            <NavPill label="Book a Demo" emphasis onPress={() => router.push('/contact' as never)} />
          </View>
        </View>
      </View>
    </View>
  );
}

export function SiteFooter() {
  return (
    <View
      className="mt-12 border-t border-border px-4 pb-12 pt-10"
      style={{
        // @ts-expect-error web-only CSS background
        backgroundImage:
          'radial-gradient(circle at top left, rgba(176, 138, 77, 0.18), transparent 26%), linear-gradient(180deg, #112137 0%, #0d1b2d 100%)',
      }}
    >
      <View className="mx-auto w-full max-w-[1180px] gap-8">
        <View className="flex-row flex-wrap justify-between gap-8">
          <View className="max-w-[280px] gap-3">
            <SiteLogo dark />
            <Text style={footerMutedText} className="text-sm">
              StockAisle for wholesalers, mixed trade operators, and inventory-heavy SME teams.
            </Text>
            <Text style={footerMutedText} className="text-sm">
              Newcastle upon Tyne, United Kingdom
            </Text>
            <Text style={footerMutedText} className="text-sm">
              support@stockaisle.com
            </Text>
          </View>

          <View className="min-w-[180px] gap-3">
            <Text style={footerPrimaryText} className="text-sm font-semibold uppercase tracking-[1.8px]">
              Explore
            </Text>
            {footerPrimaryLinks.map((item) => (
              <Link key={item.href} href={item.href as never} asChild>
                <Pressable>
                  <Text style={footerMutedText} className="text-sm">
                    {item.label}
                  </Text>
                </Pressable>
              </Link>
            ))}
          </View>

          <View className="min-w-[180px] gap-3">
            <Text style={footerPrimaryText} className="text-sm font-semibold uppercase tracking-[1.8px]">
              Company
            </Text>
            {footerSecondaryLinks.map((item) => (
              <Link key={item.href} href={item.href as never} asChild>
                <Pressable>
                  <Text style={footerMutedText} className="text-sm">
                    {item.label}
                  </Text>
                </Pressable>
              </Link>
            ))}
          </View>
        </View>

        <Text style={[footerSoftText, { borderTopColor: 'rgba(255,255,255,0.10)' }]} className="border-t pt-5 text-sm">
          © {new Date().getFullYear()} StockAisle. All rights reserved.
        </Text>
      </View>
    </View>
  );
}

export function PageScrollFrame({
  children,
  stickyHeader = true,
}: PropsWithChildren<{ stickyHeader?: boolean }>) {
  const [showHeader, setShowHeader] = useState(true);
  const lastOffsetY = useRef(0);

  return (
    <ScrollView
      className="flex-1"
      stickyHeaderIndices={stickyHeader ? [0] : undefined}
      contentContainerStyle={{ minHeight: '100%' as never }}
      scrollEventThrottle={16}
      onScroll={(event) => {
        const currentY = event.nativeEvent.contentOffset.y;

        if (currentY <= 8) {
          setShowHeader(true);
        } else if (currentY > lastOffsetY.current + 4) {
          setShowHeader(false);
        } else if (currentY < lastOffsetY.current - 4) {
          setShowHeader(true);
        }

        lastOffsetY.current = currentY;
      }}
    >
      <SiteHeader visible={showHeader} />
      {children}
      <SiteFooter />
    </ScrollView>
  );
}

export function SurfaceCard({ children, className = '', style }: PropsWithChildren<{ className?: string; style?: object }>) {
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
      className={`min-h-14 items-center justify-center rounded-full border px-6 ${variant === 'primary' ? 'border-primary bg-primary' : 'border-border bg-primary-tint'}`}
    >
      <Text className={`text-base font-semibold ${variant === 'primary' ? 'text-on-primary' : 'text-primary'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export function PageSection({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: object;
}) {
  return (
    <View style={style} className={`px-4 py-12 ${className}`}>
      <View className="mx-auto w-full max-w-[1180px]">{children}</View>
    </View>
  );
}
