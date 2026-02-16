import type { EntityId, ISODateString, Status } from './common';

export type ProductSku = {
  id: EntityId;
  sku: string;
  barcode?: string;
  color?: string;
  size?: string;
  status: Status;
};

export type Product = {
  id: EntityId;
  tenantId: EntityId;
  name: string;
  description?: string;
  categoryId?: EntityId;
  status: Status;
  skus: ProductSku[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type InventoryMovementType =
  | 'receive'
  | 'transfer'
  | 'adjust'
  | 'write_off'
  | 'cycle_count'
  | 'dispatch'
  | 'reserve'
  | 'release';

export type InventoryMovement = {
  id: EntityId;
  tenantId: EntityId;
  movementType: InventoryMovementType;
  skuId: EntityId;
  sku: string;
  quantity: number;
  fromLocationId?: EntityId;
  toLocationId?: EntityId;
  reasonCode?: string;
  referenceType?: 'purchase_order' | 'sales_order' | 'manual' | 'cycle_count';
  referenceId?: EntityId;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  createdBy: EntityId;
  createdAt: ISODateString;
};

export type PurchaseOrderLine = {
  id: EntityId;
  skuId: EntityId;
  sku: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
};

export type PurchaseOrderStatus = 'draft' | 'open' | 'partially_received' | 'closed' | 'cancelled';

export type PurchaseOrder = {
  id: EntityId;
  tenantId: EntityId;
  number: string;
  supplierId: EntityId;
  supplierName: string;
  status: PurchaseOrderStatus;
  currency: string;
  lines: PurchaseOrderLine[];
  lineCount?: number;
  totalCost?: number;
  orderedAt: ISODateString;
  expectedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type SalesOrderLine = {
  id: EntityId;
  skuId: EntityId;
  sku: string;
  qty: number;
  unitPrice: number;
};

export type SalesOrderStatus = 'draft' | 'sent' | 'paid' | 'dispatched' | 'cancelled';

export type SalesOrder = {
  id: EntityId;
  tenantId: EntityId;
  number: string;
  customerId: EntityId;
  customerName: string;
  status: SalesOrderStatus;
  currency: string;
  lines: SalesOrderLine[];
  lineCount?: number;
  subtotal: number;
  tax: number;
  total: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type UserRole = {
  id: EntityId;
  name: string;
};

export type User = {
  id: EntityId;
  tenantId: EntityId;
  email: string;
  fullName: string;
  status: 'active' | 'invited' | 'suspended' | 'disabled';
  roles: UserRole[];
  permissions: string[];
  lastActiveAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type AuditEventResult = 'success' | 'failure' | 'warning';

export type AuditEvent = {
  id: EntityId;
  tenantId: EntityId;
  actorId?: EntityId;
  actorEmail?: string;
  action: string;
  module: string;
  entityType?: string;
  entityId?: EntityId;
  result: AuditEventResult;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: ISODateString;
};

export type PO = PurchaseOrder;
export type SO = SalesOrder;
