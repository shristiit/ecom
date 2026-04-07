import { get, post } from '@admin/lib/api';
import type { AuthTokens, LoginInput, RefreshInput } from '../types/auth.types';

export type AuthMeResponse = {
  id: string;
  tenantId: string;
  roleId: string;
  email: string;
  permissions?: string[];
};

export const authService = {
  login: (input: LoginInput) => post<AuthTokens, LoginInput>('/auth/login', input, { auth: false }),

  refresh: (input: RefreshInput) => post<AuthTokens, RefreshInput>('/auth/refresh', input, { auth: false }),

  me: () => get<AuthMeResponse>('/auth/me'),

  requestPasswordReset: (email: string) =>
    post<{ ok: boolean; message?: string }, { email: string }>('/auth/forgot-password', { email }, { auth: false }),

  resetPassword: (input: { email: string; token: string; newPassword: string }) =>
    post<{ ok: boolean }, { email: string; token: string; newPassword: string }>(
      '/auth/reset-password',
      input,
      { auth: false },
    ),
};
