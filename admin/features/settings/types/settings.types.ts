export type SettingsProfile = {
  tenantName: string;
  tenantSlug: string;
  supportEmail: string;
};

export type SettingsIntegrationStatus = 'connected' | 'not_connected' | 'error';

export type SettingsIntegration = {
  key: 'erp' | 'accounting' | 'sso' | 'webhooks';
  name: string;
  status: SettingsIntegrationStatus;
  endpoint?: string;
  updatedAt: string;
};

export type SettingsAlertRule = {
  id: string;
  name: string;
  threshold: number;
  severity: 'warning' | 'critical';
  enabled: boolean;
};

export type SettingsWorkflowRule = {
  id: string;
  action: string;
  approver: string;
  threshold: string;
  enabled: boolean;
};

export type SettingsNumbering = {
  salesOrderPattern: string;
  purchaseOrderPattern: string;
  invoicePattern: string;
};

export type SettingsSnapshot = {
  profile: SettingsProfile;
  integrations: SettingsIntegration[];
  alerts: SettingsAlertRule[];
  workflows: SettingsWorkflowRule[];
  numbering: SettingsNumbering;
};
