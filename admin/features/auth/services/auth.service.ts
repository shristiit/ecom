import { get, post } from '@admin/lib/api';
import type { AuthTokens, LoginInput, RefreshInput, RegisterBusinessInput, RegisterBusinessResponse } from '../types/auth.types';

export type BusinessMeResponse = {
  principalType: 'tenant_user';
  id: string;
  tenantId: string;
  tenantSlug: string;
  tenantStatus: string;
  roleId: string;
  email: string;
  permissions: string[];
  features: string[];
  limits: {
    maxSkus: number;
    monthlyAiTokens: number;
  };
  usage: {
    skuCount: number;
    aiTokensUsed: number;
  };
  restrictions: string[];
  billing: {
    planCode: string;
    planName: string;
    monthlyPrice: number;
    currency: string;
    monthlyPriceLabel: string;
    trialStartsAt: string | null;
    trialEndsAt: string | null;
    billingStatus: string;
    paymentSetupStatus: string;
  };
};

export type PlatformMeResponse = {
  principalType: 'platform_admin';
  id: string;
  email: string;
  permissions: string[];
};

export const authService = {
  login: (input: LoginInput) => post<AuthTokens, LoginInput>('/auth/login', input, { auth: false }),

  registerBusiness: (input: RegisterBusinessInput) =>
    post<RegisterBusinessResponse, RegisterBusinessInput>('/auth/register-business', input, { auth: false }),

  platformLogin: (input: LoginInput) => post<AuthTokens, LoginInput>('/platform/auth/login', input, { auth: false }),

  refresh: (input: RefreshInput) => post<AuthTokens, RefreshInput>('/auth/refresh', input, { auth: false }),

  me: () => get<BusinessMeResponse>('/auth/me'),

  platformMe: () => get<PlatformMeResponse>('/platform/me'),

  requestPasswordReset: (email: string) =>
    post<{ ok: boolean; message?: string }, { email: string }>('/auth/forgot-password', { email }, { auth: false }),

  resetPassword: (input: { email: string; token: string; newPassword: string }) =>
    post<{ ok: boolean }, { email: string; token: string; newPassword: string }>(
      '/auth/reset-password',
      input,
      { auth: false },
    ),
};
