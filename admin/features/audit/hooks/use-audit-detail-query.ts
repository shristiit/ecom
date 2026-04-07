import { queryKeys, useQuery } from '@admin/lib/query';
import { auditService } from '../services/audit.service';

export function useAuditDetailQuery(id: string | undefined, enabled = true) {
  return useQuery({
    key: queryKeys.audit.detail(id ?? 'unknown'),
    enabled: enabled && Boolean(id),
    queryFn: () => auditService.getById(id ?? ''),
  });
}
