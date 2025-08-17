import { Schema, model, Document, Types } from 'mongoose';

export interface ArchiveDoc extends Document {
  kind: 'product' | 'variant' | 'size';
  originalId: Types.ObjectId;
  snapshot: any;
  deletedBy?: Types.ObjectId;
  reason?: string;
  deletedAt: Date;
}

const ArchiveSchema = new Schema<ArchiveDoc>(
  {
    kind:       { type: String, enum: ['product','variant','size'], required: true, index: true },
    originalId: { type: Schema.Types.ObjectId, required: true, index: true },
    snapshot:   { type: Schema.Types.Mixed, required: true },
    deletedBy:  { type: Schema.Types.ObjectId, ref: 'User' },
    reason:     { type: String },
    deletedAt:  { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

// Optional TTL for cost control (e.g., keep 18 months):
// ArchiveSchema.index({ deletedAt: 1 }, { expireAfterSeconds: 18 * 30 * 24 * 3600 });

export default model<ArchiveDoc>('Archive', ArchiveSchema);
