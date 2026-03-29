export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type QueryParamValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryParamValue>;

export type ApiRequestOptions<TBody = unknown> = {
  method: HttpMethod;
  path: string;
  body?: TBody;
  headers?: Record<string, string>;
  auth?: boolean;
  query?: QueryParams;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export type ApiClientContext = {
  getAccessToken?: () => string | null | Promise<string | null>;
  getTenantId?: () => string | null | Promise<string | null>;
  onUnauthorized?: () => void;
};

export type ApiSuccessEnvelope<T> = {
  data: T;
};

export type ApiErrorEnvelope = {
  message?: string;
  code?: string;
  details?: unknown;
};
