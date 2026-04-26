import { Request, Response } from 'express';
import { z } from 'zod';
import { query } from '@backend/db/pool.js';
import {
  assertAiQuotaAvailable,
  buildTenantBillingSummary,
  consumeAiTokens,
  extractProviderTokenUsage,
  getTenantControlState,
  recordTenantAuditEvent,
  resolvePlanDefinition,
  type BillingSetupStatus,
} from '@backend/modules/platform/control-plane.js';

const subscriptionUpdateSchema = z.object({
  planCode: z.enum(['starter', 'growth', 'pro']).optional(),
  billingContactName: z.string().trim().max(120).optional(),
  billingContactEmail: z.string().trim().email().optional(),
});

const paymentMethodUpdateSchema = z.object({
  accountName: z.string().trim().max(120).optional(),
  accountMask: z.string().trim().max(32).optional(),
  status: z.enum(['not_started', 'pending', 'ready']).optional(),
});

const aiUsageCheckSchema = z.object({
  requestedTokens: z.number().int().positive(),
});

const aiUsageRecordSchema = z.object({
  entries: z.array(
    z.object({
      provider: z.string().optional(),
      model: z.string().optional(),
      rawPayload: z.record(z.any()).optional(),
      fallbackTokens: z.number().int().positive().optional(),
    }),
  ),
});

function requireTenantId(req: Request) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    throw new Error('Missing tenant context');
  }
  return tenantId;
}

async function getTenantBillingProfile(tenantId: string) {
  const state = await getTenantControlState(tenantId);
  const paymentResult = await query(
    `SELECT provider, provider_payment_method_id, account_name, account_mask, status, metadata
     FROM tenant_payment_methods
     WHERE tenant_id = $1`,
    [tenantId],
  );

  const paymentMethod = paymentResult.rows[0] ?? {
    provider: 'gocardless',
    provider_payment_method_id: null,
    account_name: '',
    account_mask: '',
    status: 'not_started',
    metadata: {},
  };
  const summary = buildTenantBillingSummary(state);
  const subscriptionMetadata = (state.subscription.metadata ?? {}) as Record<string, unknown>;

  return {
    ...summary,
    lifecycleStatus: state.lifecycleStatus,
    provider: state.subscription.provider,
    currentPeriodStart: state.subscription.currentPeriodStart,
    currentPeriodEnd: state.subscription.currentPeriodEnd,
    billingContact: {
      name: typeof subscriptionMetadata.billingContactName === 'string' ? subscriptionMetadata.billingContactName : '',
      email: typeof subscriptionMetadata.billingContactEmail === 'string' ? subscriptionMetadata.billingContactEmail : '',
    },
    paymentMethod: {
      provider: paymentMethod.provider ?? 'gocardless',
      providerPaymentMethodId: paymentMethod.provider_payment_method_id ?? null,
      accountName: paymentMethod.account_name ?? '',
      accountMask: paymentMethod.account_mask ?? '',
      status: (paymentMethod.status ?? 'not_started') as BillingSetupStatus,
      metadata: paymentMethod.metadata ?? {},
    },
  };
}

export async function getBillingSummary(req: Request, res: Response) {
  const tenantId = requireTenantId(req);
  res.json(await getTenantBillingProfile(tenantId));
}

export async function updateSubscription(req: Request, res: Response) {
  const tenantId = requireTenantId(req);
  const parsed = subscriptionUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  const current = await getTenantControlState(tenantId);
  const currentMetadata = (current.subscription.metadata ?? {}) as Record<string, unknown>;
  const plan = resolvePlanDefinition(parsed.data.planCode ?? current.subscription.planCode);

  const nextMetadata = {
    ...currentMetadata,
    ...(parsed.data.billingContactName !== undefined ? { billingContactName: parsed.data.billingContactName } : {}),
    ...(parsed.data.billingContactEmail !== undefined ? { billingContactEmail: parsed.data.billingContactEmail.toLowerCase() } : {}),
  };

  await query(
    `UPDATE tenant_subscriptions
     SET plan_code = $1,
         metadata = $2,
         updated_at = NOW()
     WHERE tenant_id = $3`,
    [plan.code, nextMetadata, tenantId],
  );

  await recordTenantAuditEvent({
    tenantId,
    actorType: 'tenant_user',
    actorId: req.user?.id ?? null,
    eventType: 'tenant.billing.subscription.updated',
    payload: {
      planCode: plan.code,
      billingContactName: parsed.data.billingContactName ?? currentMetadata.billingContactName ?? '',
      billingContactEmail: parsed.data.billingContactEmail?.toLowerCase() ?? currentMetadata.billingContactEmail ?? '',
    },
  });

  res.json(await getTenantBillingProfile(tenantId));
}

