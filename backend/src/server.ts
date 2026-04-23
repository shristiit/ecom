import './middlewares/async-errors.js';
import express from 'express';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import * as Sentry from '@sentry/node';
import { PORT, CORS_ORIGINS } from '@backend/config/env.js';
import { errorHandler } from '@backend/middlewares/error.js';
import { logger } from '@backend/utils/logger.js';
import { releaseExpiredReservations } from '@backend/modules/storefront/reservations.js';

import authRoutes from '@backend/modules/auth/routes.js';
import adminRoutes from '@backend/modules/admin/routes.js';
import productRoutes from '@backend/modules/products/routes.js';
import inventoryRoutes from '@backend/modules/inventory/routes.js';
import purchasingRoutes from '@backend/modules/purchasing/routes.js';
import salesRoutes from '@backend/modules/sales/routes.js';
import chatRoutes from '@backend/modules/chat/routes.js';
import auditRoutes from '@backend/modules/audit/routes.js';
import tenantRoutes from '@backend/modules/tenants/routes.js';
import masterRoutes from '@backend/modules/master/routes.js';
import storefrontRoutes from '@backend/modules/storefront/routes.js';
import aiGovernanceRoutes from '@backend/modules/ai_governance/routes.js';
import aiAuditRoutes from '@backend/modules/ai_audit/routes.js';
import reportingRoutes from '@backend/modules/reporting/routes.js';

const app = express();
const LOCAL_LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1']);
const LOCAL_STOCKAISLE_WEB_HOSTNAMES = new Set(['dev.stockaisle.test']);
const LOCAL_STOCKAISLE_WEB_PORTS = new Set(['', '8081', '19006', '3000']);

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    integrations: [Sentry.expressIntegration()],
  });
}

app.use(helmet());
const allowedOrigins = new Set(CORS_ORIGINS);

function isAllowedOrigin(origin: string): boolean {
  if (allowedOrigins.has(origin)) return true;

  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();

    if (url.protocol === 'https:' && (hostname === 'stockaisle.com' || hostname.endsWith('.stockaisle.com'))) {
      return true;
    }

    if (LOCAL_LOOPBACK_HOSTNAMES.has(hostname)) {
      return true;
    }

    if (LOCAL_STOCKAISLE_WEB_HOSTNAMES.has(hostname) && LOCAL_STOCKAISLE_WEB_PORTS.has(url.port)) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

const corsOptions: CorsOptions = {
  origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Accept', 'Authorization', 'Content-Type', 'Idempotency-Key', 'x-tenant-id'],
  exposedHeaders: ['Content-Type'],
  optionsSuccessStatus: 204,
  credentials: true,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
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
app.use('/api/ai-governance', aiGovernanceRoutes);
app.use('/api/ai-audit', aiAuditRoutes);
app.use('/api/reporting', reportingRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/storefront', storefrontRoutes);

if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`API running on http://localhost:${PORT}`);
});

// Reservation expiry sweeper (every 5 minutes)
setInterval(() => {
  releaseExpiredReservations().catch((err) => logger.error(err, 'reservation sweep failed'));
}, 5 * 60 * 1000);
