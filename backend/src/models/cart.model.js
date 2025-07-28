import mongoose from 'mongoose';

const cartSchema = new mongoose.Schema(
  {
    user:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['active', 'checked_out', 'abandoned'], default: 'active' },
  },
  { timestamps: true }
);

cartSchema.index({ user: 1, status: 1 });

export default mongoose.model('Cart', cartSchema);
