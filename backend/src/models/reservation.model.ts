import { Schema, model, Document, Types } from 'mongoose';

export type ReservationKind = 'ON_HAND' | 'INCOMING';
export type ReservationStatus = 'ACTIVE' | 'RELEASED' | 'CONSUMED' | 'EXPIRED';

export interface IReservation extends Document<Types.ObjectId> {
  orderId: Types.ObjectId;          // external order
  orderLineId: Types.ObjectId;      // external order line
  sizeId: Types.ObjectId;           // SizeVariant
  locationId: Types.ObjectId;       // Location
  qty: number;
  kind: ReservationKind;            // ON_HAND or INCOMING
  sourceId?: Types.ObjectId;        // PurchaseOrderLine when INCOMING
  eta?: Date | null;
  status: ReservationStatus;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ReservationSchema = new Schema<IReservation>(
  {
    orderId:     { type: Schema.Types.ObjectId, ref: 'Order', index: true },
    orderLineId: { type: Schema.Types.ObjectId, index: true },
    sizeId:      { type: Schema.Types.ObjectId, ref: 'SizeVariant', required: true, index: true },
    locationId:  { type: Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
    qty:         { type: Number, required: true },
    kind:        { type: String, enum: ['ON_HAND','INCOMING'], required: true },
    sourceId:    { type: Schema.Types.ObjectId }, // when INCOMING
    eta:         { type: Date, default: null },
    status:      { type: String, enum: ['ACTIVE','RELEASED','CONSUMED','EXPIRED'], default: 'ACTIVE', index: true },
    expiresAt:   { type: Date, default: null },
  },
  { timestamps: true }
);

ReservationSchema.index({ sizeId: 1, status: 1 });
ReservationSchema.index({ sourceId: 1, status: 1 });

export default model<IReservation>('Reservation', ReservationSchema);
