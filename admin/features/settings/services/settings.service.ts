import type {
  SettingsAlertRule,
  SettingsIntegration,
  SettingsNumbering,
  SettingsProfile,
  SettingsSnapshot,
  SettingsWorkflowRule,
} from '../types/settings.types';
import { settingsStorage } from './settings-storage';

function nextSnapshot(updater: (snapshot: SettingsSnapshot) => SettingsSnapshot) {
  const current = settingsStorage.read();
  const next = updater(current);
  settingsStorage.write(next);
  return next;
}

export const settingsService = {
  async getProfile() {
    return settingsStorage.read().profile;
  },

  async saveProfile(profile: SettingsProfile) {
    return nextSnapshot((snapshot) => ({ ...snapshot, profile })).profile;
  },

  async listIntegrations() {
    return settingsStorage.read().integrations;
  },

  async updateIntegration(key: SettingsIntegration['key'], patch: Partial<SettingsIntegration>) {
    const snapshot = nextSnapshot((state) => ({
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
    return settingsStorage.read().alerts;
  },

  async upsertAlert(rule: SettingsAlertRule) {
    const snapshot = nextSnapshot((state) => {
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
    const snapshot = nextSnapshot((state) => ({
      ...state,
      alerts: state.alerts.filter((item) => item.id !== id),
    }));
    return snapshot.alerts;
  },

  async listWorkflows() {
    return settingsStorage.read().workflows;
  },

  async upsertWorkflow(rule: SettingsWorkflowRule) {
    const snapshot = nextSnapshot((state) => {
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
    return nextSnapshot((snapshot) => ({ ...snapshot, numbering })).numbering;
  },

  async getNumbering() {
    return settingsStorage.read().numbering;
  },
};
