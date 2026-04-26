export type LoginInput = {
  email: string;
  password: string;
};

export type RegisterBusinessInput = {
  businessName: string;
  businessSlug?: string;
  adminName: string;
  email: string;
  password: string;
  planCode: 'starter' | 'growth' | 'pro';
};

export type RefreshInput = {
  refreshToken: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type RegisterBusinessResponse = AuthTokens & {
  tenantId: string;
  tenantSlug: string;
};
