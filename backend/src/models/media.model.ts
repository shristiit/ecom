import { Schema, model, Types, Document } from 'mongoose';

export interface IMedia extends Document<Types.ObjectId> {
  productId: Types.ObjectId;
  url: string;
  type: 'image' | 'video';
  altText?: string;
  order?: number;
  createdAt: Date;   
}

const MediaSchema = new Schema<IMedia>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref:  'Product',
      required: true,
    },
    url:  { type: String, required: true },
    type: { type: String, enum: ['image', 'video'], required: true },
    altText: { type: String },
    order:   { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

MediaSchema.index({ productId: 1 });

export default model<IMedia>('Media', MediaSchema);
