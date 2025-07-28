import mongoose from 'mongoose';

const salesDetailSchema = new mongoose.Schema(
  {
    sale:      { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
    product:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity:  { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    lineTotal: { type: Number, required: true },
  },
  { timestamps: false }
);

salesDetailSchema.index({ sale: 1 });

export default mongoose.model('SalesDetail', salesDetailSchema);
