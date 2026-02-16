import type { InventoryMovement, PaginatedResponse } from '@/features/shared';
import { get, post } from '@/lib/api';
import type {
  InventoryAdjustmentInput,
  InventoryMovementsFilter,
  InventoryReceipt,
  InventorySimpleTransactionInput,
  InventoryTransferInput,
  StockOnHandItem,
} from '../types/inventory.types';

type MovementRow = {
  id: string;
  tenant_id?: string;
  type: InventoryMovement['movementType'];
  sku_id: string;
  sku_code?: string;
  quantity: number;
  from_location_id?: string | null;
  to_location_id?: string | null;
  from_location_code?: string | null;
  to_location_code?: string | null;
  reason?: string;
  approved_by?: string | null;
  created_by?: string;
  actor_email?: string | null;
  recorded_time: string;
};

type StockRow = {
  sku_id?: string;
  sku?: string;
  sku_code?: string;
  product_id?: string;
  product_name?: string;
  size_id?: string;
  location_id?: string;
  location_code?: string;
  on_hand?: number;
  reserved?: number;
  available?: number;
};

type ReceiptRow = {
  id: string;
  po_id?: string | null;
  supplier_name?: string | null;
  location_code?: string | null;
  status: string;
  line_count?: number;
  created_at: string;
};

type PaginatedInput<T> =
  | T[]
  | {
      items: T[];
      pagination?: { page?: number; pageSize?: number; total?: number };
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

function toMovement(row: MovementRow): InventoryMovement {
  return {
    id: row.id,
    tenantId: row.tenant_id ?? '',
    movementType: row.type,
    skuId: row.sku_id,
    sku: row.sku_code ?? row.sku_id,
    quantity: Number(row.quantity ?? 0),
    fromLocationId: row.from_location_id ?? undefined,
    toLocationId: row.to_location_id ?? undefined,
    reasonCode: row.reason ?? undefined,
    referenceType: 'manual',
    referenceId: undefined,
    approvalStatus: row.approved_by ? 'approved' : 'pending',
    createdBy: row.created_by ?? row.actor_email ?? '',
    createdAt: row.recorded_time,
  };
}

function toStock(row: StockRow): StockOnHandItem {
  return {
    skuId: row.sku_id ?? '',
    sku: row.sku_code ?? row.sku ?? row.sku_id ?? '',
    productId: row.product_id,
    productName: row.product_name,
    sizeId: row.size_id,
    locationId: row.location_id ?? '',
    locationCode: row.location_code ?? '',
    onHand: Number(row.on_hand ?? 0),
    reserved: Number(row.reserved ?? 0),
    available: Number(row.available ?? Number(row.on_hand ?? 0) - Number(row.reserved ?? 0)),
  };
}

function toReceipt(row: ReceiptRow): InventoryReceipt {
  return {
    id: row.id,
    poId: row.po_id ?? null,
    supplierName: row.supplier_name ?? null,
    locationCode: row.location_code ?? null,
    status: row.status,
    lineCount: Number(row.line_count ?? 0),
    createdAt: row.created_at,
  };
}

export const inventoryService = {
  async listMovements(filters?: InventoryMovementsFilter) {
    const payload = await get<PaginatedInput<MovementRow>>('/inventory/movements', {
      query: {
        movementType: filters?.movementType,
        from: filters?.fromDate,
        to: filters?.toDate,
      },
    });
    return normalizePaginated(payload, toMovement);
  },

  async getStockOnHand(filters?: { locationId?: string; sku?: string }) {
    const payload = await get<StockRow[] | StockRow>('/inventory/stock-on-hand', { query: filters });
    if (Array.isArray(payload)) {
      return {
        items: payload.map(toStock),
        pagination: { page: 1, pageSize: payload.length, total: payload.length },
      } satisfies PaginatedResponse<StockOnHandItem>;
    }

    const single = toStock(payload);
    return {
      items: [single],
      pagination: { page: 1, pageSize: 1, total: 1 },
    } satisfies PaginatedResponse<StockOnHandItem>;
  },

  async listReceipts() {
    const payload = await get<ReceiptRow[]>('/inventory/receipts');
    return payload.map(toReceipt);
  },

  createAdjustment: (input: InventoryAdjustmentInput) =>
    post<{ id: string }>('/inventory/adjust', {
      sizeId: input.skuId,
      locationId: input.locationId,
      quantity: Math.abs(input.quantityDelta),
      reason: input.reasonCode,
      note: input.note,
      confirm: true,
    }),

  receive: (input: InventorySimpleTransactionInput) =>
    post<{ transactionId: string }>('/inventory/receive', {
      sizeId: input.sizeId,
      locationId: input.locationId,
      quantity: Math.abs(input.quantity),
      reason: input.reason,
      confirm: true,
    }),

  transfer: (input: InventoryTransferInput) =>
    post<{ transactionId: string }>('/inventory/transfer', {
      sizeId: input.sizeId,
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      quantity: Math.abs(input.quantity),
      reason: input.reason,
      confirm: true,
    }),

  writeOff: (input: InventorySimpleTransactionInput) =>
    post<{ transactionId: string }>('/inventory/write-off', {
      sizeId: input.sizeId,
      locationId: input.locationId,
      quantity: Math.abs(input.quantity),
      reason: input.reason,
      confirm: true,
    }),

  cycleCount: (input: InventorySimpleTransactionInput) =>
    post<{ transactionId: string }>('/inventory/cycle-count', {
      sizeId: input.sizeId,
      locationId: input.locationId,
      quantity: Math.abs(input.quantity),
      reason: input.reason ?? 'cycle_count',
      confirm: true,
    }),
};
