import mongoose from 'mongoose';

const productMediaSchema = new mongoose.Schema(
  {
    product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    mediaType:{ type: String, enum: ['image', 'video'], required: true },
    mediaUrl: { type: String, required: true },
    sortOrder:{ type: Number, default: 0 },
  },
  { timestamps: true }
);

productMediaSchema.index({ product: 1, sortOrder: 1 });

export default mongoose.model('ProductMedia', productMediaSchema);
