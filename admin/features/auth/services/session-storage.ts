const ACCESS_TOKEN_KEY = 'admin.access_token';
const REFRESH_TOKEN_KEY = 'admin.refresh_token';
const SELECTED_TENANT_KEY = 'admin.selected_tenant';

const memoryStore = new Map<string, string>();

function hasBrowserStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function getItem(key: string): string | null {
  if (hasBrowserStorage()) {
    return window.localStorage.getItem(key);
  }
  return memoryStore.get(key) ?? null;
}

function setItem(key: string, value: string) {
  if (hasBrowserStorage()) {
    window.localStorage.setItem(key, value);
    return;
  }
  memoryStore.set(key, value);
}

function removeItem(key: string) {
  if (hasBrowserStorage()) {
    window.localStorage.removeItem(key);
    return;
  }
  memoryStore.delete(key);
}

export const sessionStorage = {
  readSession: () => ({
    accessToken: getItem(ACCESS_TOKEN_KEY),
    refreshToken: getItem(REFRESH_TOKEN_KEY),
    selectedTenantId: getItem(SELECTED_TENANT_KEY),
  }),

  writeTokens: (accessToken: string, refreshToken: string) => {
    setItem(ACCESS_TOKEN_KEY, accessToken);
    setItem(REFRESH_TOKEN_KEY, refreshToken);
  },

  writeSelectedTenant: (tenantId: string | null) => {
    if (!tenantId) {
      removeItem(SELECTED_TENANT_KEY);
      return;
    }
    setItem(SELECTED_TENANT_KEY, tenantId);
  },

  clear: () => {
    removeItem(ACCESS_TOKEN_KEY);
    removeItem(REFRESH_TOKEN_KEY);
    removeItem(SELECTED_TENANT_KEY);
  },
};
