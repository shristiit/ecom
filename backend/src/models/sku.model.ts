import { Schema, model, Types, Document } from 'mongoose';

export interface ISku extends Document<Types.ObjectId> {
  styleId: Types.ObjectId;
  sku: string;                       // unique color-level SKU, e.g., ABC-BLK
  color: string;
  colorCode?: string;
  basePrice?: number;
  rrp?: number;
  wholesalePrice?: number;
  attributes?: Map<string, unknown>;
  media: Types.ObjectId[];           // color-level media (swatch/gallery)
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SkuSchema = new Schema<ISku>(
  {
    styleId:        { type: Schema.Types.ObjectId, ref: 'Style', required: true, index: true },
    sku:            { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 60 },
    color:          { type: String, required: true, trim: true },
    colorCode:      { type: String, trim: true },
    basePrice:      { type: Number, min: 0 },
    rrp:            { type: Number, min: 0 },
    wholesalePrice: { type: Number, min: 0 },
    attributes:     { type: Map, of: Schema.Types.Mixed, default: {} },
    media:          [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    isActive:       { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

SkuSchema.index({ sku: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
SkuSchema.index({ styleId: 1, color: 1 }, { unique: true }); // one color per style

export default model<ISku>('Sku', SkuSchema);
