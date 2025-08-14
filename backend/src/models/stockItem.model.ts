import { Schema, model, Document, Types } from 'mongoose';

export interface IStockItem extends Document<Types.ObjectId> {
  sizeId: Types.ObjectId;            // SizeVariant
  locationId: Types.ObjectId;        // Location
  onHand: number;
  reservedOnHand: number;
  incoming: number;
  reservedIncoming: number;
  safetyStock: number;
  createdAt: Date;
  updatedAt: Date;
}

const StockItemSchema = new Schema<IStockItem>(
  {
    sizeId:          { type: Schema.Types.ObjectId, ref: 'SizeVariant', required: true, index: true },
    locationId:      { type: Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
    onHand:          { type: Number, default: 0 },
    reservedOnHand:  { type: Number, default: 0 },
    incoming:        { type: Number, default: 0 },
    reservedIncoming:{ type: Number, default: 0 },
    safetyStock:     { type: Number, default: 0 },
  },
  { timestamps: true }
);

StockItemSchema.index({ sizeId: 1, locationId: 1 }, { unique: true });

export default model<IStockItem>('StockItem', StockItemSchema);
