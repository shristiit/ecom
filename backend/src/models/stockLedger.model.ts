import { Schema, model, Document, Types } from 'mongoose';

export type LedgerType =
  | 'ADJUSTMENT' | 'PURCHASE_RECEIPT' | 'SALE_ALLOCATE'  | 'SALE_DEALLOCATE' | 'PICK'| 'SHIP' | 'RETURN' | 'TRANSFER_OUT' | 'TRANSFER_IN';

export interface IStockLedger extends Document<Types.ObjectId> {
  sizeId: Types.ObjectId;           // SizeVariant
  locationId: Types.ObjectId;       // Location
  type: LedgerType;
  quantity: number;                 // +in / -out
  refType?: string;                 // 'Order' | 'PurchaseOrder' | ...
  refId?: Types.ObjectId;
  note?: string;
  createdBy?: Types.ObjectId;       // User
  createdAt: Date;
  updatedAt: Date;
}

const StockLedgerSchema = new Schema<IStockLedger>(
  {
    sizeId:     { type: Schema.Types.ObjectId, ref: 'SizeVariant', required: true, index: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
    type:       { type: String, required: true },
    quantity:   { type: Number, required: true },
    refType:    { type: String },
    refId:      { type: Schema.Types.ObjectId },
    note:       { type: String },
    createdBy:  { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

StockLedgerSchema.index({ sizeId: 1, locationId: 1, createdAt: -1 });

export default model<IStockLedger>('StockLedger', StockLedgerSchema);
