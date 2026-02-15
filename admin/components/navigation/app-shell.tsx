import { Link, usePathname } from 'expo-router';
import {
  Bell,
  Boxes,
  LayoutGrid,
  Menu,
  Search,
  Settings,
  Users,
  ArrowLeftRight,
  Package,
  LogOut,
} from 'lucide-react-native';
import { type LucideIcon } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppLogo } from '@/components/branding';
import { useAuthSession } from '@/features/auth';

type NavItem = {
  href: '/' | '/products' | '/inventory' | '/orders' | '/users' | '/settings';
  label: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutGrid },
  { href: '/products', label: 'Products', icon: Boxes },
  { href: '/inventory', label: 'Inventory', icon: ArrowLeftRight },
  { href: '/orders', label: 'Orders', icon: Package },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/products': 'Products',
  '/inventory': 'Inventory',
  '/orders': 'Orders',
  '/users': 'Users',
  '/settings': 'Settings',
};

function isActivePath(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link href={item.href} asChild>
      <Pressable
        className={`mb-1 flex-row items-center gap-3 rounded-md px-3 py-2.5 ${active ? 'bg-primary-tint' : 'bg-transparent'}`}
      >
        <Icon size={18} color={active ? '#1F3A5F' : '#64748B'} />
        <Text className={`text-small font-medium ${active ? 'text-primary' : 'text-muted'}`}>{item.label}</Text>
      </Pressable>
    </Link>
  );
}

function MobileTabItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActivePath(pathname, item.href);
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

function TopNav({ title, compact }: { title: string; compact: boolean }) {
  const { user, signOut } = useAuthSession();

  return (
    <View className="border-b border-border bg-surface px-4 py-3">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-3">
          {compact ? <Menu size={20} color="#334155" /> : null}
          <Text className="text-section font-semibold text-text">{title}</Text>
        </View>

        <View className="max-w-[520px] flex-1">
          <View className="flex-row items-center rounded-md border border-border bg-surface-2 px-3 py-2">
            <Search size={16} color="#64748B" />
            <TextInput
              className="ml-2 flex-1 text-small text-text"
              placeholder="Search products, SKU, orders..."
              placeholderTextColor="#64748B"
            />
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <Pressable className="h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-2">
            <Bell size={16} color="#334155" />
          </Pressable>
          <View className="rounded-md border border-border bg-surface-2 px-3 py-2">
            <Text className="text-small font-medium text-text">{user?.email ?? 'Admin'}</Text>
          </View>
          <Pressable
            onPress={signOut}
            className="h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-2"
          >
            <LogOut size={16} color="#334155" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();

  const isDesktop = width >= 1024;
  const currentTitle = PAGE_TITLES[pathname] ?? 'Inventory Management';

  return (
    <SafeAreaView className="flex-1 bg-bgPrimary" edges={['top', 'left', 'right']}>
      <View className="flex-1 flex-row">
        {isDesktop ? (
          <View className="w-64 border-r border-border bg-surface px-3 py-4">
            <View className="mb-6 flex-row items-center gap-3 px-2">
              <AppLogo size={28} />
              
            </View>

            <View>
              {NAV_ITEMS.map((item) => (
                <SidebarItem key={item.href} item={item} pathname={pathname} />
              ))}
            </View>
          </View>
        ) : null}

        <View className="flex-1">
          <TopNav title={currentTitle} compact={!isDesktop} />

          <View className="flex-1">{children}</View>

          {!isDesktop ? (
            <View className="border-t border-border bg-surface px-1 pb-2 pt-1">
              <View className="flex-row">
                {NAV_ITEMS.map((item) => (
                  <MobileTabItem key={item.href} item={item} pathname={pathname} />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}
