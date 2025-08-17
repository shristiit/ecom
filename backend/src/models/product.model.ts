import { Schema, model, Document, Types } from 'mongoose';

export type ProductStatus = 'active' | 'inactive' | 'draft' | 'archived';

export interface ProductDoc extends Document {
  styleNumber: string;      // unique product-level style number
  title: string;
  description?: string;
  price: number;            // base/list price (use cents to avoid float drift)
  attributes?: Record<string, any>; // brand, category, etc.
  status: ProductStatus;    // active/inactive for sales gating
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
}

const ProductSchema = new Schema<ProductDoc>(
  {
    styleNumber: { type: String, required: true, unique: true, index: true },
    title:       { type: String, required: true, index: true },
    description: { type: String },
    price:       { type: Number, required: true, min: 0 },
    attributes:  { type: Schema.Types.Mixed },
    status:      { type: String, enum: ['active','inactive','draft','archived'], default: 'draft', index: true },
    isDeleted:   { type: Boolean, default: false, index: true },
    createdBy:   { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy:   { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

ProductSchema.index({ title: 'text', description: 'text' });

export default model<ProductDoc>('Product', ProductSchema);
