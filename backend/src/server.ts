import './middlewares/async-errors.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import * as Sentry from '@sentry/node';
import { PORT, CORS_ORIGIN } from './config/env.js';
import { errorHandler } from './middlewares/error.js';
import { logger } from './utils/logger.js';
import { releaseExpiredReservations } from './modules/storefront/reservations.js';

import authRoutes from './modules/auth/routes.js';
import adminRoutes from './modules/admin/routes.js';
import productRoutes from './modules/products/routes.js';
import inventoryRoutes from './modules/inventory/routes.js';
import purchasingRoutes from './modules/purchasing/routes.js';
import salesRoutes from './modules/sales/routes.js';
import chatRoutes from './modules/chat/routes.js';
import auditRoutes from './modules/audit/routes.js';
import tenantRoutes from './modules/tenants/routes.js';
import masterRoutes from './modules/master/routes.js';
import storefrontRoutes from './modules/storefront/routes.js';

const app = express();

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
  app.use(Sentry.Handlers.requestHandler());
}

app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(pinoHttp({ logger }));

app.use(rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/purchasing', purchasingRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/storefront', storefrontRoutes);

if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`API running on http://localhost:${PORT}`);
});

// Reservation expiry sweeper (every 5 minutes)
setInterval(() => {
  releaseExpiredReservations().catch((err) => logger.error(err, 'reservation sweep failed'));
}, 5 * 60 * 1000);
