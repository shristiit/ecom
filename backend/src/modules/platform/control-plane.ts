import type { PoolClient } from 'pg';
import { query } from '@backend/db/pool.js';

export const TENANT_FEATURES = [
  'access_admin',
  'products',
  'inventory',
  'master',
  'purchasing',
  'sales',
  'audit',
  'chat',
  'ai_governance',
  'reporting',
  'billing',
] as const;

export type TenantFeature = (typeof TENANT_FEATURES)[number];
export type TenantLifecycleStatus = 'trialing' | 'active' | 'past_due' | 'suspended' | 'cancelled';
export type BillingSetupStatus = 'not_started' | 'pending' | 'ready';
export type ProviderTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export const TRIAL_PERIOD_DAYS = 15;

export type TenantControlState = {
  tenantId: string;
  tenantSlug: string;
  tenantStatus: string;
  lifecycleStatus: TenantLifecycleStatus;
  features: string[];
  limits: {
    maxSkus: number;
    monthlyAiTokens: number;
  };
  usage: {
    skuCount: number;
    aiTokensUsed: number;
    aiTokensWindowStartedAt: string;
  };
  restrictions: {
    writeBlocked: boolean;
    blockedFeatures: string[];
    restrictions: string[];
    reason: string;
  };
  subscription: {
    provider: string;
    planCode: string;
    status: TenantLifecycleStatus;
    trialStartsAt: string | null;
    trialEndsAt: string | null;
    billingSetupStatus: BillingSetupStatus;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    providerMandateId: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    metadata: Record<string, unknown>;
  };
};

type DbExecutor = Pick<PoolClient, 'query'>;

export const DEFAULT_TENANT_FEATURES: string[] = [...TENANT_FEATURES];
export const DEFAULT_MAX_SKUS = 1000;
export const DEFAULT_MONTHLY_AI_TOKENS = 250000;

export const PLAN_CATALOG = {
  starter: {
    code: 'starter',
    name: 'Starter',
    monthlyPrice: 199,
    currency: 'GBP',
  },
  growth: {
    code: 'growth',
    name: 'Growth',
    monthlyPrice: 299,
    currency: 'GBP',
  },
  pro: {
    code: 'pro',
    name: 'Pro',
    monthlyPrice: 499,
    currency: 'GBP',
  },
} as const;

export type PlanCode = keyof typeof PLAN_CATALOG;

type EnsureTenantControlPlaneOptions = {
  client?: DbExecutor;
  planCode?: string;
  trialStartsAt?: Date;
};

function isPlanCode(value: string): value is PlanCode {
  return value in PLAN_CATALOG;
}

export function resolvePlanDefinition(planCode?: string) {
  if (planCode && isPlanCode(planCode)) {
    return PLAN_CATALOG[planCode];
  }
  return PLAN_CATALOG.starter;
}

function getExecutor(client?: DbExecutor) {
  return client ?? { query };
}

function startOfCurrentMonthIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function buildTrialWindow(startedAt = new Date()) {
  const trialStartsAt = new Date(startedAt);
  const trialEndsAt = new Date(trialStartsAt);
  trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + TRIAL_PERIOD_DAYS);
  return {
    trialStartsAt: trialStartsAt.toISOString(),
    trialEndsAt: trialEndsAt.toISOString(),
  };
}

export function buildTenantBillingSummary(state: TenantControlState) {
  const plan = resolvePlanDefinition(state.subscription.planCode);
  return {
    planCode: plan.code,
    planName: plan.name,
    monthlyPrice: plan.monthlyPrice,
    currency: plan.currency,
    monthlyPriceLabel: `£${plan.monthlyPrice}/month`,
    trialStartsAt: state.subscription.trialStartsAt,
    trialEndsAt: state.subscription.trialEndsAt,
    billingStatus: state.subscription.status,
    paymentSetupStatus: state.subscription.billingSetupStatus,
  };
}

