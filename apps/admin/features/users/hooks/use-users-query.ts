import { useMemo } from 'react';
import { queryKeys, useQuery } from '@/lib/query';
import { usersService } from '../services/users.service';
import type { UsersFilter } from '../types/users.types';

export function useUsersQuery(filters?: UsersFilter, enabled = true) {
  const filterKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);

  return useQuery({
    key: [...queryKeys.users.all(), filterKey],
    enabled,
    queryFn: () => usersService.listUsers(filters),
  });
}
