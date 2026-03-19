import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { SettingsSnapshot } from '../types/settings.types';

const SETTINGS_STORAGE_KEY = 'admin.settings.snapshot.v1';

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

async function readRaw(key: string): Promise<string | null> {
  if (hasBrowserStorage()) {
    return window.localStorage.getItem(key);
  }

  if (Platform.OS !== 'web') {
    return AsyncStorage.getItem(key);
  }

  return null;
}

async function writeRaw(key: string, value: string) {
  if (hasBrowserStorage()) {
    window.localStorage.setItem(key, value);
    return;
  }

  if (Platform.OS !== 'web') {
    await AsyncStorage.setItem(key, value);
  }
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
  async read(): Promise<SettingsSnapshot> {
    return parseSnapshot(await readRaw(SETTINGS_STORAGE_KEY));
  },
  async write(snapshot: SettingsSnapshot) {
    await writeRaw(SETTINGS_STORAGE_KEY, JSON.stringify(snapshot));
  },
};
