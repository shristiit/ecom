const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
const TENANT_ID = (process.env.EXPO_PUBLIC_TENANT_ID ?? '').trim();

export type StorefrontCategory = {
  id: string;
  name: string;
  slug: string;
};

export type StorefrontProduct = {
  id: string;
  style_code: string;
  name: string;
  category: string;
  base_price: number | null;
  price_visible: boolean;
};

export type StorefrontAuthTokens = {
  accessToken: string;
  refreshToken: string;
};

function requireConfig() {
  if (!API_URL) {
    throw new Error('Missing EXPO_PUBLIC_API_URL in ecommerce/.env');
  }
  if (!TENANT_ID) {
    throw new Error('Missing EXPO_PUBLIC_TENANT_ID in ecommerce/.env');
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  requireConfig();
  const url = `${API_URL}${path}`;
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...init,
    headers,
  });
  if (!res.ok) {
    let message = `API request failed (${res.status}) for ${path}`;
    try {
      const data = (await res.json()) as { message?: string };
      if (data.message) {
        message = data.message;
      }
    } catch {
      // Ignore non-JSON responses and keep fallback message.
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export async function fetchStorefrontCategories() {
  const params = new URLSearchParams({ tenantId: TENANT_ID });
  return fetchJson<StorefrontCategory[]>(`/storefront/categories?${params.toString()}`);
}

export async function fetchStorefrontProducts() {
  const params = new URLSearchParams({ tenantId: TENANT_ID });
  return fetchJson<StorefrontProduct[]>(`/storefront/products?${params.toString()}`);
}

export async function loginStorefrontCustomer(email: string, password: string) {
  return fetchJson<StorefrontAuthTokens>('/storefront/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      tenantId: TENANT_ID,
      email,
      password,
    }),
  });
}
