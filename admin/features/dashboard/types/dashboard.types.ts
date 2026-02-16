export type DashboardKpi = {
  id: string;
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning' | 'error' | 'info';
  helper?: string;
};

export type DashboardAlert = {
  id: string;
  title: string;
  subtitle: string;
  tone: 'default' | 'success' | 'warning' | 'error' | 'info';
  href?: string;
};

export type DashboardQuickAction = {
  id: string;
  label: string;
  href: string;
};

export type DashboardMovement = {
  id: string;
  createdAt: string;
  sku: string;
  movementType: string;
  quantity: number;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
};

export type DashboardOverview = {
  kpis: DashboardKpi[];
  alerts: DashboardAlert[];
  quickActions: DashboardQuickAction[];
  recentMovements: DashboardMovement[];
};
