import { Link, usePathname } from 'expo-router';
import {
  Bot,
  Building2,
  Bell,
  BellRing,
  Boxes,
  CreditCard,
  CircleHelp,
  LayoutGrid,
  Menu,
  MoreVertical,
  ScanSearch,
  Settings,
  Users,
  ShieldCheck,
  ArrowLeftRight,
  Package,
  LogOut,
  UserCog,
} from 'lucide-react-native';
import { type LucideIcon } from 'lucide-react-native';
import { Image } from 'expo-image';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppLogo } from '@admin/components/branding';
import { AssistantSearchBar } from '@admin/components/navigation/assistant-search-bar';
import { AppCard, AppDrawer } from '@admin/components/ui';
import { useAuthSession } from '@admin/features/auth';
import { EntityQuickViewDrawer, GlobalCommandPalette, NotificationCenter } from '@admin/features/shared';

type NavItem = {
  href:
    | '/'
    | '/dashboard'
    | '/products'
    | '/inventory'
    | '/orders/sales'
    | '/orders/purchase'
    | '/billing'
    | '/master/locations'
    | '/users'
    | '/audit'
    | '/ai'
    | '/settings'
    | '/platform'
    | '/platform/businesses'
    | '/platform/admins'
    | '/platform/audit';
  label: string;
  icon: LucideIcon;
  activePrefixes?: string[];
  permissions?: string[];
};

type NavSection = {
  label?: string; // undefined = no section header (top group)
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: '/ai', label: 'My AI Assistant', icon: Bot, activePrefixes: ['/ai'], permissions: ['chat.use', 'chat.approve'] },
      { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { href: '/products', label: 'Products', icon: Boxes, permissions: ['products.read', 'products.write'] },
      { href: '/inventory', label: 'Inventory', icon: ArrowLeftRight, permissions: ['inventory.read', 'inventory.write'] },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { href: '/orders/sales', label: 'Sales Orders', icon: Package, activePrefixes: ['/orders/sales'], permissions: ['sales.write'] },
      { href: '/orders/purchase', label: 'Purchase Orders', icon: Package, activePrefixes: ['/orders/purchase'], permissions: ['purchasing.read'] },
      { href: '/billing', label: 'Billing & Payments', icon: CreditCard },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/master/locations', label: 'Master Data', icon: Building2, activePrefixes: ['/master'], permissions: ['master.read', 'master.write'] },
      { href: '/users', label: 'Users & Access', icon: Users, activePrefixes: ['/users', '/roles', '/policies'], permissions: ['admin.roles.read', 'admin.policies.read'] },
      { href: '/audit', label: 'Audit', icon: ShieldCheck, activePrefixes: ['/audit'], permissions: ['audit.read'] },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

const PLATFORM_NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: '/platform', label: 'Overview', icon: LayoutGrid, activePrefixes: ['/platform'] },
    ],
  },
  {
    label: 'Management',
    items: [
      { href: '/platform/businesses', label: 'Businesses', icon: Building2, activePrefixes: ['/platform/businesses'] },
      { href: '/platform/admins', label: 'Platform Admins', icon: Users, activePrefixes: ['/platform/admins'] },
      { href: '/platform/audit', label: 'Platform Audit', icon: ShieldCheck, activePrefixes: ['/platform/audit'] },
    ],
  },
];

function isActivePath(pathname: string, href: string, activePrefixes?: string[]) {
  if (href === '/') return pathname === '/' || pathname === '/dashboard';
  const prefixes = activePrefixes?.length ? activePrefixes : [href];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

const SIDEBAR_BG = '#FF5C00';
// Active: white overlay with white text (spec + reference design)
const SIDEBAR_ACTIVE_BG = 'rgba(255,255,255,0.20)';
const SIDEBAR_ACTIVE_TEXT = '#FFFFFF';
const SIDEBAR_ACTIVE_ICON = '#FFFFFF';
// Hover: lighter white tint
const SIDEBAR_HOVER_BG = 'rgba(255,255,255,0.11)';
// Rest: white text/icons at 72% opacity (matches reference)
const SIDEBAR_ICON_INACTIVE = 'rgba(255,255,255,0.72)';
// Section label
const SIDEBAR_SECTION_COLOR = 'rgba(255,255,255,0.40)';
// Divider (logo area only)
const SIDEBAR_DIVIDER = 'rgba(255,255,255,0.13)';

/** Section label for nav groups */
function SidebarSectionLabel({ label }: { label: string }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: 3 }}>
      <Text style={{ fontSize: 10, fontWeight: '500', letterSpacing: 1.4, textTransform: 'uppercase', color: SIDEBAR_SECTION_COLOR }}>
        {label}
      </Text>
    </View>
  );
}

