import type { InventoryMovement, PaginatedResponse } from '@/features/shared';
import { get, post } from '@/lib/api';
import type { InventoryAdjustmentInput, InventoryMovementsFilter, StockOnHandItem } from '../types/inventory.types';

export const inventoryService = {
  listMovements: (filters?: InventoryMovementsFilter) =>
    get<PaginatedResponse<InventoryMovement>>('/inventory/movements', { query: filters }),

  getStockOnHand: (filters?: { locationId?: string; sku?: string }) =>
    get<PaginatedResponse<StockOnHandItem>>('/inventory/stock-on-hand', { query: filters }),

  createAdjustment: (input: InventoryAdjustmentInput) =>
    post<{ id: string }>('/inventory/adjust', {
      skuId: input.skuId,
      locationId: input.locationId,
      qty: input.quantityDelta,
      reason: input.reasonCode,
      note: input.note,
    }),
};
