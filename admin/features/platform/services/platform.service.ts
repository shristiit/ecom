import { get, patch, post } from '@admin/lib/api';
import type { PlatformAdmin, PlatformAuditEvent, PlatformBusiness, PlatformBusinessDetail } from '../types/platform.types';

export const platformService = {
  listBusinesses: () => get<PlatformBusiness[]>('/platform/businesses'),
  getBusiness: (id: string) => get<PlatformBusinessDetail>(`/platform/businesses/${id}`),
  updateBusinessStatus: (id: string, lifecycleStatus: string) =>
    patch(`/platform/businesses/${id}/status`, { lifecycleStatus }),
  updateBusinessLimits: (id: string, input: { maxSkus?: number; monthlyAiTokens?: number }) =>
    patch(`/platform/businesses/${id}/limits`, input),
  updateBusinessEntitlements: (
    id: string,
    input: { features?: string[]; restrictions?: string[]; blockedFeatures?: string[]; writeBlocked?: boolean; reason?: string },
  ) => patch(`/platform/businesses/${id}/entitlements`, input),
  syncBusinessBilling: (
    id: string,
    input: {
      lifecycleStatus?: string;
      planCode?: string;
      providerCustomerId?: string;
      providerSubscriptionId?: string;
      providerMandateId?: string;
    },
  ) => post(`/platform/businesses/${id}/billing/sync`, input),
  listAdmins: () => get<PlatformAdmin[]>('/platform/admins'),
  listAudit: () => get<PlatformAuditEvent[]>('/platform/audit'),
};
