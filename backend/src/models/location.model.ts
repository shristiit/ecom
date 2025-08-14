import { Schema, model, Document, Types } from 'mongoose';

export interface ILocation extends Document<Types.ObjectId> {
  code: string;                       // unique, e.g., WH-UK-01
  name: string;
  type: 'warehouse' | 'store' | 'dropship';
  address?: { line1?: string; city?: string; region?: string; postalCode?: string; country?: string };
  createdAt: Date;
  updatedAt: Date;
}

const LocationSchema = new Schema<ILocation>(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['warehouse','store','dropship'], default: 'warehouse' },
    address: {
      line1: String, city: String, region: String, postalCode: String, country: String
    },
  },
  { timestamps: true }
);

export default model<ILocation>('Location', LocationSchema);
