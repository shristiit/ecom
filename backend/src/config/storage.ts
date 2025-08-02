import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';


import fs from 'fs';
fs.mkdirSync(path.join(process.cwd(), 'uploads'), { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) =>
    cb(null, path.join(process.cwd(), 'uploads')),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const upload = multer({ storage });
