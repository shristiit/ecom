// src/app.ts
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';

import authRoutes from './routes/auth.routes';
import productRoutes from './routes/product.routes';
import { errorHandler } from './middlewares/errorHandler';

import catalogRoutes from './routes/catalog.routes';
import mediaRoutes from './routes/media.routes';
import inventoryRoutes from './routes/inventory.routes';
import locationsRoutes from './routes/locations.routes';
import poRoutes from './routes/po.routes';

const app = express();

// Middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan('dev'));

// Static files (your current ones)
app.use(
  '/static/uploads',
  express.static(path.join(process.cwd(), 'uploads'), {
    maxAge: '30d',
  })
);
// Local media storage (works with our media service; change MEDIA_ROOT later when you move to S3/CDN proxy)
app.use('/media', express.static(process.env.MEDIA_ROOT || '/var/data/media'));

// Routes- old routes 
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);


app.use('/api/catalog', catalogRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/locations', locationsRoutes);
 app.use('/api/pos', poRoutes);

// Healthcheck
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Error handler (keep LAST)
app.use(errorHandler);

export default app;
