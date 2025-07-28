import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    sku:            { type: String, required: true, unique: true, uppercase: true, trim: true },
    name:           { type: String, required: true },
    category:       { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    supplier:       { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    season:         String,
    color:          String,
    wholesalePrice: Number,
    rrp:            Number,
    priceExVat:     Number,
    priceIncVat:    Number,
    description:    String,
  },
  { timestamps: true }
);

productSchema.index({ sku: 1 });

export default mongoose.model('Product', productSchema);