// Full sidebar item (desktop ≥1024px) — icon + label
function SidebarItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActivePath(pathname, item.href, item.activePrefixes);
  const Icon = item.icon;
  const [hovered, setHovered] = useState(false);

  const bg = active ? SIDEBAR_ACTIVE_BG : hovered ? SIDEBAR_HOVER_BG : 'transparent';
  const iconColor = active ? SIDEBAR_ACTIVE_ICON : hovered ? '#FFFFFF' : SIDEBAR_ICON_INACTIVE;
  const textColor = active ? SIDEBAR_ACTIVE_TEXT : hovered ? '#FFFFFF' : 'rgba(255,255,255,0.75)';

  return (
    <Link href={item.href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={item.label}
        accessibilityHint={`Opens the ${item.label} page.`}
        accessibilityState={{ selected: active }}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={{ backgroundColor: bg, borderRadius: 7, marginBottom: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8 }}
      >
        <Icon size={16} color={iconColor} />
        <Text style={{ fontSize: 13, fontWeight: active ? '500' : '400', color: textColor }}>{item.label}</Text>
      </Pressable>
    </Link>
  );
}

// Icon-only sidebar item for tablet rail (768–1023px)
function SidebarRailItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActivePath(pathname, item.href, item.activePrefixes);
  const Icon = item.icon;
  const [hovered, setHovered] = useState(false);

  const bg = active ? SIDEBAR_ACTIVE_BG : hovered ? SIDEBAR_HOVER_BG : 'transparent';
  const iconColor = active ? SIDEBAR_ACTIVE_ICON : hovered ? '#FFFFFF' : SIDEBAR_ICON_INACTIVE;

  return (
    <Link href={item.href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={item.label}
        accessibilityHint={`Opens the ${item.label} page.`}
        accessibilityState={{ selected: active }}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={{ backgroundColor: bg, borderRadius: 8, marginBottom: 2, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon size={20} color={iconColor} />
      </Pressable>
    </Link>
  );
}

function DrawerSidebarItem({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate: () => void;
}) {
  const active = isActivePath(pathname, item.href, item.activePrefixes);
  const Icon = item.icon;

  return (
    <Link href={item.href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={item.label}
        accessibilityHint={`Opens the ${item.label} page.`}
        accessibilityState={{ selected: active }}
        onPress={onNavigate}
        style={{ backgroundColor: active ? SIDEBAR_ACTIVE_BG : 'transparent', borderRadius: 7, marginBottom: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8 }}
      >
        <Icon size={16} color={active ? SIDEBAR_ACTIVE_ICON : SIDEBAR_ICON_INACTIVE} />
        <Text style={{ fontSize: 13, fontWeight: active ? '500' : '400', color: active ? SIDEBAR_ACTIVE_TEXT : 'rgba(255,255,255,0.72)' }}>{item.label}</Text>
      </Pressable>
    </Link>
  );
}

function MobileTabItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActivePath(pathname, item.href, item.activePrefixes);
  const Icon = item.icon;

  return (
    <Link href={item.href} asChild>
      <Pressable
        accessibilityRole="tab"
        accessibilityLabel={item.label}
        accessibilityHint={`Opens the ${item.label} page.`}
        accessibilityState={{ selected: active }}
        className="flex-1 items-center gap-1 py-2"
      >
        <Icon size={18} color={active ? '#FF5C00' : '#64748B'} />
        <Text className={`text-caption ${active ? 'text-primary' : 'text-muted'}`}>{item.label}</Text>
      </Pressable>
    </Link>
  );
}

function TopNav({
  showMenuButton = false,
  showInlineSearch = true,
  isNarrow = false,
  onOpenMenu,
  onOpenNotifications,
  onOpenQuickView,
}: {
  showMenuButton?: boolean;
  showInlineSearch?: boolean;
  isNarrow?: boolean;
  onOpenMenu: () => void;
  onOpenNotifications: () => void;
  onOpenQuickView: () => void;
}) {
  const { user, signOut, tenants, selectedTenantId, selectTenant } = useAuthSession();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const tenantLabel = selectedTenantId ? `Tenant ${selectedTenantId.slice(0, 6)}` : 'Tenant';
  const userEmail = user?.email ?? 'Admin';
  const userInitials = userEmail.slice(0, 2).toUpperCase();

  const cycleTenant = () => {
    if (tenants.length <= 1) return;
    const index = Math.max(0, tenants.findIndex((tenant) => tenant.id === selectedTenantId));
    const next = tenants[(index + 1) % tenants.length];
    selectTenant(next.id);
  };

  return (
    <View style={{ backgroundColor: '#FFFFFF', borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.08)', height: 54, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 50 }}>
      {/* Left: hamburger on narrow web */}
      {showMenuButton ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open navigation menu"
            accessibilityHint="Opens the main navigation drawer."
            style={{ width: 32, height: 32, backgroundColor: '#f5f5f5', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
            onPress={onOpenMenu}
          >
            <Menu size={18} color="#666" />
          </Pressable>
        </View>
      ) : null}

      {/* Centre: search bar */}
      {showInlineSearch && !isNarrow ? (
        <View style={{ flex: 1, marginRight: 18 }}>
          <AssistantSearchBar />
        </View>
      ) : (
        <View style={{ flex: 1 }} />
      )}

      {/* Right: actions */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open notifications"
          accessibilityHint="Shows recent alerts and notifications."
          style={{ width: 32, height: 32, backgroundColor: '#f5f5f5', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
          onPress={onOpenNotifications}
        >
          <Bell size={16} color="#666" />
        </Pressable>

        {!isNarrow ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open quick view"
            accessibilityHint="Shows a quick overview of key metrics and recent activity."
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#FFF0EA',
              borderWidth: 0.5,
              borderColor: '#F4C4A8',
              borderRadius: 8,
              paddingHorizontal: 14,
              paddingVertical: 7,
            }}
            onPress={onOpenQuickView}
          >
            <ScanSearch size={14} color="#FF5C00" />
            <Text style={{ fontSize: 13, fontWeight: '500', color: '#FF5C00' }}>Quick view</Text>
          </Pressable>
        ) : null}

        {/* Profile avatar + dropdown */}
        <View style={{ position: 'relative', zIndex: 50 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile menu"
            accessibilityHint="Shows account, help, tenant, and logout actions."
            accessibilityState={{ expanded: profileMenuOpen }}
            onPress={() => setProfileMenuOpen((current) => !current)}
            style={{ width: 32, height: 32, backgroundColor: '#FF5C00', borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 11, fontWeight: '500', color: '#FFFFFF' }}>{userInitials}</Text>
          </Pressable>

            {profileMenuOpen ? (
              <View
                className="absolute right-0 top-11 z-50 bg-surface shadow-sm"
                style={{ width: 260, elevation: 24, borderRadius: 14, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.10)', overflow: 'hidden' }}
              >
                {/* Header: avatar + email */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderBottomWidth: 0.5,
                    borderBottomColor: 'rgba(0,0,0,0.07)',
                    backgroundColor: '#FDF4F0',
                  }}
                >
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#FF5C00', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#FFFFFF' }}>{userInitials}</Text>
                  </View>
                  <Text style={{ fontSize: 12.5, color: '#555555', flexShrink: 1 }} numberOfLines={1}>{userEmail}</Text>
                </View>

                {/* Account settings */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Account settings"
                  accessibilityHint="Manage your profile and account details."
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 }}
                  onPress={() => setProfileMenuOpen(false)}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#FFF0EA', alignItems: 'center', justifyContent: 'center' }}>
                    <UserCog size={14} color="#FF5C00" />
                  </View>
                  <Text style={{ fontSize: 13.5, color: '#1a1a1a' }}>Account settings</Text>
                </Pressable>

                {/* Notification preferences */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Notification preferences"
                  accessibilityHint="Control which alerts and notifications you receive."
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 }}
                  onPress={() => {
                    setProfileMenuOpen(false);
                    onOpenNotifications();
                  }}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#FFF0EA', alignItems: 'center', justifyContent: 'center' }}>
                    <BellRing size={14} color="#FF5C00" />
                  </View>
                  <Text style={{ fontSize: 13.5, color: '#1a1a1a' }}>Notification preferences</Text>
                </Pressable>

                {/* Help */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Help"
                  accessibilityHint="Get help and support."
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 }}
                  onPress={() => setProfileMenuOpen(false)}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' }}>
                    <CircleHelp size={14} color="#64748B" />
                  </View>
                  <Text style={{ fontSize: 13.5, color: '#1a1a1a' }}>Help</Text>
                </Pressable>

                {/* Logout */}
                <View style={{ borderTopWidth: 0.5, borderTopColor: 'rgba(0,0,0,0.07)', marginTop: 2 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Logout"
                    accessibilityHint="Signs you out of the admin app."
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 }}
                    onPress={() => {
                      setProfileMenuOpen(false);
                      signOut();
                    }}
                  >
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' }}>
                      <LogOut size={14} color="#DC2626" />
                    </View>
                    <Text style={{ fontSize: 13.5, color: '#DC2626' }}>Logout</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </View>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { hasAnyPermission, user } = useAuthSession();

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isPlatformUser = user?.principalType === 'platform_admin';
  const isWeb = Platform.OS === 'web';

  // Three layout tiers:
  //   Desktop  ≥1024px → full 256px labelled sidebar
  //   Tablet   768–1023px → narrow 56px icon-only rail
  //   Mobile   <768px → no sidebar (hamburger drawer or native bottom tabs)
  const isDesktop = isWeb && width >= 1024;
  const isTablet = isWeb && width >= 768 && width < 1024;
  const showWebBurgerMenu = isWeb && !isDesktop && !isTablet;
  const showNativeBottomTabs = !isWeb;

  // TopNav is "narrow" when the viewport is under 640px on web
  const isNarrowNav = isWeb && width < 640;

  const hideSearch = pathname === '/ai' || pathname.startsWith('/ai/');
  const showCompactSearchCard = !isDesktop && !isTablet && !hideSearch;
  const showInlineSearch = !hideSearch && !showCompactSearchCard;

  // Filtered sections for desktop/tablet sidebar and drawer
  const navSections = useMemo((): NavSection[] => {
    const sourceSections = isPlatformUser ? PLATFORM_NAV_SECTIONS : NAV_SECTIONS;
    return sourceSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (!item.permissions || item.permissions.length === 0) return true;
          return hasAnyPermission(item.permissions);
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [hasAnyPermission, isPlatformUser]);

  // Flat list of all visible nav items (for mobile tabs / misc uses)
  const navItems = useMemo(() => navSections.flatMap((s) => s.items), [navSections]);

  const mobileNavItems = useMemo(() => {
    const candidates = navItems.filter((item) =>
      ['/dashboard', '/products', '/inventory', '/orders/sales', '/orders/purchase', '/ai'].includes(item.href),
    );
    return candidates.length > 0 ? candidates : navItems.slice(0, 5);
  }, [navItems]);

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;
    const onKeyDown = (event: any) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-bgPrimary" edges={['top', 'left', 'right']}>
      <View className="flex-1 flex-row">
        {/* Full labelled sidebar — desktop ≥1024px */}
        {isDesktop ? (
          <View style={{ width: 256, backgroundColor: SIDEBAR_BG, flexDirection: 'column' }}>
            {/* Logo — white wordmark PNG, clipped to content area */}
            <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: SIDEBAR_DIVIDER }}>
              <View style={{ overflow: 'hidden', height: 32, width: 176 }}>
                <Image
                  source={require('../../assets/images/brand/stockaisle_final_white_transparent_256x256.png')}
                  style={{ width: 176, height: 118, marginTop: -39 }}
                  contentFit="fill"
                  accessibilityLabel="Stockaisle"
                />
              </View>
            </View>

            {/* Nav sections — no dividers between groups */}
            <View style={{ flex: 1, paddingHorizontal: 10, paddingTop: 10 }}>
              {navSections.map((section, sectionIndex) => (
                <View key={section.label ?? `section-${sectionIndex}`}>
                  {section.label ? <SidebarSectionLabel label={section.label} /> : null}
                  {section.items.map((item) => (
                    <SidebarItem key={item.href} item={item} pathname={pathname} />
                  ))}
                </View>
              ))}
            </View>

            {/* User profile strip */}
            <View style={{ borderTopWidth: 1, borderTopColor: SIDEBAR_DIVIDER, padding: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: '#FFFFFF' }}>
                    {(user?.email ?? 'AD').slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)' }} numberOfLines={1}>
                    {user?.email ?? 'Admin'}
                  </Text>
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }} numberOfLines={1}>
                    {user?.principalType === 'platform_admin' ? 'Platform Admin' : 'Store Manager'}
                  </Text>
                </View>
                <MoreVertical size={16} color="rgba(255,255,255,0.45)" />
              </View>
            </View>
          </View>
        ) : null}

        {/* Icon-only rail sidebar — tablet 768–1023px */}
        {isTablet ? (
          <View style={{ width: 56, backgroundColor: SIDEBAR_BG, alignItems: 'center', paddingVertical: 16, gap: 4 }}>
            <View style={{ width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <Boxes size={20} color="#FFFFFF" />
            </View>
            <View style={{ height: 1, width: 32, backgroundColor: SIDEBAR_DIVIDER, marginBottom: 4 }} />
            {navSections.map((section, sectionIndex) => (
              <View key={section.label ?? `section-${sectionIndex}`} style={{ width: '100%', alignItems: 'center' }}>
                {section.items.map((item) => (
                  <SidebarRailItem key={item.href} item={item} pathname={pathname} />
                ))}
              </View>
            ))}
          </View>
        ) : null}

        <View className="flex-1">
          <TopNav
            showMenuButton={showWebBurgerMenu}
            showInlineSearch={showInlineSearch}
            isNarrow={isNarrowNav}
            onOpenMenu={() => setMobileMenuOpen(true)}
            onOpenNotifications={() => setNotificationsOpen(true)}
            onOpenQuickView={() => setQuickViewOpen(true)}
          />

          {showCompactSearchCard ? (
            <View className="border-b border-border bg-bgPrimary px-4 py-3">
              <AppCard
                className="p-3"
                title="Ask My AI Assistant"
                subtitle="Search, dictate, or jump into an AI workflow."
              >
                <AssistantSearchBar />
              </AppCard>
            </View>
          ) : null}

          <View className="z-0 flex-1">{children}</View>

          {showNativeBottomTabs ? (
            <View className="border-t border-border bg-surface px-1 pb-2 pt-1">
              <View className="flex-row">
                {mobileNavItems.map((item) => (
                  <MobileTabItem key={item.href} item={item} pathname={pathname} />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </View>

      {/* Hamburger drawer — mobile web only (<768px) */}
      <AppDrawer
        isOpen={showWebBurgerMenu && mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        title="Navigation menu"
        side="left"
        widthClassName="w-full max-w-[320px]"
        contentStyle={{ backgroundColor: SIDEBAR_BG }}
        headerSlot={
          <View style={{ overflow: 'hidden', height: 32, width: 176 }}>
            <Image
              source={require('../../assets/images/brand/stockaisle_final_white_transparent_256x256.png')}
              style={{ width: 176, height: 118, marginTop: -39 }}
              contentFit="fill"
              accessibilityLabel="Stockaisle"
            />
          </View>
        }
      >
        {/* Sectioned nav */}
        <View style={{ paddingHorizontal: 10, paddingTop: 0 }}>
          {navSections.map((section, sectionIndex) => (
            <View key={section.label ?? `drawer-section-${sectionIndex}`}>
              {section.label ? <SidebarSectionLabel label={section.label} /> : null}
              {section.items.map((item) => (
                <DrawerSidebarItem key={item.href} item={item} pathname={pathname} onNavigate={() => setMobileMenuOpen(false)} />
              ))}
            </View>
          ))}
        </View>

        {/* User strip */}
        <View style={{ borderTopWidth: 1, borderTopColor: SIDEBAR_DIVIDER, marginTop: 8, padding: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '500', color: '#FFFFFF' }}>
                {(user?.email ?? 'AD').slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)' }} numberOfLines={1}>
                {user?.email ?? 'Admin'}
              </Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }} numberOfLines={1}>
                {user?.principalType === 'platform_admin' ? 'Platform Admin' : 'Store Manager'}
              </Text>
            </View>
            <MoreVertical size={16} color="rgba(255,255,255,0.45)" />
          </View>
        </View>
      </AppDrawer>

      <GlobalCommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      <NotificationCenter isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
      <EntityQuickViewDrawer isOpen={quickViewOpen} onClose={() => setQuickViewOpen(false)} />
    </SafeAreaView>
  );
}
