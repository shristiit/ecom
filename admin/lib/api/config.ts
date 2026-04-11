function resolveApiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured;

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;

    if (hostname === 'admin.stockaisle.com') {
      return 'https://api.stockaisle.com/api';
    }

    if (hostname === 'stockaisle.com' || hostname.endsWith('.stockaisle.com')) {
      const parts = hostname.split('.');
      const rootDomain = parts.slice(-2).join('.');
      return `${protocol}//api.${rootDomain}/api`;
    }
  }

  return 'http://localhost:4000/api';
}

export const API_BASE_URL = resolveApiBaseUrl();
export const API_TIMEOUT_MS = 15_000;
