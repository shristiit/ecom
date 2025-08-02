import { Schema, model, Types, Document, Model } from 'mongoose';

export interface IProduct extends Document<Types.ObjectId> {
  sku: string;
  name: string;
  category?: string;
  supplier?: string;
  season?: string;
  color?: string[];
  wholesalePrice?: number;
  rrp?: number;
  description: string;
  media: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

interface ProductModel extends Model<IProduct> {
  build(attrs: Omit<IProduct, '_id' | 'media' | 'createdAt' | 'updatedAt'>): Promise<IProduct>;
}

const ProductSchema = new Schema<IProduct, ProductModel>(
  {
    sku: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      minlength: 5,
      maxlength: 30,
    },
    name: { type: String, required: true, trim: true },
    category: { type: String, trim: true },
    supplier: { type: String, trim: true },
    season:   { type: String, trim: true },
    color:    { type: [String], default: [] },
    wholesalePrice: { type: Number, min: 0 },
    rrp:           { type: Number, min: 0 },
    description:   { type: String, required: true, trim: true },
    media:         [{ type: Schema.Types.ObjectId, ref: 'Media' }],
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON:   { getters: true, virtuals: true },
    toObject: {getters: true, virtuals: true },
  }
);

ProductSchema.index({ sku: 1 }, { unique: true });
ProductSchema.index({ name: 1 });


ProductSchema.statics.build = function (attrs) {
  return this.create(attrs);
};

export default model<IProduct, ProductModel>('Product', ProductSchema);