export async function ensureTenantControlPlane(tenantId: string, options: EnsureTenantControlPlaneOptions = {}) {
  const db = getExecutor(options.client);
  const plan = resolvePlanDefinition(options.planCode);
  const trialWindow = buildTrialWindow(options.trialStartsAt);
  await db.query(
    `INSERT INTO tenant_subscriptions (
       tenant_id,
       provider,
       plan_code,
       status,
       trial_starts_at,
       trial_ends_at,
       billing_setup_status,
       metadata
     )
     VALUES ($1, 'gocardless', $2, 'trialing', $3, $4, 'not_started', $5)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [
      tenantId,
      plan.code,
      trialWindow.trialStartsAt,
      trialWindow.trialEndsAt,
      {
        trialStartsAt: trialWindow.trialStartsAt,
        trialEndsAt: trialWindow.trialEndsAt,
        billingSetupStatus: 'not_started',
      },
    ],
  );
  await db.query(
    `INSERT INTO tenant_payment_methods (tenant_id, provider, status)
     VALUES ($1, 'gocardless', 'not_started')
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId],
  );
  await db.query(
    `INSERT INTO tenant_entitlements (tenant_id, features, max_skus, monthly_ai_tokens)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId, DEFAULT_TENANT_FEATURES, DEFAULT_MAX_SKUS, DEFAULT_MONTHLY_AI_TOKENS],
  );
  await db.query(
    `INSERT INTO tenant_usage_counters (tenant_id, sku_count, ai_tokens_used, ai_tokens_window_started_at)
     VALUES ($1, 0, 0, $2)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId, startOfCurrentMonthIso()],
  );
  await db.query(
    `INSERT INTO tenant_restrictions (tenant_id, write_blocked, blocked_features, restrictions, reason)
     VALUES ($1, false, '{}', '{}', '')
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId],
  );
}

export async function getTenantControlState(tenantId: string): Promise<TenantControlState> {
  await ensureTenantControlPlane(tenantId);

  const result = await query(
    `SELECT
       t.id AS tenant_id,
       t.slug,
       t.status,
       t.lifecycle_status,
       ts.provider,
       ts.plan_code,
       ts.status AS subscription_status,
       ts.trial_starts_at,
       ts.trial_ends_at,
       ts.billing_setup_status,
       ts.provider_customer_id,
       ts.provider_subscription_id,
       ts.provider_mandate_id,
       ts.current_period_start,
       ts.current_period_end,
       ts.metadata AS subscription_metadata,
       te.features,
      te.max_skus,
      te.monthly_ai_tokens,
      tuc.sku_count,
       tuc.ai_tokens_used,
       tuc.ai_tokens_window_started_at,
       tr.write_blocked,
       tr.blocked_features,
       tr.restrictions,
       tr.reason
     FROM tenants t
     LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = t.id
     LEFT JOIN tenant_entitlements te ON te.tenant_id = t.id
     LEFT JOIN tenant_usage_counters tuc ON tuc.tenant_id = t.id
     LEFT JOIN tenant_restrictions tr ON tr.tenant_id = t.id
     WHERE t.id = $1`,
    [tenantId],
  );

  if (result.rowCount === 0) {
    throw new Error('Tenant not found');
  }

  const row = result.rows[0];
  return {
    tenantId: row.tenant_id,
    tenantSlug: row.slug,
    tenantStatus: row.status,
    lifecycleStatus: row.lifecycle_status,
    features: row.features ?? DEFAULT_TENANT_FEATURES,
    limits: {
      maxSkus: Number(row.max_skus ?? DEFAULT_MAX_SKUS),
      monthlyAiTokens: Number(row.monthly_ai_tokens ?? DEFAULT_MONTHLY_AI_TOKENS),
    },
    usage: {
      skuCount: Number(row.sku_count ?? 0),
      aiTokensUsed: Number(row.ai_tokens_used ?? 0),
      aiTokensWindowStartedAt: row.ai_tokens_window_started_at ?? startOfCurrentMonthIso(),
    },
    restrictions: {
      writeBlocked: Boolean(row.write_blocked),
      blockedFeatures: row.blocked_features ?? [],
      restrictions: row.restrictions ?? [],
      reason: row.reason ?? '',
    },
    subscription: {
      provider: row.provider ?? 'gocardless',
      planCode: row.plan_code ?? 'starter',
      status: row.subscription_status ?? row.lifecycle_status,
      trialStartsAt: row.trial_starts_at ?? null,
      trialEndsAt: row.trial_ends_at ?? null,
      billingSetupStatus: row.billing_setup_status ?? 'not_started',
      providerCustomerId: row.provider_customer_id ?? null,
      providerSubscriptionId: row.provider_subscription_id ?? null,
      providerMandateId: row.provider_mandate_id ?? null,
      currentPeriodStart: row.current_period_start ?? null,
      currentPeriodEnd: row.current_period_end ?? null,
      metadata: row.subscription_metadata ?? {},
    },
  };
}

export function featureEnabled(state: TenantControlState, feature: string) {
  return state.features.includes(feature) && !state.restrictions.blockedFeatures.includes(feature);
}

export function getReadAccessDenial(state: TenantControlState, feature?: string) {
  if (state.tenantStatus !== 'active') {
    return { code: 'TENANT_INACTIVE', message: 'Tenant is not active.' };
  }
  if (state.lifecycleStatus === 'cancelled') {
    return { code: 'TENANT_CANCELLED', message: 'Tenant access has been cancelled.' };
  }
  if (feature && !featureEnabled(state, feature)) {
    return { code: 'FEATURE_DISABLED', message: `Feature ${feature} is not enabled for this tenant.` };
  }
  return null;
}

export function getWriteAccessDenial(state: TenantControlState, feature?: string) {
  const readDenial = getReadAccessDenial(state, feature);
  if (readDenial) return readDenial;

  if (state.lifecycleStatus === 'past_due' || state.lifecycleStatus === 'suspended') {
    return { code: 'TENANT_WRITE_BLOCKED', message: `Writes are blocked while tenant status is ${state.lifecycleStatus}.` };
  }
  if (state.restrictions.writeBlocked) {
    return {
      code: 'TENANT_RESTRICTED',
      message: state.restrictions.reason || 'Writes are blocked for this tenant.',
    };
  }
  return null;
}

export async function recordTenantAuditEvent(input: {
  tenantId?: string | null;
  actorType: 'platform_admin' | 'tenant_user' | 'system';
  actorId?: string | null;
  eventType: string;
  payload?: Record<string, unknown>;
  client?: DbExecutor;
}) {
  const db = getExecutor(input.client);
  await db.query(
    `INSERT INTO tenant_audit_events (tenant_id, actor_type, actor_id, event_type, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.tenantId ?? null, input.actorType, input.actorId ?? null, input.eventType, input.payload ?? {}],
  );
}

