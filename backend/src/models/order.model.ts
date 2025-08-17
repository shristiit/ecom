import { Schema, model, Document } from "mongoose";

export interface IOrderProduct {
  name: string;
  price: number;
  quantity: number;
}

export interface IOrder extends Document {
  customer: string;
  products: IOrderProduct[];
  totalAmount: number;
  shippingAddress?: string;
  orderNumber: string; // auto-generated unique order number
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    customer: { type: String, required: true },
    products: [
      {
        name: { type: String, required: true },
        price: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
      },
    ],
    totalAmount: { type: Number, required: true, min: 0 },
    shippingAddress: { type: String },
    orderNumber: {
      type: String,
      unique: true,
      default: () => `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    },
  },
  { timestamps: true }
);

export default model<IOrder>("Order", orderSchema);

