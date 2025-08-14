// src/storage/StorageService.ts
export interface PutResult {
  key: string;      // storageKey
  bytes: number;
  mime: string;
  url?: string;     // optional public URL (local or signed)
}

export interface StorageService {
  putObject(opts: { key?: string; data: Buffer; mime?: string }): Promise<PutResult>;
  getPublicUrl(key: string): string;                     // derive from config/CDN
  deleteObject(key: string): Promise<void>;
}
