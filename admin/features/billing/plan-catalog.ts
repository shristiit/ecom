export const PLAN_CATALOG = {
  starter: {
    code: 'starter',
    name: 'Starter',
    monthlyPrice: 199,
    currency: 'GBP',
    monthlyPriceLabel: '£199/month',
    description: 'For early-stage businesses starting with StockAisle.',
  },
  growth: {
    code: 'growth',
    name: 'Growth',
    monthlyPrice: 299,
    currency: 'GBP',
    monthlyPriceLabel: '£299/month',
    description: 'For growing teams that need more operational throughput.',
  },
  pro: {
    code: 'pro',
    name: 'Pro',
    monthlyPrice: 499,
    currency: 'GBP',
    monthlyPriceLabel: '£499/month',
    description: 'For larger operations standardising teams and workflows in one place.',
  },
} as const;

export type PlanCode = keyof typeof PLAN_CATALOG;

export const PLAN_OPTIONS = Object.values(PLAN_CATALOG).map((plan) => ({
  label: `${plan.name} · ${plan.monthlyPriceLabel}`,
  value: plan.code,
  description: plan.description,
}));

export function resolvePlan(planCode?: string) {
  if (planCode && planCode in PLAN_CATALOG) {
    return PLAN_CATALOG[planCode as PlanCode];
  }
  return PLAN_CATALOG.starter;
}