export async function syncSkuUsageCounter(tenantId: string, client?: DbExecutor) {
  const db = getExecutor(client);
  await ensureTenantControlPlane(tenantId, { client });
  await db.query(
    `UPDATE tenant_usage_counters
     SET sku_count = (
       SELECT COUNT(*)::int FROM skus WHERE tenant_id = $1
     ),
         updated_at = NOW()
     WHERE tenant_id = $1`,
    [tenantId],
  );
}

export async function assertSkuQuotaAvailable(tenantId: string, increment: number) {
  const state = await getTenantControlState(tenantId);
  if (state.usage.skuCount + increment > state.limits.maxSkus) {
    throw new Error(`SKU limit exceeded for tenant. Limit ${state.limits.maxSkus}, current ${state.usage.skuCount}.`);
  }
}

function shouldResetAiWindow(windowStartedAt: string) {
  const start = new Date(windowStartedAt);
  const now = new Date();
  return start.getUTCFullYear() !== now.getUTCFullYear() || start.getUTCMonth() !== now.getUTCMonth();
}

export function estimateAiTokens(text: string) {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

function normalizeNumeric(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function normalizeUsageRecord(value: unknown): ProviderTokenUsage | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;

  const directTotal = normalizeNumeric(payload.total_tokens ?? payload.totalTokens);
  const directPrompt = normalizeNumeric(
    payload.prompt_tokens ??
      payload.input_tokens ??
      payload.promptTokenCount ??
      payload.inputTokenCount,
  );
  const directCompletion = normalizeNumeric(
    payload.completion_tokens ??
      payload.output_tokens ??
      payload.candidatesTokenCount ??
      payload.outputTokenCount,
  );

  if (directTotal > 0 || directPrompt > 0 || directCompletion > 0) {
    return {
      promptTokens: directPrompt,
      completionTokens: directCompletion,
      totalTokens: Math.max(directTotal, directPrompt + directCompletion),
    };
  }

  return null;
}

export function extractProviderTokenUsage(rawPayload: unknown): ProviderTokenUsage | null {
  const direct = normalizeUsageRecord(rawPayload);
  if (direct) return direct;

  if (!rawPayload || typeof rawPayload !== 'object') return null;
  const payload = rawPayload as Record<string, unknown>;

  const usage = normalizeUsageRecord(payload.usage);
  if (usage) return usage;

  const usageMetadata = normalizeUsageRecord(payload.usageMetadata);
  if (usageMetadata) return usageMetadata;

  return null;
}

export async function assertAiQuotaAvailable(tenantId: string, requestedTokens: number) {
  await ensureTenantControlPlane(tenantId);
  const state = await getTenantControlState(tenantId);
  const resetWindow = shouldResetAiWindow(state.usage.aiTokensWindowStartedAt);
  const currentUsage = resetWindow ? 0 : state.usage.aiTokensUsed;

  if (currentUsage + requestedTokens > state.limits.monthlyAiTokens) {
    throw new Error(
      `AI token limit exceeded for tenant. Limit ${state.limits.monthlyAiTokens}, current ${currentUsage}, requested ${requestedTokens}.`,
    );
  }
}

export async function consumeAiTokens(tenantId: string, requestedTokens: number) {
  await ensureTenantControlPlane(tenantId);
  const state = await getTenantControlState(tenantId);
  const resetWindow = shouldResetAiWindow(state.usage.aiTokensWindowStartedAt);
  const currentUsage = resetWindow ? 0 : state.usage.aiTokensUsed;
  await query(
    `UPDATE tenant_usage_counters
     SET ai_tokens_used = $2,
         ai_tokens_window_started_at = $3,
         updated_at = NOW()
     WHERE tenant_id = $1`,
    [tenantId, currentUsage + requestedTokens, resetWindow ? startOfCurrentMonthIso() : state.usage.aiTokensWindowStartedAt],
  );
}

export async function assertAndConsumeAiTokens(tenantId: string, requestedTokens: number) {
  await assertAiQuotaAvailable(tenantId, requestedTokens);
  await consumeAiTokens(tenantId, requestedTokens);
}
