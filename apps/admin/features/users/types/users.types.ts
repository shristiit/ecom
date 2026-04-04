export type UsersFilter = {
  page?: number;
  pageSize?: number;
  search?: string;
  roleId?: string;
  status?: 'active' | 'disabled';
};

export type Role = {
  id: string;
  name: string;
  permissions?: string[];
};

export type PolicyRule = {
  type: string;
  params: Record<string, unknown>;
};

export type Policy = {
  id: string;
  name: string;
  rules: PolicyRule[];
};

export type UserAuditItem = {
  id: string;
  created_at: string;
  why: string;
};

export type UserDetail = {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  status: 'active' | 'disabled';
  roles: Array<{ id: string; name: string }>;
  permissions: string[];
  lastActiveAt?: string;
  createdAt: string;
  updatedAt: string;
  recentAudit?: UserAuditItem[];
};
