import { Schema, model, Document, Types } from 'mongoose';

export interface InventoryByLocation {
  location: string;
  onHand: number;   // physical count currently in warehouse
  onOrder: number;  // incoming (PO)
  reserved: number; // allocated to orders but not yet delivered
}

export interface SizeDoc extends Document {
  variantId: Types.ObjectId;
  label: string;
  barcode: string;
  inventory: InventoryByLocation[];
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;

  // virtuals for convenience in responses
  totalQuantity?: number;     // == sum(onHand)  (reserved is included here by definition)
  reservedTotal?: number;     // sum(reserved)
  sellableQuantity?: number;  // max(0, sum(onHand) - sum(reserved))
  quantity?: number;          // alias of totalQuantity for legacy use
}

const InventorySchema = new Schema<InventoryByLocation>(
  {
    location: { type: String, required: true },
    onHand:   { type: Number, required: true, min: 0 },
    onOrder:  { type: Number, required: true, min: 0, default: 0 },
    reserved: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

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

/** ---- Virtuals ---- */
// Sum of onHand across all locations (reserved still counts in total until delivery)
SizeSchema.virtual('totalQuantity').get(function (this: any) {
  return (this.inventory || []).reduce((s: number, x: any) => s + (x.onHand || 0), 0);
});

// Sum of reserved across all locations
SizeSchema.virtual('reservedTotal').get(function (this: any) {
  return (this.inventory || []).reduce((s: number, x: any) => s + (x.reserved || 0), 0);
});

// What you can sell right now = onHand - reserved (never below 0)
SizeSchema.virtual('sellableQuantity').get(function (this: any) {
  const onHand = (this.inventory || []).reduce((s: number, x: any) => s + (x.onHand || 0), 0);
  const reserved = (this.inventory || []).reduce((s: number, x: any) => s + (x.reserved || 0), 0);
  return Math.max(0, onHand - reserved);
});

// Legacy alias: quantity == totalQuantity
SizeSchema.virtual('quantity').get(function (this: any) {
  return (this.inventory || []).reduce((s: number, x: any) => s + (x.onHand || 0), 0);
});

// include virtuals in outputs
SizeSchema.set('toObject', { virtuals: true });
SizeSchema.set('toJSON',   { virtuals: true });

export default model<SizeDoc>('Size', SizeSchema);
