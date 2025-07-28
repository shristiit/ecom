import mongoose from 'mongoose';

const storeSchema = new mongoose.Schema(
  {
    user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true },
    name:        { type: String, required: true },
    managerName: String,
    email:       String,
    phoneNumber: String,
    vatNumber:   String,
    addressLine1:String,
    addressLine2:String,
    city:        String,
    region:      String,
    postalCode:  String,
    country:     String,
  },
  { timestamps: true }
);

storeSchema.index({ name: 1 });

export default mongoose.model('Store', storeSchema);

