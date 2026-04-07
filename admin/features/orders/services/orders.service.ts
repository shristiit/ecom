import type { PO, SO, PaginatedResponse } from '@admin/features/shared';
import { get, post } from '@admin/lib/api';
import type { PurchaseOrdersFilter, SalesOrdersFilter } from '../types/orders.types';

type PaginatedInput<T> =
  | T[]
  | {
      items: T[];
      pagination?: { page?: number; pageSize?: number; total?: number };
    };

type SalesOrderLineRow = {
  id: string;
  skuId: string;
  sku: string;
  qty: number;
  unitPrice: number;
};

type SalesOrderRow = {
  id: string;
  number?: string;
  customerId: string;
  customerName: string;
  status: SO['status'];
  currency?: string;
  lines?: SalesOrderLineRow[];
  lineCount?: number;
  subtotal?: number;
  tax?: number;
  total: number;
  createdAt: string;
  updatedAt: string;
};

type PurchaseOrderLineRow = {
  id: string;
  skuId: string;
  sku: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
};

type PurchaseOrderRow = {
  id: string;
  number?: string;
  supplierId: string;
  supplierName: string;
  status: PO['status'];
  currency?: string;
  lines?: PurchaseOrderLineRow[];
  lineCount?: number;
  totalCost?: number;
  orderedAt: string;
  expectedAt?: string;
  createdAt: string;
  updatedAt: string;
};

function normalizePaginated<TInput, TOutput>(
  payload: PaginatedInput<TInput>,
  mapItem: (item: TInput) => TOutput,
): PaginatedResponse<TOutput> {
  if (Array.isArray(payload)) {
    return {
      items: payload.map(mapItem),
      pagination: {
        page: 1,
        pageSize: payload.length,
        total: payload.length,
      },
    };
  }

  const items = payload.items ?? [];
  return {
    items: items.map(mapItem),
    pagination: {
      page: payload.pagination?.page ?? 1,
      pageSize: payload.pagination?.pageSize ?? items.length,
      total: payload.pagination?.total ?? items.length,
    },
  };
}

function toSalesOrder(row: SalesOrderRow): SO {
  return {
    id: row.id,
    tenantId: '',
    number: row.number ?? `SO-${row.id.slice(0, 8).toUpperCase()}`,
    customerId: row.customerId,
    customerName: row.customerName,
    status: row.status,
    currency: row.currency ?? 'USD',
    lines: (row.lines ?? []).map((line) => ({
      id: line.id,
      skuId: line.skuId,
      sku: line.sku,
      qty: Number(line.qty ?? 0),
      unitPrice: Number(line.unitPrice ?? 0),
    })),
    subtotal: Number(row.subtotal ?? row.total ?? 0),
    tax: Number(row.tax ?? 0),
    total: Number(row.total ?? 0),
    lineCount: row.lineCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPurchaseOrder(row: PurchaseOrderRow): PO {
  return {
    id: row.id,
    tenantId: '',
    number: row.number ?? `PO-${row.id.slice(0, 8).toUpperCase()}`,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    status: row.status,
    currency: row.currency ?? 'USD',
    lines: (row.lines ?? []).map((line) => ({
      id: line.id,
      skuId: line.skuId,
      sku: line.sku,
      qtyOrdered: Number(line.qtyOrdered ?? 0),
      qtyReceived: Number(line.qtyReceived ?? 0),
      unitCost: Number(line.unitCost ?? 0),
    })),
    lineCount: row.lineCount,
    totalCost: row.totalCost,
    orderedAt: row.orderedAt,
    expectedAt: row.expectedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const ordersService = {
  async listSalesOrders(filters?: SalesOrdersFilter) {
    const payload = await get<PaginatedInput<SalesOrderRow>>('/sales/invoice', { query: filters });
    return normalizePaginated(payload, toSalesOrder);
  },

  async getSalesOrder(id: string) {
    const payload = await get<SalesOrderRow>(`/sales/invoice/${id}`);
    return toSalesOrder(payload);
  },

  async createSalesOrder(payload: { customerId: string; lines: Array<{ sizeId: string; qty: number; unitPrice: number }> }) {
    return post<{ id: string }, { customerId: string; lines: Array<{ sizeId: string; qty: number; unitPrice: number }> }>(
      '/sales/invoice',
      payload,
    );
  },

  async dispatchSalesOrder(id: string, payload: { locationId: string; confirm: boolean }) {
    return post<{ id: string; status: string }, { locationId: string; confirm: boolean }>(
      `/sales/invoice/${id}/dispatch`,
      payload,
    );
  },

  async cancelSalesOrder(id: string) {
    return post<{ id: string; status: string }, { confirm: boolean }>(`/sales/invoice/${id}/cancel`, { confirm: true });
  },

  async listPurchaseOrders(filters?: PurchaseOrdersFilter) {
    const payload = await get<PaginatedInput<PurchaseOrderRow>>('/purchasing/po', { query: filters });
    return normalizePaginated(payload, toPurchaseOrder);
  },

  async getPurchaseOrder(id: string) {
    const payload = await get<PurchaseOrderRow>(`/purchasing/po/${id}`);
    return toPurchaseOrder(payload);
  },

  async createPurchaseOrder(payload: {
    supplierId: string;
    expectedDate?: string;
    lines: Array<{ sizeId: string; qty: number; unitCost: number }>;
  }) {
    return post<
      { id: string },
      { supplierId: string; expectedDate?: string; lines: Array<{ sizeId: string; qty: number; unitCost: number }> }
    >('/purchasing/po', payload);
  },

  async receivePurchaseOrder(
    id: string,
    payload: { locationId: string; lines: Array<{ sizeId: string; qty: number; unitCost: number }>; confirm: boolean },
  ) {
    return post<{ receiptId: string }, { locationId: string; lines: Array<{ sizeId: string; qty: number; unitCost: number }>; confirm: boolean }>(
      `/purchasing/po/${id}/receive`,
      payload,
    );
  },

  async closePurchaseOrder(id: string) {
    return post<{ id: string; status: string }, { confirm: boolean }>(`/purchasing/po/${id}/close`, { confirm: true });
  },
};
