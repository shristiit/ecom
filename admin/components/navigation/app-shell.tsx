import { Link, usePathname } from 'expo-router';
import {
  Bot,
  Building2,
  Bell,
  Boxes,
  CreditCard,
  CircleHelp,
  LayoutGrid,
  Menu,
  Settings,
  Users,
  ShieldCheck,
  ArrowLeftRight,
  Package,
  LogOut,
  User,
} from 'lucide-react-native';
import { type LucideIcon } from 'lucide-react-native';
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

// Flat list derived from sections (for mobile tabs, permission filtering, etc.)
const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

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

const PLATFORM_NAV_ITEMS: NavItem[] = PLATFORM_NAV_SECTIONS.flatMap((s) => s.items);

const PAGE_TITLE_RULES = [
  { prefix: '/', title: 'Dashboard' },
  { prefix: '/dashboard', title: 'Dashboard' },
  { prefix: '/products', title: 'Products' },
  { prefix: '/inventory', title: 'Inventory' },
  { prefix: '/orders/sales', title: 'Sales Orders' },
  { prefix: '/orders/purchase', title: 'Purchase Orders' },
  { prefix: '/orders', title: 'Orders' },
  { prefix: '/billing', title: 'Billing & Payments' },
  { prefix: '/master', title: 'Master Data' },
  { prefix: '/users', title: 'Users & Access' },
  { prefix: '/roles', title: 'Users & Access' },
  { prefix: '/policies', title: 'Users & Access' },
  { prefix: '/audit', title: 'Audit' },
  { prefix: '/ai', title: 'My AI Assistant' },
  { prefix: '/settings', title: 'Settings' },
];

const PLATFORM_PAGE_TITLE_RULES = [
  { prefix: '/platform', title: 'Platform Overview' },
  { prefix: '/platform/businesses', title: 'Businesses' },
  { prefix: '/platform/admins', title: 'Platform Admins' },
  { prefix: '/platform/audit', title: 'Platform Audit' },
] as const;

