import type { AuditEvent, PaginatedResponse } from '@admin/features/shared';
import { get } from '@admin/lib/api';
import type { AuditQueryFilter } from '../types/audit.types';

type AuditRow = {
  id: string;
  transaction_id: string;
  request_text: string;
  who: string;
  approver?: string | null;
  before_after?: Record<string, unknown>;
  why?: string;
  created_at: string;
};

function mapAuditRow(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    tenantId: '',
    actorId: row.who,
    actorEmail: undefined,
    action: row.why ?? 'inventory.transaction',
    module: 'inventory',
    entityType: 'inventory_transaction',
    entityId: row.transaction_id,
    result: 'success',
    metadata: {
      beforeAfter: row.before_after ?? {},
      requestText: row.request_text,
      approver: row.approver,
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
