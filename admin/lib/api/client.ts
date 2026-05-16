import { API_BASE_URL, API_TIMEOUT_MS } from './config';
import { ApiError } from './errors';
import type { ApiClientContext, ApiErrorEnvelope, ApiRequestOptions, QueryParams } from './types';

let apiContext: ApiClientContext = {};

export function configureApiClient(context: ApiClientContext) {
  apiContext = context;
}

function createIdempotencyKey() {
  const runtimeCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (runtimeCrypto?.randomUUID) {
    return runtimeCrypto.randomUUID();
  }

  const now = Date.now().toString(36);
  const randA = Math.random().toString(36).slice(2, 10);
  const randB = Math.random().toString(36).slice(2, 10);
  return `${now}-${randA}-${randB}`;
}

function createAbortContext(timeoutMs: number, signal?: AbortSignal) {
  const timeoutController = new AbortController();
  const requestController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  const abortFromTimeout = () => {
    requestController.abort();
  };
  const abortFromSignal = () => {
    requestController.abort();
  };

  timeoutController.signal.addEventListener('abort', abortFromTimeout, { once: true });

  if (signal) {
    if (signal.aborted) {
      abortFromSignal();
    } else {
      signal.addEventListener('abort', abortFromSignal, { once: true });
    }
  }

  return {
    signal: requestController.signal,
    didTimeout: () => timeoutController.signal.aborted,
    wasAbortedByCaller: () => Boolean(signal?.aborted) && !timeoutController.signal.aborted,
    cleanup: () => {
      clearTimeout(timeoutId);
      timeoutController.signal.removeEventListener('abort', abortFromTimeout);
      signal?.removeEventListener('abort', abortFromSignal);
    },
  };
}

function buildUrl(path: string, query?: QueryParams, baseUrl?: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${baseUrl ?? API_BASE_URL}${normalizedPath}`);

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

async function errorFromResponse(response: Response) {
  const payload = await parsePayload(response);
  const envelope = (isRecord(payload) ? payload : {}) as ApiErrorEnvelope;
  return new ApiError(
    envelope.message ?? response.statusText ?? 'Request failed',
    response.status,
    envelope.code,
    envelope.details,
  );
}

async function composeRequestHeaders(
  auth: boolean,
  headers?: Record<string, string>,
  idempotencyKey?: string,
  hasBody?: boolean,
  isFormDataBody?: boolean,
) {
  const contextHeaders = await getContextHeaders(auth);
  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...contextHeaders,
    ...headers,
  };

  if (idempotencyKey) {
    requestHeaders['Idempotency-Key'] = idempotencyKey;
  }

  if (hasBody && !isFormDataBody) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  return requestHeaders;
}

export async function request<TResponse, TBody = unknown>({
  method,
  path,
  baseUrl,
  body,
  headers,
  auth = true,
  query,
  idempotencyKey,
  signal,
}: ApiRequestOptions<TBody>): Promise<TResponse> {
  const abortContext = createAbortContext(API_TIMEOUT_MS, signal);
  const isWriteMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
  const resolvedIdempotencyKey = idempotencyKey ?? (isWriteMethod ? createIdempotencyKey() : undefined);
  const hasBody = body !== undefined && body !== null;
  const isFormDataBody = hasBody && typeof FormData !== 'undefined' && body instanceof FormData;

  async function buildRequestHeaders() {
    return composeRequestHeaders(auth, headers, resolvedIdempotencyKey, hasBody, isFormDataBody);
  }

  async function fetchWithHeaders() {
    const requestHeaders = await buildRequestHeaders();
    return fetch(buildUrl(path, query, baseUrl), {
      method,
      headers: requestHeaders,
      body: hasBody ? (isFormDataBody ? (body as BodyInit) : JSON.stringify(body)) : undefined,
      signal: abortContext.signal,
    });
  }

  async function handleResponse(response: Response) {
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
  }

  try {
    const response = await fetchWithHeaders();

    if (auth && response.status === 401) {
      const unauthorizedHandler = apiContext.onUnauthorized;
      const handled = unauthorizedHandler ? Boolean(await unauthorizedHandler()) : false;

      if (handled) {
        const retryResponse = await fetchWithHeaders();
        return await handleResponse(retryResponse);
      }
    }

    return await handleResponse(response);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      if (abortContext.wasAbortedByCaller()) {
        throw new ApiError('Request aborted', 499, 'REQUEST_ABORTED');
      }
      throw new ApiError('Request timed out', 408, 'REQUEST_TIMEOUT');
    }

    throw new ApiError('Network request failed', 0, 'NETWORK_ERROR', error);
  } finally {
    abortContext.cleanup();
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

export async function streamRequest<TEvent, TBody = unknown>({
  method,
  path,
  baseUrl,
  body,
  headers,
  auth = true,
  query,
  idempotencyKey,
  signal,
  onEvent,
}: ApiRequestOptions<TBody> & {
  onEvent: (event: TEvent) => void | Promise<void>;
}) {
  const abortContext = createAbortContext(API_TIMEOUT_MS * 4, signal);
  const hasBody = body !== undefined && body !== null;
  const isFormDataBody = hasBody && typeof FormData !== 'undefined' && body instanceof FormData;
  const resolvedIdempotencyKey = idempotencyKey ?? createIdempotencyKey();

  try {
    async function fetchStream() {
      const requestHeaders = await composeRequestHeaders(auth, headers, resolvedIdempotencyKey, hasBody, isFormDataBody);
      requestHeaders.Accept = 'application/x-ndjson';

      return fetch(buildUrl(path, query, baseUrl), {
        method,
        headers: requestHeaders,
        body: hasBody ? (isFormDataBody ? (body as BodyInit) : JSON.stringify(body)) : undefined,
        signal: abortContext.signal,
      });
    }

    let response = await fetchStream();

    if (auth && response.status === 401) {
      const unauthorizedHandler = apiContext.onUnauthorized;
      const handled = unauthorizedHandler ? Boolean(await unauthorizedHandler()) : false;

      if (handled) {
        response = await fetchStream();
      }
    }

    if (!response.ok) {
      throw await errorFromResponse(response);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ApiError('Streaming is not supported in this environment', 0, 'STREAM_UNAVAILABLE');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) break;
        const chunk = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!chunk) continue;
        await onEvent(JSON.parse(chunk) as TEvent);
      }
    }

    const tail = buffer.trim();
    if (tail) {
      await onEvent(JSON.parse(tail) as TEvent);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      if (abortContext.wasAbortedByCaller()) {
        throw new ApiError('Request aborted', 499, 'REQUEST_ABORTED');
      }
      throw new ApiError('Request timed out', 408, 'REQUEST_TIMEOUT');
    }
    throw new ApiError('Network request failed', 0, 'NETWORK_ERROR', error);
  } finally {
    abortContext.cleanup();
  }
}
