// SKU = sellable unit (color + size) with optional barcode
import { Schema, model, Types, Document } from 'mongoose';

export interface ISku extends Document<Types.ObjectId> {
  sku: string;
  styleId: Types.ObjectId;
  color: string;
  size: string;
  barcode?: string;
  qrData?: string;
  price?: number;
  rrp?: number;
  wholesalePrice?: number;
  taxClass?: string;
  weight?: { value?: number; unit?: string };
  dimensions?: { l?: number; w?: number; h?: number; unit?: string };
  attributes?: Map<string, unknown>;
  media?: Types.ObjectId[]; // <— image/video refs
  isActive: boolean;
  hasStock: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SkuSchema = new Schema<ISku>(
  {
    sku:            { type: String, required: true, trim: true, uppercase: true, minlength: 5, maxlength: 40 },
    styleId:        { type: Schema.Types.ObjectId, ref: 'Style', required: true, index: true },
    color:          { type: String, required: true, trim: true, index: true },
    size:           { type: String, required: true, trim: true, index: true },
    barcode:        { type: String, trim: true, sparse: true },
    qrData:         { type: String, trim: true },
    price:          { type: Number, min: 0 },
    rrp:            { type: Number, min: 0 },
    wholesalePrice: { type: Number, min: 0 },
    taxClass:       { type: String, default: 'standard' },
    weight:         { value: { type: Number, min: 0 }, unit: { type: String, default: 'g' } },
    dimensions:     { l: Number, w: Number, h: Number, unit: { type: String, default: 'cm' } },
    attributes:     { type: Map, of: Schema.Types.Mixed, default: {} },
    media:          [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    isActive:       { type: Boolean, default: true, index: true },
    hasStock:       { type: Boolean, default: false, index: true }
  },
  { timestamps: true }
);

SkuSchema.index({ sku: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
SkuSchema.index({ styleId: 1, color: 1, size: 1 }, { unique: true });
SkuSchema.index({ barcode: 1 }, { unique: true, sparse: true, collation: { locale: 'en', strength: 2 } });
SkuSchema.index({ styleId: 1, isActive: 1, hasStock: 1 });

export default model<ISku>('Sku', SkuSchema);
