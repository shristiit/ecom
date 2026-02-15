import type { AuditEvent, PaginatedResponse } from '@/features/shared';
import { get } from '@/lib/api';
import type { AuditQueryFilter } from '../types/audit.types';

export const auditService = {
  query: (filters?: AuditQueryFilter) => get<PaginatedResponse<AuditEvent>>('/audit/query', { query: filters }),

  exportCsv: (filters?: AuditQueryFilter) => get<string>('/audit/export.csv', { query: filters }),

  exportPdf: (filters?: AuditQueryFilter) => get<string>('/audit/export.pdf', { query: filters }),
};
