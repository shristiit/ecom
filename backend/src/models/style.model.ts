import { Schema, model, Types, Document } from 'mongoose';

export interface IStyle extends Document<Types.ObjectId> {
  styleCode: string;                 // unique ops code
  title: string;
  slug: string;                      // unique SEO slug
  brandId?: Types.ObjectId;
  categoryId?: Types.ObjectId;
  supplierId?: Types.ObjectId;
  season?: string;
  tags: string[];
  attributes?: Map<string, unknown>;
  media: Types.ObjectId[];           // refs to Media
  status: 'draft' | 'active' | 'discontinued';
  publishedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const StyleSchema = new Schema<IStyle>(
  {
    styleCode:  { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 40 },
    title:      { type: String, required: true, trim: true },
    slug:       { type: String, required: true, trim: true, lowercase: true, unique: true },
    brandId:    { type: Schema.Types.ObjectId, ref: 'Brand', index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', index: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    season:     { type: String, trim: true },
    tags:       { type: [String], default: [] },
    attributes: { type: Map, of: Schema.Types.Mixed },
    media:      [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    status:     { type: String, enum: ['draft','active','discontinued'], default: 'draft', index: true },
    publishedAt:{ type: Date, default: null },
    deletedAt:  { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

StyleSchema.index({ styleCode: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
StyleSchema.index({ title: 'text', tags: 'text' }, { weights: { title: 5, tags: 1 } });

export default model<IStyle>('Style', StyleSchema);
