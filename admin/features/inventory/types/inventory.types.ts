import type { InventoryMovementType } from '@admin/features/shared';

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

export type StockOnHandFilter = {
  productName?: string;
  sku?: string;
  locationId?: string;
};

export type StockOnHandItem = {
  skuId: string;
  sku: string;
  productId?: string;
  productName?: string;
  sizeId?: string;
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

export type InventorySimpleTransactionInput = {
  sizeId: string;
  locationId: string;
  quantity: number;
  reason?: string;
};

export type InventoryTransferInput = {
  sizeId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  reason?: string;
};

export type InventoryReceipt = {
  id: string;
  poId?: string | null;
  supplierName?: string | null;
  locationCode?: string | null;
  status: 'partial' | 'complete' | string;
  lineCount: number;
  createdAt: string;
};
