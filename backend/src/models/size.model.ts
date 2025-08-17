import { Schema, model, Document, Types } from 'mongoose';

export interface InventoryByLocation {
  location: string;    // e.g., "WH1-Aisle4" or "London-Store-01"
  onHand: number;      // physically available now
  onOrder: number;     // incoming (POs)
  reserved: number;    // held for orders (optional)
}

export interface SizeDoc extends Document {
  variantId: Types.ObjectId;
  label: string;              // e.g., "S", "M", "UK 9"
  barcode: string;            // unique per size
  inventory: InventoryByLocation[];
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
}

const InventorySchema = new Schema<InventoryByLocation>({
  location: { type: String, required: true },
  onHand:   { type: Number, required: true, min: 0 },
  onOrder:  { type: Number, required: true, min: 0, default: 0 },
  reserved: { type: Number, required: true, min: 0, default: 0 }
}, { _id: false });

const SizeSchema = new Schema<SizeDoc>(
  {
    variantId: { type: Schema.Types.ObjectId, ref: 'Variant', required: true, index: true },
    label:     { type: String, required: true },
    barcode:   { type: String, required: true, unique: true, index: true },
    inventory: { type: [InventorySchema], default: [] },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

SizeSchema.index({ variantId: 1, label: 1 }, { unique: true });

export default model<SizeDoc>('Size', SizeSchema);
