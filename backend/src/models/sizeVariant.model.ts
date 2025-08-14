import { Schema, model, Types, Document } from 'mongoose';

export interface ISizeVariant extends Document<Types.ObjectId> {
  skuId: Types.ObjectId;             
  size: string;                      
  barcode: string;                   
  qrData?: string;
  priceOverride?: number;
  weight?: { value?: number; unit?: string };
  dimensions?: { l?: number; w?: number; h?: number; unit?: string };
  media: Types.ObjectId[];        //size-specific media references
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SizeVariantSchema = new Schema<ISizeVariant>(
  {
    skuId:  { type: Schema.Types.ObjectId, ref: 'Sku', required: true, index: true },
    size:   { type: String, required: true, trim: true, index: true },
    barcode:{ type: String, required: true, trim: true },  // unique
    qrData: { type: String, trim: true },
    priceOverride: { type: Number, min: 0 },
    weight: {
      value: { type: Number, min: 0 },
      unit:  { type: String, default: 'g' },
    },
    dimensions: {
      l: Number, w: Number, h: Number,
      unit: { type: String, default: 'cm' },
    },
    media:   [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    isActive:{ type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// Uniqueness
SizeVariantSchema.index({ skuId: 1, size: 1 }, { unique: true });
SizeVariantSchema.index({ barcode: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export default model<ISizeVariant>('SizeVariant', SizeVariantSchema);
