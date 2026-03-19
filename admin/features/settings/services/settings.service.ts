import type {
  SettingsAlertRule,
  SettingsIntegration,
  SettingsNumbering,
  SettingsProfile,
  SettingsSnapshot,
  SettingsWorkflowRule,
} from '../types/settings.types';
import { settingsStorage } from './settings-storage';

async function nextSnapshot(updater: (snapshot: SettingsSnapshot) => SettingsSnapshot) {
  const current = await settingsStorage.read();
  const next = updater(current);
  await settingsStorage.write(next);
  return next;
}

export const settingsService = {
  async getProfile() {
    return (await settingsStorage.read()).profile;
  },

  async saveProfile(profile: SettingsProfile) {
    return (await nextSnapshot((snapshot) => ({ ...snapshot, profile }))).profile;
  },

  async listIntegrations() {
    return (await settingsStorage.read()).integrations;
  },

  async updateIntegration(key: SettingsIntegration['key'], patch: Partial<SettingsIntegration>) {
    const snapshot = await nextSnapshot((state) => ({
      ...state,
      integrations: state.integrations.map((item) =>
        item.key === key
          ? {
              ...item,
              ...patch,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    }));
    return snapshot.integrations.find((item) => item.key === key) ?? null;
  },

  async listAlerts() {
    return (await settingsStorage.read()).alerts;
  },

  async upsertAlert(rule: SettingsAlertRule) {
    const snapshot = await nextSnapshot((state) => {
      const exists = state.alerts.some((item) => item.id === rule.id);
      return {
        ...state,
        alerts: exists
          ? state.alerts.map((item) => (item.id === rule.id ? rule : item))
          : [...state.alerts, rule],
      };
    });
    return snapshot.alerts;
  },

  async deleteAlert(id: string) {
    const snapshot = await nextSnapshot((state) => ({
      ...state,
      alerts: state.alerts.filter((item) => item.id !== id),
    }));
    return snapshot.alerts;
  },

  async listWorkflows() {
    return (await settingsStorage.read()).workflows;
  },

  async upsertWorkflow(rule: SettingsWorkflowRule) {
    const snapshot = await nextSnapshot((state) => {
      const exists = state.workflows.some((item) => item.id === rule.id);
      return {
        ...state,
        workflows: exists
          ? state.workflows.map((item) => (item.id === rule.id ? rule : item))
          : [...state.workflows, rule],
      };
    });
    return snapshot.workflows;
  },

  async saveNumbering(numbering: SettingsNumbering) {
    return (await nextSnapshot((snapshot) => ({ ...snapshot, numbering }))).numbering;
  },

  async getNumbering() {
    return (await settingsStorage.read()).numbering;
  },
};
