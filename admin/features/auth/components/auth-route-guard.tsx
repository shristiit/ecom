import { usePathname, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useAuthSession } from '../hooks/use-auth-session';

const AUTH_PUBLIC_PATHS = new Set(['/login', '/forgot-password', '/reset-password', '/mfa', '/tenant-select', '/select-tenant']);

export function AuthRouteGuard() {
  const navigationState = useRootNavigationState();
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const { isReady, isAuthenticated, requiresMfa, selectedTenantId } = useAuthSession();

  useEffect(() => {
    if (!navigationState?.key || !isReady) {
      return;
    }

    const inAuthGroup = segments[0] === '(auth)';
    const isPublicAuthPath = AUTH_PUBLIC_PATHS.has(pathname);
    const isMfaPath = pathname === '/mfa';
    const isTenantPath = pathname === '/tenant-select' || pathname === '/select-tenant';

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

    if (!selectedTenantId) {
      if (!isTenantPath) {
        router.replace('/tenant-select');
      }
      return;
    }

    if (inAuthGroup || isPublicAuthPath) {
      router.replace('/');
    }
  }, [isAuthenticated, isReady, navigationState?.key, pathname, requiresMfa, router, segments, selectedTenantId]);

  return <View />;
}
