import type { User } from '@admin/features/shared';
import { del, get, patch, post } from '@admin/lib/api';
import type { Policy, Role, UserDetail, UsersFilter } from '../types/users.types';

type UsersResponse = {
  items: User[];
  total: number;
  page?: number;
  pageSize?: number;
};

export const usersService = {
  listUsers: (filters?: UsersFilter) => get<UsersResponse>('/admin/users', { query: filters }),

  getUser: (id: string) => get<UserDetail>(`/admin/users/${id}`),

  updateUserStatus: (id: string, status: 'active' | 'disabled') =>
    patch<{ id: string; status: string }, { status: 'active' | 'disabled' }>(`/admin/users/${id}/status`, { status }),

  resetUserPassword: (id: string, newPassword: string) =>
    post<{ ok: boolean }, { newPassword: string }>(`/admin/users/${id}/reset-password`, { newPassword }),

  listRoles: () => get<Role[]>('/admin/roles'),

  createRole: (input: { name: string; permissions: string[] }) => post<Role, { name: string; permissions: string[] }>('/admin/roles', input),

  updateRole: (id: string, input: { name?: string; permissions?: string[] }) =>
    patch<Role, { name?: string; permissions?: string[] }>(`/admin/roles/${id}`, input),

  deleteRole: (id: string) => del<void>(`/admin/roles/${id}`),

  listPolicies: () => get<Policy[]>('/admin/policies'),

  createPolicy: (input: { name: string; rules: Policy['rules'] }) =>
    post<Policy, { name: string; rules: Policy['rules'] }>('/admin/policies', input),

  updatePolicy: (id: string, input: { name?: string; rules?: Policy['rules'] }) =>
    patch<Policy, { name?: string; rules?: Policy['rules'] }>(`/admin/policies/${id}`, input),

  deletePolicy: (id: string) => del<void>(`/admin/policies/${id}`),
};
