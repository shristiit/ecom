import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { connectDB } from './config/db';
import { PORT } from './config/env';

import authRoutes from './routes/auth.routes';
import productRoutes from './routes/product.routes';
import orderRoutes from './routes/order.route';
import { errorHandler } from './middlewares/errorHandler';

const app = express();

// Middleware
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

app.use(
  '/static/uploads',
  express.static(path.join(process.cwd(), 'uploads'), { maxAge: '30d' })
);

// (DEV ONLY) Stub a guest user so any leftover req.user._id access won't crash.
// Remove this once all controllers use: const actorId = req.user?._id ?? null;
app.use((req, _res, next) => {
  if (typeof (req as any).user === 'undefined') {
    (req as any).user = { _id: null, role: 'guest' };
  }
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);  // public products router (no guards)
app.use('/api/orders', orderRoutes);

// Healthcheck
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Error handler (keep last)
app.use(errorHandler);

const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

start();
