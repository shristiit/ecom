import { queryKeys, useQuery } from '@/lib/query';
import { usersService } from '../services/users.service';

export function useRolesQuery(enabled = true) {
  return useQuery({
    key: queryKeys.users.roles(),
    enabled,
    queryFn: () => usersService.listRoles(),
  });
}
