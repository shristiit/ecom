import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { connectDB } from './config/db';
import { PORT } from './config/env';
import authRoutes from './routes/auth.routes';
import productRoutes from './routes/product.routes';
import { errorHandler } from './middlewares/errorHandler';
import path from 'path';

const app = express();

// Middleware
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

app.use(
  '/static/uploads',
  express.static(path.join(process.cwd(), 'uploads'), {
    maxAge: '30d',     
  })
);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products',productRoutes);

// Healthcheck
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Error handler
app.use(errorHandler);

const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};



start();
