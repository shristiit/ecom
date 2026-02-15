export type SalesOrdersFilter = {
  page?: number;
  pageSize?: number;
  status?: 'draft' | 'sent' | 'paid' | 'dispatched' | 'cancelled';
  customerId?: string;
};

export type PurchaseOrdersFilter = {
  page?: number;
  pageSize?: number;
  status?: 'draft' | 'open' | 'partially_received' | 'closed' | 'cancelled';
  supplierId?: string;
};
