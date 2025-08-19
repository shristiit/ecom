import { Schema, model, Document, Types } from 'mongoose';

export interface MediaItem {
  url: string;             // store S3/Cloud CDN URLs (cost-efficient)
  type: 'image' | 'video';
  alt?: string;
  isPrimary?: boolean;
}

export interface VariantDoc extends Document {
  productId: Types.ObjectId;
  sku: string;             // unique per color
  color: {
    name: string;
    code?: string;         // hex like #FF00AA
  };
  media: MediaItem[];         
  isDeleted: boolean;
  status: 'active' | 'inactive';
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
}

const VariantSchema = new Schema<VariantDoc>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    sku:       { type: String, required: true },
    color:     {
      name: { type: String, required: true },
      code: { type: String }
    },
    media:     [{
      url: { type: String, required: true },
      type:{ type: String, enum: ['image','video'], required: true },
      alt: { type: String },
      isPrimary: { type: Boolean, default: false }
    }],
    isDeleted: { type: Boolean, default: false, index: true },
    status:    { type: String, enum: ['active','inactive'], default: 'active', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

VariantSchema.index({ sku: 1 }, { unique: true });
VariantSchema.index({ productId: 1, 'color.name': 1 });

export default model<VariantDoc>('Variant', VariantSchema);
