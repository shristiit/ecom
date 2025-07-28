import mongoose from 'mongoose';

const orderStatusHistorySchema = new mongoose.Schema(
  {
    sale:      { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
    oldStatus: String,
    newStatus: String,
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: false }
);

orderStatusHistorySchema.index({ sale: 1, changedAt: -1 });

export default mongoose.model('OrderStatusHistory', orderStatusHistorySchema);
