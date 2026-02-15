export type AuditQueryFilter = {
  page?: number;
  pageSize?: number;
  actorId?: string;
  module?: string;
  result?: 'success' | 'failure' | 'warning';
  fromDate?: string;
  toDate?: string;
};
