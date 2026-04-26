export type PlatformBusiness = {
  id: string;
  name: string;
  slug: string;
  status: string;
  lifecycle_status: string;
  user_count: number;
  features: string[];
  max_skus: number;
  monthly_ai_tokens: number;
  sku_count: number;
  ai_tokens_used: number;
  write_blocked: boolean;
  blocked_features: string[];
  restrictions: string[];
  plan_code: string;
  billing_status: string;
};

export type PlatformBusinessDetail = PlatformBusiness & {
  restriction_reason?: string;
  billing_provider: string;
  trial_starts_at?: string | null;
  trial_ends_at?: string | null;
  billing_setup_status?: string;
  provider_customer_id?: string | null;
  provider_subscription_id?: string | null;
  provider_mandate_id?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  billing_metadata?: Record<string, unknown>;
  provider_payment_method_id?: string;
  account_name?: string;
  account_mask?: string;
  payment_status?: string;
  payment_metadata?: Record<string, unknown>;
};

export type PlatformAdmin = {
  id: string;
  email: string;
  full_name: string;
  status: string;
  last_login_at?: string | null;
  created_at: string;
};

export type PlatformAuditEvent = {
  id: string;
  tenant_id?: string | null;
  tenant_name?: string | null;
  tenant_slug?: string | null;
  actor_type: string;
  actor_id?: string | null;
  actor_email?: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};
