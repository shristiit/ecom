import type { SettingsSnapshot } from '../types/settings.types';

const SETTINGS_STORAGE_KEY = 'admin.settings.snapshot.v1';
const memoryStore = new Map<string, string>();

const defaultSnapshot: SettingsSnapshot = {
  profile: {
    tenantName: 'Demo Tenant',
    tenantSlug: 'demo',
    supportEmail: 'ops@demo.com',
  },
  integrations: [
    { key: 'erp', name: 'ERP Connector', status: 'not_connected', endpoint: '', updatedAt: new Date().toISOString() },
    { key: 'accounting', name: 'Accounting Sync', status: 'not_connected', endpoint: '', updatedAt: new Date().toISOString() },
    { key: 'sso', name: 'SSO Provider', status: 'connected', endpoint: '', updatedAt: new Date().toISOString() },
    { key: 'webhooks', name: 'Webhook Gateway', status: 'not_connected', endpoint: '', updatedAt: new Date().toISOString() },
  ],
  alerts: [
    { id: 'low-stock', name: 'Low stock', threshold: 10, severity: 'warning', enabled: true },
    { id: 'critical-stock', name: 'Critical stock', threshold: 3, severity: 'critical', enabled: true },
  ],
  workflows: [
    { id: 'wf-adjustment', action: 'Large adjustment', approver: 'Inventory manager', threshold: '> 50 units', enabled: true },
    { id: 'wf-transfer', action: 'Transfer override', approver: 'Warehouse lead', threshold: '> 20 units', enabled: true },
    { id: 'wf-ai', action: 'AI high-risk action', approver: 'AI supervisor', threshold: 'Risk >= 0.8', enabled: true },
  ],
  numbering: {
    salesOrderPattern: 'SO-{YYYY}-{####}',
    purchaseOrderPattern: 'PO-{YYYY}-{####}',
    invoicePattern: 'INV-{YYYY}-{####}',
  },
};

function hasBrowserStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readRaw(key: string): string | null {
  if (hasBrowserStorage()) {
    return window.localStorage.getItem(key);
  }
  return memoryStore.get(key) ?? null;
}

function writeRaw(key: string, value: string) {
  if (hasBrowserStorage()) {
    window.localStorage.setItem(key, value);
    return;
  }
  memoryStore.set(key, value);
}

function parseSnapshot(raw: string | null): SettingsSnapshot {
  if (!raw) return defaultSnapshot;
  try {
    const parsed = JSON.parse(raw) as Partial<SettingsSnapshot>;
    return {
      profile: {
        ...defaultSnapshot.profile,
        ...(parsed.profile ?? {}),
      },
      integrations: parsed.integrations ?? defaultSnapshot.integrations,
      alerts: parsed.alerts ?? defaultSnapshot.alerts,
      workflows: parsed.workflows ?? defaultSnapshot.workflows,
      numbering: {
        ...defaultSnapshot.numbering,
        ...(parsed.numbering ?? {}),
      },
    };
  } catch {
    return defaultSnapshot;
  }
}

export const settingsStorage = {
  read(): SettingsSnapshot {
    return parseSnapshot(readRaw(SETTINGS_STORAGE_KEY));
  },
  write(snapshot: SettingsSnapshot) {
    writeRaw(SETTINGS_STORAGE_KEY, JSON.stringify(snapshot));
  },
};
