import { Link, usePathname } from 'expo-router';
import {
  Bot,
  Building2,
  Bell,
  Boxes,
  CircleHelp,
  LayoutGrid,
  Menu,
  Search,
  Settings,
  Users,
  ShieldCheck,
  ArrowLeftRight,
  Package,
  LogOut,
  User,
  X,
} from 'lucide-react-native';
import { type LucideIcon } from 'lucide-react-native';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Modal as NativeModal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppLogo } from '@/components/branding';
import { useAuthSession } from '@/features/auth';
import { EntityQuickViewDrawer, GlobalCommandPalette, NotificationCenter } from '@/features/shared';

type NavItem = {
  href: '/' | '/dashboard' | '/products' | '/inventory' | '/orders' | '/master/locations' | '/users' | '/audit' | '/ai' | '/settings';
  label: string;
  icon: LucideIcon;
  activePrefixes?: string[];
  permissions?: string[];
};

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutGrid },
  { href: '/products', label: 'Products', icon: Boxes, permissions: ['products.read', 'products.write'] },
  { href: '/inventory', label: 'Inventory', icon: ArrowLeftRight, permissions: ['inventory.read', 'inventory.write'] },
  { href: '/orders', label: 'Orders', icon: Package, permissions: ['sales.write', 'purchasing.write'] },
  { href: '/master/locations', label: 'Master Data', icon: Building2, activePrefixes: ['/master'], permissions: ['master.read', 'master.write'] },
  { href: '/users', label: 'Users & Access', icon: Users, activePrefixes: ['/users', '/roles', '/policies'], permissions: ['admin.roles.read', 'admin.policies.read'] },
  { href: '/audit', label: 'Audit', icon: ShieldCheck, activePrefixes: ['/audit'], permissions: ['audit.read'] },
  { href: '/ai', label: 'AI Copilot', icon: Bot, activePrefixes: ['/ai'], permissions: ['chat.use', 'chat.approve'] },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const PAGE_TITLE_RULES = [
  { prefix: '/', title: 'Dashboard' },
  { prefix: '/dashboard', title: 'Dashboard' },
  { prefix: '/products', title: 'Products' },
  { prefix: '/inventory', title: 'Inventory' },
  { prefix: '/orders', title: 'Orders' },
  { prefix: '/master', title: 'Master Data' },
  { prefix: '/users', title: 'Users & Access' },
  { prefix: '/roles', title: 'Users & Access' },
  { prefix: '/policies', title: 'Users & Access' },
  { prefix: '/audit', title: 'Audit' },
  { prefix: '/ai', title: 'AI Copilot' },
  { prefix: '/settings', title: 'Settings' },
];

