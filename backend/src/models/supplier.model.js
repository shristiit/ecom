import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true },
    contactName:  String,
    contactEmail: String,
    phone:        String,
    address:      String,
  },
  { timestamps: true }
);

export default mongoose.model('Supplier', supplierSchema);
