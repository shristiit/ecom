import { Router } from 'express';
import { authGuard, requireTenant, requirePermission } from '../../middlewares/auth.js';
import { idempotencyGuard } from '../../middlewares/idempotency.js';
import * as ctrl from './service.js';

const r = Router();

r.use(authGuard, requireTenant);
const idem = idempotencyGuard((req) => req.user?.tenantId ?? null);

r.get('/invoice', requirePermission('sales.write'), ctrl.listInvoices);
r.get('/invoice/:id', requirePermission('sales.write'), ctrl.getInvoice);
r.post('/invoice', requirePermission('sales.write'), idem, ctrl.createInvoice);
r.patch('/invoice/:id', requirePermission('sales.write'), idem, ctrl.updateInvoice);
r.post('/invoice/:id/dispatch', requirePermission('sales.write'), idem, ctrl.dispatchInvoice);
r.post('/invoice/:id/cancel', requirePermission('sales.write'), idem, ctrl.cancelInvoice);

export default r;
