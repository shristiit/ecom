export type AuthStatus = 'bootstrapping' | 'signed_out' | 'mfa_required' | 'signed_in';
export type PrincipalType = 'tenant_user' | 'platform_admin';

export type SessionTenant = {
  id: string;
  name: string;
  slug?: string;
};

export type SessionUser = {
  principalType: PrincipalType;
  id: string;
  tenantId?: string;
  tenantSlug?: string;
  tenantStatus?: string;
  roleId?: string;
  email: string;
  permissions: string[];
  features?: string[];
  limits?: {
    maxSkus: number;
    monthlyAiTokens: number;
  };
  usage?: {
    skuCount: number;
    aiTokensUsed: number;
  };
  restrictions?: string[];
  billing?: {
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

export type SessionState = {
  status: AuthStatus;
  accessToken: string | null;
  refreshToken: string | null;
  user: SessionUser | null;
  tenants: SessionTenant[];
  selectedTenantId: string | null;
  pendingTokens: { accessToken: string; refreshToken: string } | null;
};
