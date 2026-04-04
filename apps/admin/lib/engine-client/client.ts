import { request } from '@/lib/api';
import { ENGINE_BASE_URL } from './config';

export function engineGet<TResponse>(path: string) {
  return request<TResponse>({
    method: 'GET',
    path,
    baseUrl: ENGINE_BASE_URL,
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
