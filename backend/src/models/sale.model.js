import mongoose from 'mongoose';

const saleSchema = new mongoose.Schema(
  {
    saleDate:    { type: Date, default: Date.now },
    store:       { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who placed
    status:      { type: String, enum: ['Pending', 'Processing', 'Completed'], default: 'Pending' },
    totalAmount: { type: Number, required: true },
  },
  { timestamps: true }
);

saleSchema.index({ saleDate: -1 });
saleSchema.index({ store: 1 });

export default mongoose.model('Sale', saleSchema);
