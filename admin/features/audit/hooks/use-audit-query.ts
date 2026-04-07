import { useMemo } from 'react';
import { queryKeys, useQuery } from '@admin/lib/query';
import { auditService } from '../services/audit.service';
import type { AuditQueryFilter } from '../types/audit.types';

export function useAuditQuery(filters?: AuditQueryFilter, enabled = true) {
  const filterKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);

  return useQuery({
    key: [...queryKeys.audit.all(), filterKey],
    enabled,
    queryFn: () => auditService.query(filters),
  });
}
