import mongoose from 'mongoose';

const stockSchema = new mongoose.Schema({
  product:         { type: mongoose.Schema.Types.ObjectId, ref: 'Product', unique: true },
  totalAvailable:  { type: Number, default: 0 },
  quantityOnOrder: { type: Number, default: 0 },
  freeToSell:      { type: Number, default: 0 },
  lastRestockDate: Date,
});

export default mongoose.model('Stock', stockSchema);
