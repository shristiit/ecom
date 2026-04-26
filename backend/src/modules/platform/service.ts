import { Request, Response } from 'express';
import { z } from 'zod';
import { query } from '@backend/db/pool.js';
import { ensureTenantControlPlane, recordTenantAuditEvent } from '@backend/modules/platform/control-plane.js';
import { signAccessToken, signRefreshToken } from '@backend/utils/jwt.js';

let bcryptModulePromise: Promise<typeof import('bcrypt')> | null = null;

async function getBcrypt() {
  if (!bcryptModulePromise) {
    bcryptModulePromise = import('bcrypt');
  }
  return bcryptModulePromise;
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const tenantStatusSchema = z.object({
  lifecycleStatus: z.enum(['trialing', 'active', 'past_due', 'suspended', 'cancelled']),
});

const entitlementSchema = z.object({
  features: z.array(z.string()).optional(),
  restrictions: z.array(z.string()).optional(),
  blockedFeatures: z.array(z.string()).optional(),
  writeBlocked: z.boolean().optional(),
  reason: z.string().optional(),
});

const limitSchema = z.object({
  maxSkus: z.number().int().positive().optional(),
  monthlyAiTokens: z.number().int().positive().optional(),
});

const billingSyncSchema = z.object({
  lifecycleStatus: z.enum(['trialing', 'active', 'past_due', 'suspended', 'cancelled']).optional(),
  providerCustomerId: z.string().optional().nullable(),
  providerSubscriptionId: z.string().optional().nullable(),
  providerMandateId: z.string().optional().nullable(),
  planCode: z.string().optional(),
  paymentMethod: z
    .object({
      providerPaymentMethodId: z.string().optional().nullable(),
      accountName: z.string().optional(),
      accountMask: z.string().optional(),
      status: z.string().optional(),
      metadata: z.record(z.any()).optional(),
    })
    .optional(),
  metadata: z.record(z.any()).optional(),
});

function platformActor(req: Request) {
  return {
    actorType: 'platform_admin' as const,
    actorId: req.user?.id ?? null,
  };
}

async function getBusinessDetail(tenantId: string) {
  await ensureTenantControlPlane(tenantId);
  const result = await query(
    `SELECT
       t.id,
       t.name,
       t.slug,
       t.status,
       t.lifecycle_status,
       COUNT(DISTINCT u.id)::int AS user_count,
       COALESCE(te.features, '{}') AS features,
       COALESCE(te.max_skus, 1000) AS max_skus,
       COALESCE(te.monthly_ai_tokens, 250000) AS monthly_ai_tokens,
       COALESCE(tuc.sku_count, 0) AS sku_count,
       COALESCE(tuc.ai_tokens_used, 0) AS ai_tokens_used,
       COALESCE(tr.write_blocked, false) AS write_blocked,
       COALESCE(tr.blocked_features, '{}') AS blocked_features,
       COALESCE(tr.restrictions, '{}') AS restrictions,
       COALESCE(tr.reason, '') AS restriction_reason,
       COALESCE(ts.provider, 'gocardless') AS billing_provider,
       COALESCE(ts.plan_code, 'starter') AS plan_code,
       COALESCE(ts.status, t.lifecycle_status) AS billing_status,
       ts.trial_starts_at,
       ts.trial_ends_at,
       COALESCE(ts.billing_setup_status, 'not_started') AS billing_setup_status,
       ts.provider_customer_id,
       ts.provider_subscription_id,
       ts.provider_mandate_id,
       ts.current_period_start,
       ts.current_period_end,
       COALESCE(ts.metadata, '{}') AS billing_metadata,
       COALESCE(pm.provider_payment_method_id, '') AS provider_payment_method_id,
       COALESCE(pm.account_name, '') AS account_name,
       COALESCE(pm.account_mask, '') AS account_mask,
       COALESCE(pm.status, 'not_started') AS payment_status,
       COALESCE(pm.metadata, '{}') AS payment_metadata
     FROM tenants t
     LEFT JOIN users u ON u.tenant_id = t.id
     LEFT JOIN tenant_entitlements te ON te.tenant_id = t.id
     LEFT JOIN tenant_usage_counters tuc ON tuc.tenant_id = t.id
     LEFT JOIN tenant_restrictions tr ON tr.tenant_id = t.id
     LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = t.id
     LEFT JOIN tenant_payment_methods pm ON pm.tenant_id = t.id
     WHERE t.id = $1
     GROUP BY t.id, te.features, te.max_skus, te.monthly_ai_tokens, tuc.sku_count, tuc.ai_tokens_used,
              tr.write_blocked, tr.blocked_features, tr.restrictions, tr.reason,
              ts.provider, ts.plan_code, ts.status, ts.trial_starts_at, ts.trial_ends_at, ts.billing_setup_status,
              ts.provider_customer_id, ts.provider_subscription_id,
              ts.provider_mandate_id, ts.current_period_start, ts.current_period_end, ts.metadata,
              pm.provider_payment_method_id, pm.account_name, pm.account_mask, pm.status, pm.metadata`,
    [tenantId],
  );

  return result.rows[0] ?? null;
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  const bcrypt = await getBcrypt();
  const result = await query(
    `SELECT id, email, password_hash FROM platform_admins WHERE email = $1 AND status = 'active'`,
    [parsed.data.email.toLowerCase()],
  );
  if (result.rowCount === 0) return res.status(401).json({ message: 'Invalid credentials' });

  const admin = result.rows[0];
  const ok = await bcrypt.compare(parsed.data.password, admin.password_hash);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

  await query(`UPDATE platform_admins SET last_login_at = NOW() WHERE id = $1`, [admin.id]);

  const accessToken = signAccessToken({ sub: admin.id, principalType: 'platform_admin' });
  const refreshToken = signRefreshToken({ sub: admin.id, principalType: 'platform_admin' });
  res.json({ accessToken, refreshToken });
}

export async function me(req: Request, res: Response) {
  res.json({
    principalType: 'platform_admin',
    id: req.user!.id,
    email: req.user!.email,
    permissions: ['*'],
  });
}

export async function listBusinesses(_req: Request, res: Response) {
  const result = await query(
    `SELECT
       t.id,
       t.name,
       t.slug,
       t.status,
       t.lifecycle_status,
       COUNT(DISTINCT u.id)::int AS user_count,
       COALESCE(te.features, '{}') AS features,
       COALESCE(te.max_skus, 1000) AS max_skus,
       COALESCE(te.monthly_ai_tokens, 250000) AS monthly_ai_tokens,
       COALESCE(tuc.sku_count, 0) AS sku_count,
       COALESCE(tuc.ai_tokens_used, 0) AS ai_tokens_used,
       COALESCE(tr.write_blocked, false) AS write_blocked,
       COALESCE(tr.blocked_features, '{}') AS blocked_features,
       COALESCE(tr.restrictions, '{}') AS restrictions,
       COALESCE(ts.plan_code, 'starter') AS plan_code,
       COALESCE(ts.status, t.lifecycle_status) AS billing_status
     FROM tenants t
     LEFT JOIN users u ON u.tenant_id = t.id
     LEFT JOIN tenant_entitlements te ON te.tenant_id = t.id
     LEFT JOIN tenant_usage_counters tuc ON tuc.tenant_id = t.id
     LEFT JOIN tenant_restrictions tr ON tr.tenant_id = t.id
     LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = t.id
     GROUP BY t.id, te.features, te.max_skus, te.monthly_ai_tokens, tuc.sku_count, tuc.ai_tokens_used,
              tr.write_blocked, tr.blocked_features, tr.restrictions, ts.plan_code, ts.status
     ORDER BY t.created_at DESC`,
  );
  res.json(result.rows);
}

export async function getBusiness(req: Request, res: Response) {
  const detail = await getBusinessDetail(req.params.id);
  if (!detail) return res.status(404).json({ message: 'Not found' });
  res.json(detail);
}

export async function updateBusinessStatus(req: Request, res: Response) {
  await ensureTenantControlPlane(req.params.id);
  const parsed = tenantStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  const result = await query(
    `UPDATE tenants
     SET lifecycle_status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, lifecycle_status`,
    [parsed.data.lifecycleStatus, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });

  await query(
    `UPDATE tenant_subscriptions
     SET status = $1, updated_at = NOW()
     WHERE tenant_id = $2`,
    [parsed.data.lifecycleStatus, req.params.id],
  );

  await recordTenantAuditEvent({
    tenantId: req.params.id,
    ...platformActor(req),
    eventType: 'tenant.lifecycle_status.updated',
    payload: { lifecycleStatus: parsed.data.lifecycleStatus },
  });

  res.json(result.rows[0]);
}

export async function updateBusinessEntitlements(req: Request, res: Response) {
  await ensureTenantControlPlane(req.params.id);
  const parsed = entitlementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  if (parsed.data.features) {
    await query(
      `UPDATE tenant_entitlements
       SET features = $1, updated_at = NOW()
       WHERE tenant_id = $2`,
      [parsed.data.features, req.params.id],
    );
  }

  if (
    parsed.data.restrictions ||
    parsed.data.blockedFeatures ||
    typeof parsed.data.writeBlocked === 'boolean' ||
    parsed.data.reason !== undefined
  ) {
    await query(
      `UPDATE tenant_restrictions
       SET restrictions = COALESCE($1, restrictions),
           blocked_features = COALESCE($2, blocked_features),
           write_blocked = COALESCE($3, write_blocked),
           reason = COALESCE($4, reason),
           updated_at = NOW()
       WHERE tenant_id = $5`,
      [
        parsed.data.restrictions ?? null,
        parsed.data.blockedFeatures ?? null,
        parsed.data.writeBlocked ?? null,
        parsed.data.reason ?? null,
        req.params.id,
      ],
    );
  }

  await recordTenantAuditEvent({
    tenantId: req.params.id,
    ...platformActor(req),
    eventType: 'tenant.entitlements.updated',
    payload: parsed.data,
  });

  const detail = await getBusinessDetail(req.params.id);
  res.json(detail);
}

export async function updateBusinessLimits(req: Request, res: Response) {
  await ensureTenantControlPlane(req.params.id);
  const parsed = limitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  const result = await query(
    `UPDATE tenant_entitlements
     SET max_skus = COALESCE($1, max_skus),
         monthly_ai_tokens = COALESCE($2, monthly_ai_tokens),
         updated_at = NOW()
     WHERE tenant_id = $3
     RETURNING tenant_id`,
    [parsed.data.maxSkus ?? null, parsed.data.monthlyAiTokens ?? null, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });

  await recordTenantAuditEvent({
    tenantId: req.params.id,
    ...platformActor(req),
    eventType: 'tenant.limits.updated',
    payload: parsed.data,
  });

  const detail = await getBusinessDetail(req.params.id);
  res.json(detail);
}

export async function getBusinessBilling(req: Request, res: Response) {
  await ensureTenantControlPlane(req.params.id);
  const detail = await getBusinessDetail(req.params.id);
  if (!detail) return res.status(404).json({ message: 'Not found' });
  res.json({
    tenantId: detail.id,
    tenantName: detail.name,
    lifecycleStatus: detail.lifecycle_status,
    provider: detail.billing_provider,
    planCode: detail.plan_code,
    billingStatus: detail.billing_status,
    trialStartsAt: detail.trial_starts_at,
    trialEndsAt: detail.trial_ends_at,
    billingSetupStatus: detail.billing_setup_status,
    providerCustomerId: detail.provider_customer_id,
    providerSubscriptionId: detail.provider_subscription_id,
    providerMandateId: detail.provider_mandate_id,
    currentPeriodStart: detail.current_period_start,
    currentPeriodEnd: detail.current_period_end,
    metadata: detail.billing_metadata,
    paymentMethod: {
      providerPaymentMethodId: detail.provider_payment_method_id,
      accountName: detail.account_name,
      accountMask: detail.account_mask,
      status: detail.payment_status,
      metadata: detail.payment_metadata,
    },
  });
}

export async function syncBusinessBilling(req: Request, res: Response) {
  await ensureTenantControlPlane(req.params.id);
  const parsed = billingSyncSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  await query(
    `UPDATE tenant_subscriptions
     SET status = COALESCE($1, status),
         provider_customer_id = COALESCE($2, provider_customer_id),
         provider_subscription_id = COALESCE($3, provider_subscription_id),
         provider_mandate_id = COALESCE($4, provider_mandate_id),
         plan_code = COALESCE($5, plan_code),
         billing_setup_status = CASE
           WHEN COALESCE($2, provider_customer_id) IS NOT NULL
             OR COALESCE($3, provider_subscription_id) IS NOT NULL
             OR COALESCE($4, provider_mandate_id) IS NOT NULL THEN 'pending'
           ELSE billing_setup_status
         END,
         metadata = COALESCE($6, metadata),
         updated_at = NOW()
     WHERE tenant_id = $7`,
    [
      parsed.data.lifecycleStatus ?? null,
      parsed.data.providerCustomerId ?? null,
      parsed.data.providerSubscriptionId ?? null,
      parsed.data.providerMandateId ?? null,
      parsed.data.planCode ?? null,
      parsed.data.metadata ?? null,
      req.params.id,
    ],
  );

  if (parsed.data.paymentMethod) {
    await query(
        `UPDATE tenant_payment_methods
       SET provider_payment_method_id = COALESCE($1, provider_payment_method_id),
           account_name = COALESCE($2, account_name),
           account_mask = COALESCE($3, account_mask),
           status = COALESCE($4, status),
           metadata = COALESCE($5, metadata),
           updated_at = NOW()
       WHERE tenant_id = $6`,
      [
        parsed.data.paymentMethod.providerPaymentMethodId ?? null,
        parsed.data.paymentMethod.accountName ?? null,
        parsed.data.paymentMethod.accountMask ?? null,
        parsed.data.paymentMethod.status ?? null,
        parsed.data.paymentMethod.metadata ?? null,
        req.params.id,
      ],
    );
  }

  if (parsed.data.lifecycleStatus) {
    await query(
      `UPDATE tenants SET lifecycle_status = $1, updated_at = NOW() WHERE id = $2`,
      [parsed.data.lifecycleStatus, req.params.id],
    );
  }

  await recordTenantAuditEvent({
    tenantId: req.params.id,
    ...platformActor(req),
    eventType: 'tenant.billing.synced',
    payload: parsed.data,
  });

  res.json(await getBusinessDetail(req.params.id));
}

export async function listAudit(_req: Request, res: Response) {
  const result = await query(
    `SELECT
       tae.id,
       tae.tenant_id,
       t.name AS tenant_name,
       t.slug AS tenant_slug,
       tae.actor_type,
       tae.actor_id,
       pa.email AS actor_email,
       tae.event_type,
       tae.payload,
       tae.created_at
     FROM tenant_audit_events tae
     LEFT JOIN tenants t ON t.id = tae.tenant_id
     LEFT JOIN platform_admins pa ON pa.id = tae.actor_id
     ORDER BY tae.created_at DESC
     LIMIT 500`,
  );
  res.json(result.rows);
}

export async function listPlatformAdmins(_req: Request, res: Response) {
  const result = await query(
    `SELECT id, email, full_name, status, last_login_at, created_at
     FROM platform_admins
     ORDER BY created_at ASC`,
  );
  res.json(result.rows);
}
