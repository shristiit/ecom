import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { PORT, CORS_ORIGIN } from './config/env.js';
import { errorHandler } from './middlewares/error.js';

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

const app = express();

app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

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

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
