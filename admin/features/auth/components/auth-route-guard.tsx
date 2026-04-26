import { usePathname, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useAuthSession } from '../hooks/use-auth-session';

const AUTH_PUBLIC_PATHS = new Set(['/login', '/signup', '/forgot-password', '/reset-password', '/mfa', '/tenant-select', '/select-tenant']);

export function AuthRouteGuard() {
  const navigationState = useRootNavigationState();
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const { isReady, isAuthenticated, requiresMfa, portalMode, selectedTenantId, user } = useAuthSession();

  useEffect(() => {
    if (!navigationState?.key || !isReady) {
      return;
    }

    const inAuthGroup = segments[0] === '(auth)';
    const isPublicAuthPath = AUTH_PUBLIC_PATHS.has(pathname);
    const isMfaPath = pathname === '/mfa';
    const isTenantPath = pathname === '/tenant-select' || pathname === '/select-tenant';
    const isPlatformPath = pathname === '/platform' || pathname.startsWith('/platform/');

    if (!isAuthenticated && !requiresMfa) {
      if (!inAuthGroup && !isPublicAuthPath) {
        router.replace('/login');
      }
      return;
    }

    if (requiresMfa) {
      if (!isMfaPath) {
        router.replace('/mfa');
      }
      return;
    }

    if (portalMode === 'platform') {
      if (user?.principalType !== 'platform_admin') {
        router.replace('/forbidden');
        return;
      }
      if (!isPlatformPath) {
        router.replace('/platform');
      }
      return;
    }

    if (user?.principalType === 'platform_admin') {
      router.replace('/forbidden');
      return;
    }

    if (!selectedTenantId) {
      if (!isTenantPath) {
        router.replace('/tenant-select');
      }
      return;
    }

    if (inAuthGroup || isPublicAuthPath) {
      router.replace('/');
    }
  }, [isAuthenticated, isReady, navigationState?.key, pathname, portalMode, requiresMfa, router, segments, selectedTenantId, user?.principalType]);

  return <View />;
}
