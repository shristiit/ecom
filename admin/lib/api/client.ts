import { API_BASE_URL, API_TIMEOUT_MS } from './config';
import { ApiError } from './errors';
import type { ApiClientContext, ApiErrorEnvelope, ApiRequestOptions, QueryParams } from './types';

let apiContext: ApiClientContext = {};

export function configureApiClient(context: ApiClientContext) {
  apiContext = context;
}

function buildUrl(path: string, query?: QueryParams) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${API_BASE_URL}${normalizedPath}`);

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      url.searchParams.append(key, String(value));
    });
  }

  return url.toString();
}

async function getContextHeaders(auth: boolean) {
  const headers: Record<string, string> = {};

  if (!auth) {
    return headers;
  }

  const token = await apiContext.getAccessToken?.();
  const tenantId = await apiContext.getTenantId?.();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (tenantId) {
    headers['x-tenant-id'] = tenantId;
  }

  return headers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function parsePayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function request<TResponse, TBody = unknown>({
  method,
  path,
  body,
  headers,
  auth = true,
  query,
  idempotencyKey,
  signal,
}: ApiRequestOptions<TBody>): Promise<TResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  const mergedSignal = signal ?? controller.signal;
  const contextHeaders = await getContextHeaders(auth);

  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...contextHeaders,
    ...headers,
  };

  if (idempotencyKey) {
    requestHeaders['Idempotency-Key'] = idempotencyKey;
  }

  const hasBody = body !== undefined && body !== null;
  if (hasBody) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(buildUrl(path, query), {
      method,
      headers: requestHeaders,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: mergedSignal,
    });

    const payload = await parsePayload(response);

    if (!response.ok) {
      const envelope = (isRecord(payload) ? payload : {}) as ApiErrorEnvelope;
      throw new ApiError(
        envelope.message ?? response.statusText ?? 'Request failed',
        response.status,
        envelope.code,
        envelope.details,
      );
    }

    if (payload === undefined) {
      return undefined as TResponse;
    }

    return payload as TResponse;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Request timed out', 408, 'REQUEST_TIMEOUT');
    }

    throw new ApiError('Network request failed', 0, 'NETWORK_ERROR', error);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function get<TResponse>(path: string, options?: Omit<ApiRequestOptions<never>, 'method' | 'path' | 'body'>) {
  return request<TResponse>({ method: 'GET', path, ...options });
}

export function post<TResponse, TBody = unknown>(
  path: string,
  body?: TBody,
  options?: Omit<ApiRequestOptions<TBody>, 'method' | 'path' | 'body'>,
) {
  return request<TResponse, TBody>({ method: 'POST', path, body, ...options });
}

export function patch<TResponse, TBody = unknown>(
  path: string,
  body?: TBody,
  options?: Omit<ApiRequestOptions<TBody>, 'method' | 'path' | 'body'>,
) {
  return request<TResponse, TBody>({ method: 'PATCH', path, body, ...options });
}

export function put<TResponse, TBody = unknown>(
  path: string,
  body?: TBody,
  options?: Omit<ApiRequestOptions<TBody>, 'method' | 'path' | 'body'>,
) {
  return request<TResponse, TBody>({ method: 'PUT', path, body, ...options });
}

export function del<TResponse>(path: string, options?: Omit<ApiRequestOptions<never>, 'method' | 'path' | 'body'>) {
  return request<TResponse>({ method: 'DELETE', path, ...options });
}
