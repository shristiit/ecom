import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema(
  {
    cart:     { type: mongoose.Schema.Types.ObjectId, ref: 'Cart', required: true },
    product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, default: 1 },
    unitPrice:{ type: Number, required: true },
    addedAt:  { type: Date, default: Date.now },
  },
  { timestamps: false }
);

cartItemSchema.index({ cart: 1, product: 1 }, { unique: true });

export default mongoose.model('CartItem', cartItemSchema);
