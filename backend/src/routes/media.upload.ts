// src/routes/media.upload.ts
import express from 'express';
import multer from 'multer';
import sharp from 'sharp'; // for images (optional)
import crypto from 'node:crypto';
import Media from '../models/media.model';
import { LocalStorage } from '../storage/LocalStorage';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB
const storage = new LocalStorage({
  rootDir: process.env.MEDIA_ROOT || '/var/data/media',
  publicBaseUrl: process.env.MEDIA_BASE_URL || 'http://localhost:3000/media'
});

const router = express.Router();

/**
 * POST /api/media
 * body: multipart/form-data (field 'file')
 */
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });

    const { buffer, mimetype, originalname } = req.file;
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // store original
    const saved = await storage.putObject({ data: buffer, mime: mimetype });

    // optional: generate responsive variants for images
    let variants: IMedia['variants'] = [];
    if (mimetype.startsWith('image/')) {
      const sizes = [400, 800, 1200];
      for (const width of sizes) {
        const out = await sharp(buffer).resize({ width }).toFormat('webp').toBuffer();
        const v = await storage.putObject({
          key: saved.key.replace(/\.[^.]+$/, '') + `_${width}w.webp`,
          data: out, mime: 'image/webp'
        });
        variants.push({ key: v.key, width, bytes: v.bytes, mime: v.mime });
      }
    }

    const doc = await Media.create({
      type: mimetype.startsWith('video/') ? 'video' : 'image',
      provider: 'local',
      storageKey: saved.key,
      url: saved.url,                // optional cache
      mime: saved.mime,
      bytes: saved.bytes,
      checksumSha256: sha256,
      variants
    });

    res.json({ media: doc });
  } catch (e) { next(e); }
});

export default router;
