import type { PO, SO, PaginatedResponse } from '@/features/shared';
import { get } from '@/lib/api';
import type { PurchaseOrdersFilter, SalesOrdersFilter } from '../types/orders.types';

export const ordersService = {
  listSalesOrders: (filters?: SalesOrdersFilter) => get<PaginatedResponse<SO>>('/sales/invoice', { query: filters }),

  listPurchaseOrders: (filters?: PurchaseOrdersFilter) => get<PaginatedResponse<PO>>('/purchasing/po', { query: filters }),
};