export async function updatePaymentMethod(req: Request, res: Response) {
  const tenantId = requireTenantId(req);
  const parsed = paymentMethodUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  await query(
    `UPDATE tenant_payment_methods
     SET account_name = COALESCE($1, account_name),
         account_mask = COALESCE($2, account_mask),
         status = COALESCE($3, status),
         updated_at = NOW()
     WHERE tenant_id = $4`,
    [parsed.data.accountName ?? null, parsed.data.accountMask ?? null, parsed.data.status ?? null, tenantId],
  );

  if (parsed.data.status) {
    await query(
      `UPDATE tenant_subscriptions
       SET billing_setup_status = $1,
           updated_at = NOW()
       WHERE tenant_id = $2`,
      [parsed.data.status, tenantId],
    );
  }

  await recordTenantAuditEvent({
    tenantId,
    actorType: 'tenant_user',
    actorId: req.user?.id ?? null,
    eventType: 'tenant.billing.payment_method.updated',
    payload: parsed.data,
  });

  res.json(await getTenantBillingProfile(tenantId));
}

export async function removePaymentMethod(req: Request, res: Response) {
  const tenantId = requireTenantId(req);

  await query(
    `UPDATE tenant_payment_methods
     SET provider_payment_method_id = NULL,
         account_name = '',
         account_mask = '',
         status = 'not_started',
         metadata = '{}',
         updated_at = NOW()
     WHERE tenant_id = $1`,
    [tenantId],
  );

  await query(
    `UPDATE tenant_subscriptions
     SET billing_setup_status = 'not_started',
         updated_at = NOW()
     WHERE tenant_id = $1`,
    [tenantId],
  );

  await recordTenantAuditEvent({
    tenantId,
    actorType: 'tenant_user',
    actorId: req.user?.id ?? null,
    eventType: 'tenant.billing.payment_method.removed',
    payload: {},
  });

  res.json(await getTenantBillingProfile(tenantId));
}

export async function checkAiUsageQuota(req: Request, res: Response) {
  const tenantId = requireTenantId(req);
  const parsed = aiUsageCheckSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  try {
    await assertAiQuotaAvailable(tenantId, parsed.data.requestedTokens);
    res.json({ ok: true });
  } catch (error: any) {
    await recordTenantAuditEvent({
      tenantId,
      actorType: 'tenant_user',
      actorId: req.user?.id ?? null,
      eventType: 'tenant.ai_limit.blocked',
      payload: {
        requestedTokens: parsed.data.requestedTokens,
        message: error?.message ?? 'AI token limit exceeded',
      },
    });
    res.status(403).json({
      message: error?.message ?? 'AI token limit exceeded',
      code: 'AI_TOKEN_LIMIT_EXCEEDED',
    });
  }
}

export async function recordAiUsage(req: Request, res: Response) {
  const tenantId = requireTenantId(req);
  const parsed = aiUsageRecordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  const normalizedEntries = parsed.data.entries
    .map((entry) => {
      const usage = entry.rawPayload ? extractProviderTokenUsage(entry.rawPayload) : null;
      const totalTokens = usage?.totalTokens ?? entry.fallbackTokens ?? 0;
      return {
        provider: entry.provider ?? 'unknown',
        model: entry.model ?? 'unknown',
        totalTokens,
      };
    })
    .filter((entry) => entry.totalTokens > 0);

  const totalTokens = normalizedEntries.reduce((sum, entry) => sum + entry.totalTokens, 0);
  if (totalTokens > 0) {
    await consumeAiTokens(tenantId, totalTokens);
    await recordTenantAuditEvent({
      tenantId,
      actorType: 'tenant_user',
      actorId: req.user?.id ?? null,
      eventType: 'tenant.ai_usage.recorded',
      payload: {
        totalTokens,
        entries: normalizedEntries,
      },
    });
  }

  res.json({
    ok: true,
    totalTokens,
    entries: normalizedEntries,
  });
}
