import type { User } from '@/features/shared';
import { get } from '@/lib/api';
import type { Policy, Role, UsersFilter } from '../types/users.types';

export const usersService = {
  listUsers: (filters?: UsersFilter) => get<{ items: User[]; total: number }>('/admin/users', { query: filters }),

  listRoles: () => get<Role[]>('/admin/roles'),

  listPolicies: () => get<Policy[]>('/admin/policies'),
};
