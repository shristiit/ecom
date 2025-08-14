// src/storage/LocalStorage.ts
import path from 'node:path';
import { promises as fs } from 'node:fs';
import crypto from 'node:crypto';
import { StorageService, PutResult } from './storageService';

type LocalCfg = { rootDir: string; publicBaseUrl: string }; 
// rootDir e.g. '/var/data/media', publicBaseUrl e.g. 'http://localhost:3000/media'

export class LocalStorage implements StorageService {
  constructor(private cfg: LocalCfg) {}

  private makeKey(ext = '') {
    const id = crypto.randomUUID().replace(/-/g, '');
    // shard path to avoid huge directories: aa/bb/<id>.<ext>
    return path.posix.join(id.slice(0,2), id.slice(2,4), ext ? `${id}.${ext}` : id);
  }

  async putObject(opts: { key?: string; data: Buffer; mime?: string }): Promise<PutResult> {
    const ext = mimeToExt(opts.mime);
    const key = opts.key || this.makeKey(ext);
    const abs = path.join(this.cfg.rootDir, key);

    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, opts.data);

    return {
      key,
      bytes: opts.data.length,
      mime: opts.mime || 'application/octet-stream',
      url: this.getPublicUrl(key),
    };
  }

  getPublicUrl(key: string) {
    return `${this.cfg.publicBaseUrl.replace(/\/+$/,'')}/${key}`;
  }

  async deleteObject(key: string) {
    const abs = path.join(this.cfg.rootDir, key);
    await fs.unlink(abs).catch(() => {});
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
