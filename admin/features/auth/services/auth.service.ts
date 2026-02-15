import { get, post } from '@/lib/api';
import type { AuthTokens, LoginInput, RefreshInput } from '../types/auth.types';

export type AuthMeResponse = {
  id: string;
  tenantId: string;
  roleId: string;
  email: string;
};

export const authService = {
  login: (input: LoginInput) => post<AuthTokens, LoginInput>('/auth/login', input, { auth: false }),

  refresh: (input: RefreshInput) => post<AuthTokens, RefreshInput>('/auth/refresh', input, { auth: false }),

  me: () => get<AuthMeResponse>('/auth/me'),

  // Backend endpoint not available yet. This keeps UX flow ready.
  requestPasswordReset: async (_email: string) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { ok: true };
  },
};
