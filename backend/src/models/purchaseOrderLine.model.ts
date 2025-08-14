import { Schema, model, Document, Types } from 'mongoose';

export interface IPurchaseOrderLine extends Document<Types.ObjectId> {
  poId: Types.ObjectId;          // PurchaseOrder
  sizeId: Types.ObjectId;        // SizeVariant
  qty: number;                   // ordered qty
  eta: Date;                     // expected date
  receivedQty: number;           // cumulative received
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseOrderLineSchema = new Schema<IPurchaseOrderLine>(
  {
    poId:        { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true, index: true },
    sizeId:      { type: Schema.Types.ObjectId, ref: 'SizeVariant', required: true, index: true },
    qty:         { type: Number, required: true },
    eta:         { type: Date, required: true, index: true },
    receivedQty: { type: Number, default: 0 },
  },
  { timestamps: true }
);

PurchaseOrderLineSchema.index({ poId: 1, sizeId: 1 });

export default model<IPurchaseOrderLine>('PurchaseOrderLine', PurchaseOrderLineSchema);
