// src/storage/S3Storage.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'node:crypto';
import { StorageService, PutResult } from './storageService';

type S3Cfg = {
  bucket: string;
  publicBaseUrl?: string; // e.g., 'https://cdn.example.com' (CloudFront)
  region?: string;
};

export class S3Storage implements StorageService {
  private s3: S3Client;
  constructor(private cfg: S3Cfg) {
    this.s3 = new S3Client({ region: cfg.region || process.env.AWS_REGION });
  }

  private makeKey(ext = '') {
    const id = crypto.randomUUID().replace(/-/g, '');
    return `${id.slice(0,2)}/${id.slice(2,4)}/${ext ? `${id}.${ext}` : id}`;
  }

  async putObject(opts: { key?: string; data: Buffer; mime?: string }): Promise<PutResult> {
    const key = opts.key || this.makeKey(mimeToExt(opts.mime));
    await this.s3.send(new PutObjectCommand({
      Bucket: this.cfg.bucket,
      Key: key,
      Body: opts.data,
      ContentType: opts.mime,
      ACL: 'public-read', // or omit and use signed URLs/CDN origin access
    }));
    return {
      key,
      bytes: opts.data.length,
      mime: opts.mime || 'application/octet-stream',
      url: this.getPublicUrl(key),
    };
  }

  getPublicUrl(key: string) {
    if (this.cfg.publicBaseUrl) {
      return `${this.cfg.publicBaseUrl.replace(/\/+$/,'')}/${key}`;
    }
    // default S3 URL (not ideal; use CDN)
    return `https://${this.cfg.bucket}.s3.amazonaws.com/${key}`;
  }

  async deleteObject(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }
}

function mimeToExt(mime?: string) {
  if (!mime) return '';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/avif') return 'avif';
  if (mime === 'video/mp4') return 'mp4';
  return '';
}
