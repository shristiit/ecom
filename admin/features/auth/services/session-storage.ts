import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const LEGACY_ACCESS_TOKEN_KEY = 'admin.access_token';
const LEGACY_REFRESH_TOKEN_KEY = 'admin.refresh_token';
const LEGACY_SELECTED_TENANT_KEY = 'admin.selected_tenant';
const PLATFORM_HOSTNAME = process.env.EXPO_PUBLIC_PLATFORM_HOSTNAME ?? 'master.stockaisle.com';
const AUTH_NOTICE_KEY = 'stockaisle.auth.notice';

function hasBrowserStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function resolvePortalStoragePrefix() {
  if (process.env.EXPO_PUBLIC_PORTAL_MODE === 'platform') {
    return 'platform';
  }

  if (process.env.EXPO_PUBLIC_PORTAL_MODE === 'business') {
    return 'business';
  }

  if (typeof window !== 'undefined') {
    return window.location.hostname === PLATFORM_HOSTNAME ? 'platform' : 'business';
  }

  return 'business';
}

function scopedKey(name: 'access_token' | 'refresh_token' | 'selected_tenant') {
  return `stockaisle.${resolvePortalStoragePrefix()}.${name}`;
}

function getItem(key: string): string | null {
  if (hasBrowserStorage()) {
    return window.localStorage.getItem(key);
  }

  if (Platform.OS !== 'web') {
    return SecureStore.getItem(key);
  }

  return null;
}

function setItem(key: string, value: string) {
  if (hasBrowserStorage()) {
    window.localStorage.setItem(key, value);
    return;
  }

  if (Platform.OS !== 'web') {
    SecureStore.setItem(key, value);
  }
}

function removeItem(key: string) {
  if (hasBrowserStorage()) {
    window.localStorage.removeItem(key);
    return;
  }

  if (Platform.OS !== 'web') {
    SecureStore.deleteItemAsync(key).catch(() => undefined);
  }
}

export const sessionStorage = {
  readSession: () => {
    const accessToken = getItem(scopedKey('access_token')) ?? getItem(LEGACY_ACCESS_TOKEN_KEY);
    const refreshToken = getItem(scopedKey('refresh_token')) ?? getItem(LEGACY_REFRESH_TOKEN_KEY);
    const selectedTenantId = getItem(scopedKey('selected_tenant')) ?? getItem(LEGACY_SELECTED_TENANT_KEY);

    return {
      accessToken,
      refreshToken,
      selectedTenantId,
    };
  },

  writeTokens: (accessToken: string, refreshToken: string) => {
    setItem(scopedKey('access_token'), accessToken);
    setItem(scopedKey('refresh_token'), refreshToken);
    removeItem(LEGACY_ACCESS_TOKEN_KEY);
    removeItem(LEGACY_REFRESH_TOKEN_KEY);
  },

  writeSelectedTenant: (tenantId: string | null) => {
    if (!tenantId) {
      removeItem(scopedKey('selected_tenant'));
      removeItem(LEGACY_SELECTED_TENANT_KEY);
      return;
    }
    setItem(scopedKey('selected_tenant'), tenantId);
    removeItem(LEGACY_SELECTED_TENANT_KEY);
  },

  readAuthNotice: () => getItem(AUTH_NOTICE_KEY),

  writeAuthNotice: (message: string) => {
    setItem(AUTH_NOTICE_KEY, message);
  },

  clearAuthNotice: () => {
    removeItem(AUTH_NOTICE_KEY);
  },

  clear: () => {
    removeItem(scopedKey('access_token'));
    removeItem(scopedKey('refresh_token'));
    removeItem(scopedKey('selected_tenant'));
    removeItem(LEGACY_ACCESS_TOKEN_KEY);
    removeItem(LEGACY_REFRESH_TOKEN_KEY);
    removeItem(LEGACY_SELECTED_TENANT_KEY);
    removeItem(AUTH_NOTICE_KEY);
  },
};
