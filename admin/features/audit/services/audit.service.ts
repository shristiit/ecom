import type { AuditEvent, PaginatedResponse } from '@admin/features/shared';
import { get } from '@admin/lib/api';
import type { AuditQueryFilter } from '../types/audit.types';

type AuditRow = {
  id: string;
  source?: string;
  action: string;
  module?: string;
  entity_type?: string;
  entity_id?: string;
  result?: 'success' | 'failure' | 'warning';
  actor_id?: string;
  actor_email?: string | null;
  request_text?: string;
  why?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

function mapAuditRow(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    tenantId: '',
    actorId: row.actor_id,
    actorEmail: row.actor_email ?? undefined,
    action: row.action,
    module: row.module ?? 'inventory',
    entityType: row.entity_type,
    entityId: row.entity_id,
    result: row.result ?? 'success',
    metadata: row.metadata ?? {
      requestText: row.request_text,
      summary: row.why ?? null,
      source: row.source ?? row.module ?? 'inventory',
    },
    createdAt: row.created_at,
  };
}

export const auditService = {
  async query(filters?: AuditQueryFilter) {
    const payload = await get<AuditRow[]>('/audit/query', {
      query: {
        sizeId: filters?.actorId,
        from: filters?.fromDate,
        to: filters?.toDate,
      },
    });

    return {
      items: payload.map(mapAuditRow),
      pagination: {
        page: filters?.page ?? 1,
        pageSize: filters?.pageSize ?? payload.length,
        total: payload.length,
      },
    } satisfies PaginatedResponse<AuditEvent>;
  },

  async getById(id: string) {
    const payload = await get<AuditRow>(`/audit/${id}`);
    return mapAuditRow(payload);
  },

  exportCsv: (filters?: AuditQueryFilter) => get<string>('/audit/export.csv', { query: filters }),

  exportPdf: (filters?: AuditQueryFilter) => get<string>('/audit/export.pdf', { query: filters }),
};
