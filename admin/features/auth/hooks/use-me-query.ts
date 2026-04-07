import { queryKeys, useQuery } from '@admin/lib/query';
import { authService } from '../services/auth.service';

export function useMeQuery(enabled = true) {
  return useQuery({
    key: queryKeys.auth.me(),
    enabled,
    queryFn: authService.me,
  });
}
