import { queryKeys, useQuery } from '@/lib/query';
import { usersService } from '../services/users.service';

export function useUserQuery(id: string | undefined, enabled = true) {
  return useQuery({
    key: [...queryKeys.users.all(), id ?? 'unknown'],
    enabled: enabled && Boolean(id),
    queryFn: () => usersService.getUser(id ?? ''),
  });
}
