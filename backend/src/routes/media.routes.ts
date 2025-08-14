import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import sharp from 'sharp';
import Media from '../models/media.model';
import { LocalStorage } from '../storage/LocalStorage';
import { asyncHandler } from '../utils/asyncHandler';
import { attachMediaToStyle, attachMediaToSku, attachMediaToSize, detachMediaFromModel } from '../services/media.service';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const storage = new LocalStorage({
  rootDir: process.env.MEDIA_ROOT || '/var/data/media',
  publicBaseUrl: process.env.MEDIA_BASE_URL || 'http://localhost:3000/media'
});

const router = express.Router();

// Upload a single file -> creates a Media document
router.post('/', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const { buffer, mimetype } = req.file;
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  const saved = await storage.putObject({ data: buffer, mime: mimetype });

  // optional image variants
  const variants: any[] = [];
  if (mimetype.startsWith('image/')) {
    for (const width of [400, 800, 1200]) {
      const out = await sharp(buffer).resize({ width }).toFormat('webp').toBuffer();
      const v = await storage.putObject({ key: saved.key.replace(/\.[^.]+$/, '') + `_${width}w.webp`, data: out, mime: 'image/webp' });
      variants.push({ key: v.key, width, bytes: v.bytes, mime: v.mime });
    }
  }

  const media = await Media.create({
    type: mimetype.startsWith('video/') ? 'video' : 'image',
    provider: 'local',
    storageKey: saved.key,
    url: saved.url,
    mime: saved.mime,
    bytes: saved.bytes,
    checksumSha256: sha256,
    variants
  });

  res.json({ media });
}));

// Attach/detach
router.post('/styles/:id/attach', asyncHandler(async (req, res) => {
  const { mediaIds, mode } = req.body; // mediaIds: string[]
  const out = await attachMediaToStyle(req.params.id, mediaIds, mode);
  res.json({ style: out });
}));
router.post('/skus/:id/attach', asyncHandler(async (req, res) => {
  const { mediaIds, mode } = req.body;
  const out = await attachMediaToSku(req.params.id, mediaIds, mode);
  res.json({ sku: out });
}));
router.post('/sizes/:id/attach', asyncHandler(async (req, res) => {
  const { mediaIds, mode } = req.body;
  const out = await attachMediaToSize(req.params.id, mediaIds, mode);
  res.json({ size: out });
}));
router.delete('/:model/:modelId/:mediaId', asyncHandler(async (req, res) => {
  const out = await detachMediaFromModel(req.params.model as any, req.params.modelId, req.params.mediaId);
  res.json({ item: out });
}));

export default router;
