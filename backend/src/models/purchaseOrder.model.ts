import { Schema, model, Document, Types } from 'mongoose';

export type POStatus = 'DRAFT' | 'OPEN' | 'PARTIAL' | 'CLOSED' | 'CANCELLED';

export interface IPurchaseOrder extends Document<Types.ObjectId> {
  supplierId?: Types.ObjectId;
  status: POStatus;
  currency?: string;       // e.g., GBP/EUR/USD
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseOrderSchema = new Schema<IPurchaseOrder>(
  {
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    status:     { type: String, enum: ['DRAFT','OPEN','PARTIAL','CLOSED','CANCELLED'], default: 'OPEN', index: true },
    currency:   { type: String, default: 'GBP' },
  },
  { timestamps: true }
);

export default model<IPurchaseOrder>('PurchaseOrder', PurchaseOrderSchema);
