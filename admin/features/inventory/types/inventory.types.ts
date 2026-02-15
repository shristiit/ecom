import type { InventoryMovementType } from '@/features/shared';

export type InventoryMovementsFilter = {
  page?: number;
  pageSize?: number;
  sku?: string;
  locationId?: string;
  movementType?: InventoryMovementType;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  fromDate?: string;
  toDate?: string;
};

export type StockOnHandItem = {
  skuId: string;
  sku: string;
  locationId: string;
  locationCode: string;
  onHand: number;
  reserved: number;
  available: number;
};

export type InventoryAdjustmentInput = {
  skuId: string;
  locationId: string;
  quantityDelta: number;
  reasonCode: string;
  note?: string;
};
