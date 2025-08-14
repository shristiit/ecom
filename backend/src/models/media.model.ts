// src/models/media.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export type MediaType = 'image' | 'video';
export type MediaRole = 'hero' | 'gallery' | 'swatch' | 'detail' | 'thumb';

export interface IMedia extends Document<Types.ObjectId> {
  type: MediaType;
  // Storage & addressing
  provider: 'local' | 's3' | 'gcs' | 'azure';
  storageKey: string;                // e.g. 'aa/bb/uuid.ext' (path within bucket/root)
  bucket?: string;                   // for object stores (S3/GCS); optional for local
  // Presentation (you can keep url if you like, but it can be derived)
  url?: string;                      // optional cached/public URL (can be regenerated)
  role?: MediaRole;
  order?: number;

  // Metadata
  mime?: string;
  bytes?: number;
  checksumSha256?: string;           // integrity / dedupe
  width?: number;                    // for images
  height?: number;                   // for images
  durationSec?: number;              // for videos
  posterKey?: string;                // optional: video poster image key
  altText?: string;
  variants?: Array<{
    key: string;                     // e.g. 'aa/bb/uuid_800w.jpg'
    width?: number;
    height?: number;
    bytes?: number;
    mime?: string;
  }>;
  metadata?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

const MediaSchema = new Schema<IMedia>(
  {
    type:      { type: String, enum: ['image','video'], required: true, index: true },
    provider:  { type: String, enum: ['local','s3','gcs','azure'], required: true, index: true },
    storageKey:{ type: String, required: true, trim: true, index: true },
    bucket:    { type: String, trim: true },
    url:       { type: String, trim: true },  // optional cache
    role:      { type: String, enum: ['hero','gallery','swatch','detail','thumb'], default: 'gallery', index: true },
    order:     { type: Number, default: 0, index: true },

    mime:        { type: String, trim: true },
    bytes:       { type: Number, min: 0 },
    checksumSha256: { type: String, trim: true },
    width:       { type: Number, min: 0 },
    height:      { type: Number, min: 0 },
    durationSec: { type: Number, min: 0 },
    posterKey:   { type: String, trim: true },
    altText:     { type: String, trim: true },

    variants: [{
      key:   { type: String, required: true, trim: true },
      width: { type: Number, min: 0 },
      height:{ type: Number, min: 0 },
      bytes: { type: Number, min: 0 },
      mime:  { type: String, trim: true },
      _id: false
    }],

    metadata:  { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Handy unique if you want to de-duplicate same content key:
MediaSchema.index({ provider: 1, storageKey: 1 }, { unique: true });

export default model<IMedia>('Media', MediaSchema);
