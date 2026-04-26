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
    | '/orders'
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

const NAV_ITEMS: NavItem[] = [
  { href: '/ai', label: 'My AI Assistant', icon: Bot, activePrefixes: ['/ai'], permissions: ['chat.use', 'chat.approve'] },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/products', label: 'Products', icon: Boxes, permissions: ['products.read', 'products.write'] },
  { href: '/inventory', label: 'Inventory', icon: ArrowLeftRight, permissions: ['inventory.read', 'inventory.write'] },
  { href: '/orders', label: 'Orders', icon: Package, permissions: ['sales.write', 'purchasing.write'] },
  { href: '/billing', label: 'Billing & Payments', icon: CreditCard },
  { href: '/master/locations', label: 'Master Data', icon: Building2, activePrefixes: ['/master'], permissions: ['master.read', 'master.write'] },
  { href: '/users', label: 'Users & Access', icon: Users, activePrefixes: ['/users', '/roles', '/policies'], permissions: ['admin.roles.read', 'admin.policies.read'] },
  { href: '/audit', label: 'Audit', icon: ShieldCheck, activePrefixes: ['/audit'], permissions: ['audit.read'] },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const PLATFORM_NAV_ITEMS: NavItem[] = [
  { href: '/platform', label: 'Overview', icon: LayoutGrid, activePrefixes: ['/platform'] },
  { href: '/platform/businesses', label: 'Businesses', icon: Building2, activePrefixes: ['/platform/businesses'] },
  { href: '/platform/admins', label: 'Platform Admins', icon: Users, activePrefixes: ['/platform/admins'] },
  { href: '/platform/audit', label: 'Platform Audit', icon: ShieldCheck, activePrefixes: ['/platform/audit'] },
];

const PAGE_TITLE_RULES = [
  { prefix: '/', title: 'Dashboard' },
  { prefix: '/dashboard', title: 'Dashboard' },
  { prefix: '/products', title: 'Products' },
  { prefix: '/inventory', title: 'Inventory' },
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

function SidebarItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActivePath(pathname, item.href, item.activePrefixes);
  const Icon = item.icon;

  return (
    <Link href={item.href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={item.label}
        accessibilityHint={`Opens the ${item.label} page.`}
        accessibilityState={{ selected: active }}
        className={`mb-1 flex-row items-center gap-3 rounded-md px-3 py-2.5 ${active ? 'bg-primary-tint' : 'bg-transparent'}`}
      >
        <Icon size={18} color={active ? '#1F3A5F' : '#64748B'} />
        <Text className={`text-small font-medium ${active ? 'text-primary' : 'text-muted'}`}>{item.label}</Text>
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
        className={`mb-1 flex-row items-center gap-3 rounded-md px-3 py-3 ${active ? 'bg-primary-tint' : 'bg-transparent'}`}
      >
        <Icon size={18} color={active ? '#1F3A5F' : '#64748B'} />
        <Text className={`text-small font-medium ${active ? 'text-primary' : 'text-muted'}`}>{item.label}</Text>
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
        <Icon size={18} color={active ? '#1F3A5F' : '#64748B'} />
        <Text className={`text-caption ${active ? 'text-primary' : 'text-muted'}`}>{item.label}</Text>
      </Pressable>
    </Link>
  );
}

function TopNav({
  title,
  showMenuButton = false,
  showInlineSearch = true,
  onOpenMenu,
  onOpenNotifications,
  onOpenQuickView,
}: {
  title: string;
  showMenuButton?: boolean;
  showInlineSearch?: boolean;
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
        <View className="flex-row items-center gap-3">
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
          <Text className="text-section font-semibold text-text">{title}</Text>
        </View>

        {showInlineSearch ? <AssistantSearchBar /> : <View className="flex-1" />}

        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open notifications"
            accessibilityHint="Shows recent alerts and notifications."
            className="h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-2"
            onPress={onOpenNotifications}
          >
            <Bell size={16} color="#334155" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open quick view"
            accessibilityHint="Shows the quick view panel."
            className="rounded-md border border-border bg-surface-2 px-3 py-2"
            onPress={onOpenQuickView}
          >
            <Text className="text-small font-medium text-text">Quick view</Text>
          </Pressable>
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
                className="absolute right-0 top-11 z-50 w-64 rounded-md border border-border bg-surface shadow-sm"
                style={{ elevation: 24 }}
              >
                <View className="border-b border-border px-3 py-2">
                  <Text className="text-caption text-muted">{userEmail}</Text>
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
  const isDesktop = isWeb && width >= 1024;
  const showWebBurgerMenu = isWeb && !isDesktop;
  const showNativeBottomTabs = !isWeb;
  const currentTitle = getPageTitle(pathname);
  const hideSearch = pathname === '/ai' || pathname.startsWith('/ai/');
  const showCompactSearchCard = !isDesktop && !hideSearch;
  const showInlineSearch = !hideSearch && !showCompactSearchCard;
  const navItems = useMemo(
    () =>
      (isPlatformUser ? PLATFORM_NAV_ITEMS : NAV_ITEMS).filter((item) => {
        if (!item.permissions || item.permissions.length === 0) return true;
        return hasAnyPermission(item.permissions);
      }),
    [hasAnyPermission, isPlatformUser],
  );

  const mobileNavItems = useMemo(() => {
    const candidates = navItems.filter((item) => ['/dashboard', '/products', '/inventory', '/orders', '/ai'].includes(item.href));
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
        {isDesktop ? (
          <View className="w-64 border-r border-border bg-surface px-3 py-4">
            <View className="mb-6 items-center px-2 py-2">
              <AppLogo showWordmark width={180} height={56} />
            </View>

            <View>
              {navItems.map((item) => (
                <SidebarItem key={item.href} item={item} pathname={pathname} />
              ))}
            </View>
          </View>
        ) : null}

        <View className="flex-1">
          <TopNav
            title={currentTitle}
            showMenuButton={showWebBurgerMenu}
            showInlineSearch={showInlineSearch}
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

      <AppDrawer
        isOpen={showWebBurgerMenu && mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        title="Menu"
        description="Navigate the admin portal"
        side="left"
        widthClassName="w-full max-w-[320px]"
      >
        <View className="mb-5 items-center px-2 py-2">
          <AppLogo showWordmark width={180} height={56} />
        </View>
        <View>
          {navItems.map((item) => (
            <DrawerSidebarItem key={item.href} item={item} pathname={pathname} onNavigate={() => setMobileMenuOpen(false)} />
          ))}
        </View>
      </AppDrawer>

      <GlobalCommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      <NotificationCenter isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
      <EntityQuickViewDrawer isOpen={quickViewOpen} onClose={() => setQuickViewOpen(false)} />
    </SafeAreaView>
  );
}
