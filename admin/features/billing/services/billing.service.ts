import { del, get, patch } from '@admin/lib/api';
import type { TenantBillingSummary } from '../types/billing.types';

export const billingService = {
  getSummary: () => get<TenantBillingSummary>('/billing'),
  updateSubscription: (input: { planCode?: string; billingContactName?: string; billingContactEmail?: string }) =>
    patch<TenantBillingSummary, typeof input>('/billing/subscription', input),
  updatePaymentMethod: (input: { accountName?: string; accountMask?: string; status?: string }) =>
    patch<TenantBillingSummary, typeof input>('/billing/payment-method', input),
  removePaymentMethod: () => del<TenantBillingSummary>('/billing/payment-method'),
};
