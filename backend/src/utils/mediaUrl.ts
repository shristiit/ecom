// src/utils/mediaUrl.ts
import Media from '../models/media.model';
import { LocalStorage } from '../storage/LocalStorage';
import { S3Storage } from '../storage/S3Storage';

const driver = process.env.MEDIA_DRIVER || 'local';

const storage =
  driver === 's3'
    ? new S3Storage({ bucket: process.env.AWS_S3_BUCKET!, publicBaseUrl: process.env.CDN_BASE_URL })
    : new LocalStorage({ rootDir: process.env.MEDIA_ROOT!, publicBaseUrl: process.env.MEDIA_BASE_URL! });

export function publicUrl(media: { provider: string; storageKey: string; url?: string }) {
  if (media.provider === driver) return storage.getPublicUrl(media.storageKey);
  // fallback to stored url if provider mismatch (during migration window)
  return media.url || storage.getPublicUrl(media.storageKey);
}