function isActivePath(pathname: string, href: string, activePrefixes?: string[]) {
  if (href === '/') return pathname === '/' || pathname === '/dashboard';
  const prefixes = activePrefixes?.length ? activePrefixes : [href];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function getPageTitle(pathname: string) {
  if (pathname === '/') return 'Dashboard';

  const match = PAGE_TITLE_RULES.find((rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`));
  return match?.title ?? 'Inventory Management';
}

function SidebarItem({ item, pathname, onPress }: { item: NavItem; pathname: string; onPress?: () => void }) {
  const active = isActivePath(pathname, item.href, item.activePrefixes);
  const Icon = item.icon;

  return (
    <Link href={item.href} asChild>
      <Pressable
        onPress={onPress}
        className={`mb-1 flex-row items-center gap-3 rounded-md px-3 py-2.5 ${active ? 'bg-primary-tint' : 'bg-transparent'}`}
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
      <Pressable className="flex-1 items-center gap-1 py-2">
        <Icon size={18} color={active ? '#1F3A5F' : '#64748B'} />
        <Text className={`text-caption ${active ? 'text-primary' : 'text-muted'}`}>{item.label}</Text>
      </Pressable>
    </Link>
  );
}

function MobileNavigationSheet({
  isOpen,
  onClose,
  pathname,
  navItems,
}: {
  isOpen: boolean;
  onClose: () => void;
  pathname: string;
  navItems: NavItem[];
}) {
  return (
    <NativeModal animationType="slide" transparent visible={isOpen} onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/35" onPress={onClose}>
        <Pressable className="h-full w-[88%] max-w-[360px] bg-surface shadow-lift" onPress={(event) => event.stopPropagation()}>
          <SafeAreaView className="flex-1" edges={['top', 'left', 'bottom']}>
            <View className="flex-row items-center justify-between border-b border-border px-4 py-4">
              <AppLogo size={30} />
              <Pressable className="rounded-md border border-border bg-surface-2 p-2" onPress={onClose}>
                <X size={18} color="#334155" />
              </Pressable>
            </View>

            <ScrollView className="flex-1 px-3 py-4">
              {navItems.map((item) => (
                <SidebarItem key={item.href} item={item} pathname={pathname} onPress={onClose} />
              ))}
            </ScrollView>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </NativeModal>
  );
}

function TopNav({
  title,
  compact,
  onOpenMenu,
  onOpenCommandPalette,
  onOpenNotifications,
  onOpenQuickView,
}: {
  title: string;
  compact: boolean;
  onOpenMenu: () => void;
  onOpenCommandPalette: () => void;
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

  const profileMenu = profileMenuOpen ? (
    <View
      className="absolute right-0 top-11 z-50 w-64 rounded-md border border-border bg-surface shadow-sm"
      style={{ elevation: 24 }}
    >
      <View className="border-b border-border px-3 py-2">
        <Text className="text-caption text-muted">{userEmail}</Text>
      </View>

      <Pressable
        className="flex-row items-center gap-2 px-3 py-2"
        onPress={() => {
          setProfileMenuOpen(false);
          onOpenQuickView();
        }}
      >
        <Text className="text-small text-text">Quick view</Text>
      </Pressable>
      <Pressable className="flex-row items-center gap-2 px-3 py-2" onPress={() => setProfileMenuOpen(false)}>
        <CircleHelp size={16} color="#334155" />
        <Text className="text-small text-text">Help</Text>
      </Pressable>
      <Pressable
        className="flex-row items-center justify-between gap-2 px-3 py-2"
        onPress={() => {
          cycleTenant();
          setProfileMenuOpen(false);
        }}
      >
        <Text className="text-small text-text">Switch tenant</Text>
        <Text className="text-caption text-muted">{tenantLabel}</Text>
      </Pressable>

      <View className="border-t border-border">
        <Pressable
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
  ) : null;

  if (compact) {
    return (
      <View className="relative z-50 border-b border-border bg-surface px-4 pb-3 pt-3">
        <View className="gap-2">
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1 flex-row items-center gap-3">
              <Pressable
                className="h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface-2"
                onPress={onOpenMenu}
              >
                <Menu size={18} color="#334155" />
              </Pressable>
              <View className="min-w-0 flex-1">
                <Text className="text-section font-semibold text-text" numberOfLines={1}>
                  {title}
                </Text>
              </View>
            </View>

            <View className="relative z-50">
              <Pressable
                onPress={() => setProfileMenuOpen((current) => !current)}
                className="h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface-2"
              >
                <User size={16} color="#334155" />
              </Pressable>
              {profileMenu}
            </View>
          </View>

          <Pressable onPress={onOpenCommandPalette}>
            <View className="min-h-10 flex-row items-center rounded-xl border border-border bg-surface-2 px-3 py-2">
              <Search size={15} color="#64748B" />
              <Text className="ml-2 flex-1 text-small text-muted" numberOfLines={1}>
                Search
              </Text>
            </View>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="relative z-50 border-b border-border bg-surface px-4 py-3">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-3">
          <Text className="text-section font-semibold text-text">{title}</Text>
        </View>

        <Pressable className="max-w-[520px] min-w-[280px] flex-1" onPress={onOpenCommandPalette}>
          <View className="flex-row items-center rounded-md border border-border bg-surface-2 px-3 py-2">
            <Search size={16} color="#64748B" />
            <Text className="ml-2 flex-1 text-small text-muted" numberOfLines={1}>
              Search products, SKU, orders... (Cmd/Ctrl + K)
            </Text>
          </View>
        </Pressable>

        <View className="flex-row items-center gap-2">
          <Pressable className="h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-2" onPress={onOpenNotifications}>
            <Bell size={16} color="#334155" />
          </Pressable>
          <Pressable className="rounded-md border border-border bg-surface-2 px-3 py-2" onPress={onOpenQuickView}>
            <Text className="text-small font-medium text-text">Quick view</Text>
          </Pressable>
          <View className="relative z-50">
            <Pressable
              onPress={() => setProfileMenuOpen((current) => !current)}
              className="h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-2"
            >
              <User size={16} color="#334155" />
            </Pressable>
            {profileMenu}
          </View>
        </View>
      </View>
    </View>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { hasAnyPermission } = useAuthSession();

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isDesktop = width >= 1024;
  const isCompact = width < 768;
  const currentTitle = getPageTitle(pathname);
  const navItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if (!item.permissions || item.permissions.length === 0) return true;
        return hasAnyPermission(item.permissions);
      }),
    [hasAnyPermission],
  );

  const mobileNavItems = useMemo(() => {
    const candidates = navItems.filter((item) => ['/', '/products', '/inventory', '/orders', '/ai'].includes(item.href));
    return candidates.length > 0 ? candidates : navItems.slice(0, 5);
  }, [navItems]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.addEventListener !== 'function' ||
      typeof window.removeEventListener !== 'function'
    ) {
      return;
    }
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
            <View className="mb-6 flex-row items-center gap-3 px-2">
              <AppLogo size={28} />
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
            compact={isCompact}
            onOpenMenu={() => setMobileMenuOpen(true)}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            onOpenNotifications={() => setNotificationsOpen(true)}
            onOpenQuickView={() => setQuickViewOpen(true)}
          />

          <View className="z-0 flex-1">{children}</View>

          {!isDesktop ? (
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

      <GlobalCommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      <NotificationCenter isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
      <EntityQuickViewDrawer isOpen={quickViewOpen} onClose={() => setQuickViewOpen(false)} />
      <MobileNavigationSheet
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        pathname={pathname}
        navItems={navItems}
      />
    </SafeAreaView>
  );
}