function isActivePath(pathname: string, href: string, activePrefixes?: string[]) {
  if (href === '/') return pathname === '/' || pathname === '/dashboard';
  const prefixes = activePrefixes?.length ? activePrefixes : [href];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function getPageTitle(pathname: string) {
  const platformMatch = PLATFORM_PAGE_TITLE_RULES.find((rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`));
  if (platformMatch) return platformMatch.title;

  if (pathname === '/') return 'Dashboard';

  const match = PAGE_TITLE_RULES.find((rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`));
  return match?.title ?? 'Inventory Management';
}

const SIDEBAR_BG = '#FF5C00';
// Active: solid white card with orange text (matches brand mockup)
const SIDEBAR_ACTIVE_BG = '#FFFFFF';
const SIDEBAR_ACTIVE_TEXT = '#FF5C00';
const SIDEBAR_ACTIVE_ICON = '#FF5C00';
// Hover: subtle white tint
const SIDEBAR_HOVER_BG = 'rgba(255,255,255,0.12)';
// Rest: white text/icons at 75% opacity
const SIDEBAR_ICON_ACTIVE = '#FF5C00';
const SIDEBAR_ICON_INACTIVE = 'rgba(255,255,255,0.75)';
// Section label style
const SIDEBAR_SECTION_COLOR = 'rgba(255,255,255,0.5)';
// Divider
const SIDEBAR_DIVIDER = 'rgba(255,255,255,0.13)';
const SIDEBAR_LOGO_DIVIDER = 'rgba(255,255,255,0.35)';

/** Section label divider for the full sidebar */
function SidebarSectionLabel({ label }: { label: string }) {
  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 16, paddingBottom: 4 }}>
      <Text style={{ fontSize: 10, fontWeight: '500', letterSpacing: 1.2, textTransform: 'uppercase', color: SIDEBAR_SECTION_COLOR }}>
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
        style={{ backgroundColor: bg, borderRadius: 8, marginBottom: 2, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 }}
      >
        <Icon size={18} color={iconColor} />
        <Text style={{ fontSize: 14, fontWeight: active ? '500' : '400', color: textColor }}>{item.label}</Text>
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
        style={{ backgroundColor: active ? SIDEBAR_ACTIVE_BG : 'transparent', borderRadius: 8, marginBottom: 2, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 }}
      >
        <Icon size={18} color={active ? SIDEBAR_ACTIVE_ICON : SIDEBAR_ICON_INACTIVE} />
        <Text style={{ fontSize: 14, fontWeight: active ? '500' : '400', color: active ? SIDEBAR_ACTIVE_TEXT : 'rgba(255,255,255,0.75)' }}>{item.label}</Text>
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
  title,
  showMenuButton = false,
  showInlineSearch = true,
  isNarrow = false,
  onOpenMenu,
  onOpenNotifications,
  onOpenQuickView,
}: {
  title: string;
  showMenuButton?: boolean;
  showInlineSearch?: boolean;
  /** True when viewport width < 640px — hides secondary text actions */
  isNarrow?: boolean;
  onOpenMenu: () => void;
  onOpenNotifications: () => void;
  onOpenQuickView: () => void;
}) {
  const { user, signOut, tenants, selectedTenantId, selectTenant } = useAuthSession();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const tenantLabel = selectedTenantId ? `Tenant ${selectedTenantId.slice(0, 6)}` : 'Tenant';
  const userEmail = user?.email ?? 'Admin';

  const cycleTenant = () => {
    if (tenants.length <= 1) return;
    const index = Math.max(0, tenants.findIndex((tenant) => tenant.id === selectedTenantId));
    const next = tenants[(index + 1) % tenants.length];
    selectTenant(next.id);
  };

  return (
    <View className="relative z-50 border-b border-border bg-surface px-4 py-3">
      <View className="flex-row items-center justify-between gap-3">
        {/* Left: hamburger + title */}
        <View className="flex-row items-center gap-3 shrink-0">
          {showMenuButton ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open navigation menu"
              accessibilityHint="Opens the main navigation drawer."
              className="h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-2"
              onPress={onOpenMenu}
            >
              <Menu size={20} color="#334155" />
            </Pressable>
          ) : null}
          <Text className="text-section font-semibold text-text" numberOfLines={1}>{title}</Text>
        </View>

        {/* Centre: search bar (hidden on narrow) */}
        {showInlineSearch && !isNarrow ? <AssistantSearchBar /> : <View className="flex-1" />}

        {/* Right: action buttons */}
        <View className="flex-row items-center gap-2 shrink-0">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open notifications"
            accessibilityHint="Shows recent alerts and notifications."
            className="h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-2"
            onPress={onOpenNotifications}
          >
            <Bell size={16} color="#334155" />
          </Pressable>

          {/* "Quick view" text button — hidden on narrow screens to save space */}
          {!isNarrow ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open quick view"
              accessibilityHint="Shows the quick view panel."
              className="rounded-md border border-border bg-surface-2 px-3 py-2"
              onPress={onOpenQuickView}
            >
              <Text className="text-small font-medium text-text">Quick view</Text>
            </Pressable>
          ) : null}

          {/* Profile avatar + dropdown */}
          <View className="relative z-50">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open profile menu"
              accessibilityHint="Shows account, help, tenant, and logout actions."
              accessibilityState={{ expanded: profileMenuOpen }}
              onPress={() => setProfileMenuOpen((current) => !current)}
              className="h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-2"
            >
              <User size={16} color="#334155" />
            </Pressable>

            {profileMenuOpen ? (
              <View
                className="absolute right-0 top-11 z-50 rounded-md border border-border bg-surface shadow-sm"
                // Clamp dropdown width: 256px max, but never wider than viewport minus 16px margin
                style={{ width: 256, elevation: 24 }}
              >
                <View className="border-b border-border px-3 py-2">
                  <Text className="text-caption text-muted" numberOfLines={1}>{userEmail}</Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open quick view"
                  accessibilityHint="Shows the quick view panel."
                  className="flex-row items-center gap-2 px-3 py-2"
                  onPress={() => {
                    setProfileMenuOpen(false);
                    onOpenQuickView();
                  }}
                >
                  <Text className="text-small text-text">Quick view</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Help"
                  accessibilityHint="Closes the profile menu. Help content is not configured yet."
                  className="flex-row items-center gap-2 px-3 py-2"
                  onPress={() => setProfileMenuOpen(false)}
                >
                  <CircleHelp size={16} color="#334155" />
                  <Text className="text-small text-text">Help</Text>
                </Pressable>
                {user?.principalType === 'tenant_user' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Switch tenant"
                    accessibilityHint={`Changes the active tenant. Current tenant: ${tenantLabel}.`}
                    className="flex-row items-center justify-between gap-2 px-3 py-2"
                    onPress={() => {
                      cycleTenant();
                      setProfileMenuOpen(false);
                    }}
                  >
                    <Text className="text-small text-text">Switch tenant</Text>
                    <Text className="text-caption text-muted">{tenantLabel}</Text>
                  </Pressable>
                ) : null}

                <View className="border-t border-border">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Logout"
                    accessibilityHint="Signs you out of the admin app."
                    className="flex-row items-center gap-2 px-3 py-2"
                    onPress={() => {
                      setProfileMenuOpen(false);
                      signOut();
                    }}
                  >
                    <LogOut size={16} color="#334155" />
                    <Text className="text-small text-text">Logout</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
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

  const currentTitle = getPageTitle(pathname);
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
            {/* Logo */}
            <View style={{ paddingHorizontal: 10, paddingTop: 18, paddingBottom: 8 }}>
              <AppLogo showWordmark width={236} height={124} variant="dark" />
            </View>
            <View style={{ height: 1, backgroundColor: SIDEBAR_LOGO_DIVIDER, marginHorizontal: 12, marginBottom: 4 }} />

            {/* Nav sections */}
            <View style={{ flex: 1, paddingHorizontal: 8 }}>
              {navSections.map((section, sectionIndex) => (
                <View key={section.label ?? `section-${sectionIndex}`}>
                  {/* Divider before sections that follow another section */}
                  {sectionIndex > 0 ? (
                    <View style={{ height: 1, backgroundColor: SIDEBAR_DIVIDER, marginHorizontal: 4, marginTop: 4 }} />
                  ) : null}
                  {section.label ? <SidebarSectionLabel label={section.label} /> : null}
                  {section.items.map((item) => (
                    <SidebarItem key={item.href} item={item} pathname={pathname} />
                  ))}
                </View>
              ))}
            </View>

            {/* User profile strip */}
            <View style={{ borderTopWidth: 1, borderTopColor: SIDEBAR_DIVIDER, paddingHorizontal: 12, paddingVertical: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={16} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: '#FFFFFF' }} numberOfLines={1}>
                    {user?.email ?? 'Admin'}
                  </Text>
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }} numberOfLines={1}>
                    {user?.principalType === 'platform_admin' ? 'Platform Admin' : 'Store Manager'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ) : null}

        {/* Icon-only rail sidebar — tablet 768–1023px */}
        {isTablet ? (
          <View style={{ width: 56, backgroundColor: SIDEBAR_BG, alignItems: 'center', paddingVertical: 16, gap: 4 }}>
            <View style={{ marginBottom: 8 }}>
              <AppLogo size={40} variant="dark" />
            </View>
            <View style={{ height: 1, width: 32, backgroundColor: SIDEBAR_LOGO_DIVIDER, marginBottom: 4 }} />
            {navSections.map((section, sectionIndex) => (
              <View key={section.label ?? `section-${sectionIndex}`} style={{ width: '100%', alignItems: 'center' }}>
                {sectionIndex > 0 ? (
                  <View style={{ height: 1, width: 32, backgroundColor: SIDEBAR_DIVIDER, marginVertical: 4 }} />
                ) : null}
                {section.items.map((item) => (
                  <SidebarRailItem key={item.href} item={item} pathname={pathname} />
                ))}
              </View>
            ))}
          </View>
        ) : null}

        <View className="flex-1">
          <TopNav
            title={currentTitle}
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
        title="Menu"
        description="Navigate the admin portal"
        side="left"
        widthClassName="w-full max-w-[320px]"
        contentStyle={{ backgroundColor: SIDEBAR_BG }}
      >
        {/* Logo */}
        <View style={{ paddingHorizontal: 8, paddingTop: 8, paddingBottom: 8 }}>
          <AppLogo showWordmark width={236} height={124} variant="dark" />
        </View>
        <View style={{ height: 1, backgroundColor: SIDEBAR_LOGO_DIVIDER, marginHorizontal: 12, marginBottom: 4 }} />

        {/* Sectioned nav */}
        <View style={{ paddingHorizontal: 4 }}>
          {navSections.map((section, sectionIndex) => (
            <View key={section.label ?? `drawer-section-${sectionIndex}`}>
              {sectionIndex > 0 ? (
                <View style={{ height: 1, backgroundColor: SIDEBAR_DIVIDER, marginHorizontal: 8, marginTop: 4 }} />
              ) : null}
              {section.label ? <SidebarSectionLabel label={section.label} /> : null}
              {section.items.map((item) => (
                <DrawerSidebarItem key={item.href} item={item} pathname={pathname} onNavigate={() => setMobileMenuOpen(false)} />
              ))}
            </View>
          ))}
        </View>

        {/* User strip */}
        <View style={{ borderTopWidth: 1, borderTopColor: SIDEBAR_DIVIDER, marginTop: 16, paddingHorizontal: 12, paddingVertical: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
              <User size={16} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#FFFFFF' }} numberOfLines={1}>
                {user?.email ?? 'Admin'}
              </Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }} numberOfLines={1}>
                {user?.principalType === 'platform_admin' ? 'Platform Admin' : 'Store Manager'}
              </Text>
            </View>
          </View>
        </View>
      </AppDrawer>

      <GlobalCommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      <NotificationCenter isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
      <EntityQuickViewDrawer isOpen={quickViewOpen} onClose={() => setQuickViewOpen(false)} />
    </SafeAreaView>
  );
}
