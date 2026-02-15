export type AuthStatus = 'bootstrapping' | 'signed_out' | 'mfa_required' | 'signed_in';

export type SessionTenant = {
  id: string;
  name: string;
  slug?: string;
};

export type SessionUser = {
  id: string;
  tenantId: string;
  roleId: string;
  email: string;
  permissions: string[];
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
