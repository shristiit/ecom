import { request, streamRequest } from '@admin/lib/api';
import type { QueryParams } from '@admin/lib/api';
import { ENGINE_BASE_URL } from './config';

export function engineGet<TResponse>(path: string, query?: QueryParams) {
  return request<TResponse>({
    method: 'GET',
    path,
    baseUrl: ENGINE_BASE_URL,
    query,
  });
}

export function enginePost<TResponse, TBody = unknown>(path: string, body?: TBody) {
  return request<TResponse, TBody>({
    method: 'POST',
    path,
    body,
    baseUrl: ENGINE_BASE_URL,
  });
}

export function engineUpload<TResponse>(path: string, formData: FormData) {
  return request<TResponse, FormData>({
    method: 'POST',
    path,
    body: formData,
    baseUrl: ENGINE_BASE_URL,
  });
}

export function engineStream<TEvent, TBody = unknown>(
  path: string,
  body: TBody,
  onEvent: (event: TEvent) => void | Promise<void>,
  options?: { signal?: AbortSignal },
) {
  return streamRequest<TEvent, TBody>({
    method: 'POST',
    path,
    body,
    baseUrl: ENGINE_BASE_URL,
    onEvent,
    signal: options?.signal,
  });
}
