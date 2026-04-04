import { queryKeys, useQuery } from '@/lib/query';
import { usersService } from '../services/users.service';

export function usePoliciesQuery(enabled = true) {
  return useQuery({
    key: [...queryKeys.users.roles(), 'policies'],
    enabled,
    queryFn: () => usersService.listPolicies(),
  });
}
